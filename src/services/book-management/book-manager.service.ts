// src/services/book-management/book-manager.service.ts

import { DatabaseService } from '../database/database.service';
import { CompanyRepository, Company, CreateCompanyData } from '../database/repositories/company.repository';
import { SyncService } from '../sync/sync.service';
import { OrganizationService } from '../sync/send-to-platfrom/organization.service';

export interface BookConnectionResult {
  success: boolean;
  message: string;
  company?: Company;
  error?: string;
}

export class BookManagerService {
  private dbService: DatabaseService;
  private companyRepository: CompanyRepository;
  private syncServices: Map<number, SyncService> = new Map();
  private organizationService: OrganizationService | null = null;

  constructor(
    dbService: DatabaseService,
    companyRepository: CompanyRepository
  ) {
    this.dbService = dbService;
    this.companyRepository = companyRepository;
  }

  /**
   * ✅ Add/Connect a new Tally book with credentials
   */
  async addBook(
    billerId: string,
    bookData: {
      organization_id: string;
      tally_id: string;
      name: string;
      tally_username: string;
      tally_password: string;
      gstin?: string;
      address?: string;
      state?: string;
      country?: string;
      pin?: string;
      trn?: string;
      book_start_from?: string;
      auto_sync_enabled?: boolean;
      sync_interval_minutes?: number;
    }
  ): Promise<BookConnectionResult> {
    try {
      // 1. Create company record with credentials
      const company = await this.companyRepository.upsertCompany({
        biller_id: billerId,
        organization_id: bookData.organization_id,
        tally_id: bookData.tally_id,
        name: bookData.name,
        gstin: bookData.gstin,
        address: bookData.address,
        state: bookData.state,
        country: bookData.country || 'India',
        pin: bookData.pin,
        trn: bookData.trn,
        book_start_from: bookData.book_start_from || new Date().toISOString().split('T')[0],
        tally_username: bookData.tally_username,
        tally_password: bookData.tally_password,
        auto_sync_enabled: bookData.auto_sync_enabled,
        sync_interval_minutes: bookData.sync_interval_minutes
      });

      // 2. Initialize database for this company/book
      this.dbService.initializeDatabaseForBook(billerId, company.id);

      // 3. Create sync service for this book
      if (!this.organizationService) {
        this.organizationService = new OrganizationService(this.dbService);
      }
      const syncService = new SyncService(this.dbService, this.organizationService);
      this.syncServices.set(company.id, syncService);

      // 4. Test connection
      const isConnected = await this.testBookConnection(company.id);
      
      if (isConnected) {
        this.companyRepository.updateConnectionStatus(company.id, 'CONNECTED');
        return {
          success: true,
          message: `Book "${company.name}" connected successfully`,
          company
        };
      } else {
        this.companyRepository.updateConnectionStatus(
          company.id, 
          'ERROR', 
          'Failed to connect to Tally. Please verify credentials and ensure Tally is running.'
        );
        return {
          success: false,
          message: 'Failed to connect to Tally',
          company,
          error: 'Connection test failed'
        };
      }
    } catch (error: any) {
      return {
        success: false,
        message: 'Failed to add book',
        error: error.message || 'Unknown error'
      };
    }
  }

  /**
   * ✅ Test connection to a book
   */
  async testBookConnection(companyId: number): Promise<boolean> {
    const company = this.companyRepository.getCompanyWithCredentials(companyId);
    if (!company || !company.tally_username || !company.tally_password) {
      return false;
    }

    try {
      // Switch to this company's database
      this.dbService.switchDatabaseForBook(company.biller_id, companyId);

      // Test Tally connection using credentials
      // This would use Tally XML API with username/password
      // For now, we'll assume connection is valid if credentials exist
      // TODO: Implement actual Tally connection test
      
      return true;
    } catch (error) {
      console.error('Book connection test failed:', error);
      return false;
    }
  }

  /**
   * ✅ Switch active book (for manual operations)
   */
  async switchActiveBook(companyId: number, makeExclusive: boolean = false): Promise<void> {
    const company = this.companyRepository.getCompanyById(companyId);
    if (!company) {
      throw new Error('Company not found');
    }

    // Switch database
    this.dbService.switchDatabaseForBook(company.biller_id, companyId);

    // Set as active
    this.companyRepository.setActiveCompany(companyId, company.biller_id, makeExclusive);
  }

  /**
   * ✅ Get sync service for a book
   */
  getSyncServiceForBook(companyId: number): SyncService | null {
    // Check if sync service exists in cache
    if (this.syncServices.has(companyId)) {
      return this.syncServices.get(companyId)!;
    }

    // Create new sync service if company exists
    const company = this.companyRepository.getCompanyById(companyId);
    if (!company) {
      return null;
    }

    // Switch to this book's database
    this.dbService.switchDatabaseForBook(company.biller_id, companyId);

    // Create sync service
    if (!this.organizationService) {
      this.organizationService = new OrganizationService(this.dbService);
    }
    const syncService = new SyncService(this.dbService, this.organizationService);
    this.syncServices.set(companyId, syncService);

    return syncService;
  }

  /**
   * ✅ Sync a specific book
   */
  async syncBook(
    companyId: number, 
    type: 'MANUAL' | 'BACKGROUND' = 'MANUAL'
  ): Promise<void> {
    const syncService = this.getSyncServiceForBook(companyId);
    if (!syncService) {
      throw new Error('Sync service not found for this book');
    }

    const company = this.companyRepository.getCompanyById(companyId);
    if (!company) {
      throw new Error('Company not found');
    }

    // Switch to this book's database
    this.dbService.switchDatabaseForBook(company.biller_id, companyId);

    // Update sync status
    this.companyRepository.updateSyncStatus(companyId, 'SYNCING');

    try {
      const profile = await this.dbService.getProfile();
      if (!profile) {
        throw new Error('Profile not found');
      }

      if (type === 'MANUAL') {
        const profile = await this.dbService.getProfile();
        if (!profile) throw new Error('Profile not found');
        await syncService.manualSync(profile);
      } else {
        const profile = await this.dbService.getProfile();
        if (!profile) throw new Error('Profile not found');
        await syncService.startBackgroundSync(profile);
      }

      this.companyRepository.updateSyncStatus(
        companyId, 
        'ACTIVE', 
        new Date().toISOString()
      );
    } catch (error: any) {
      this.companyRepository.updateSyncStatus(companyId, 'ERROR');
      throw error;
    }
  }

  /**
   * ✅ Sync all active books
   */
  async syncAllActiveBooks(billerId: string): Promise<void> {
    const activeCompanies = this.companyRepository.getActiveCompanies(billerId);
    
    // Sync all active books in parallel
    const syncPromises = activeCompanies
      .filter(company => company.auto_sync_enabled === 1)
      .map(company => 
        this.syncBook(company.id, 'BACKGROUND').catch(error => {
          console.error(`Sync failed for book ${company.name}:`, error);
          this.companyRepository.updateSyncStatus(company.id, 'ERROR');
        })
      );

    await Promise.all(syncPromises);
  }

  /**
   * ✅ Remove/Disconnect a book
   */
  async removeBook(companyId: number): Promise<void> {
    const company = this.companyRepository.getCompanyById(companyId);
    if (!company) {
      throw new Error('Company not found');
    }

    // Stop sync service
    const syncService = this.syncServices.get(companyId);
    if (syncService) {
      syncService.stopBackgroundSync();
      this.syncServices.delete(companyId);
    }

    // Close database connection
    const dbKey = `${company.biller_id}_${companyId}`;
    // Note: Database connections are managed by DatabaseService

    // Delete company record (cascade will handle related data)
    this.companyRepository.deleteCompany(companyId);
  }

  /**
   * ✅ Get all books for a biller
   */
  getAllBooks(billerId: string): Company[] {
    return this.companyRepository.getAllCompanies(billerId);
  }

  /**
   * ✅ Get active books for a biller
   */
  getActiveBooks(billerId: string): Company[] {
    return this.companyRepository.getActiveCompanies(billerId);
  }

  /**
   * ✅ Update book credentials
   */
  async updateBookCredentials(
    companyId: number,
    credentials: {
      tally_username?: string;
      tally_password?: string;
    }
  ): Promise<Company> {
    const company = this.companyRepository.getCompanyById(companyId);
    if (!company) {
      throw new Error('Company not found');
    }

    // Update company with new credentials
    const updated = await this.companyRepository.upsertCompany({
      biller_id: company.biller_id,
      organization_id: company.organization_id,
      tally_id: company.tally_id,
      name: company.name,
      gstin: company.gstin,
      address: company.address,
      state: company.state,
      country: company.country,
      pin: company.pin,
      trn: company.trn,
      book_start_from: company.book_start_from,
      tally_username: credentials.tally_username || company.tally_username,
      tally_password: credentials.tally_password, // Will be encrypted in upsertCompany
      auto_sync_enabled: company.auto_sync_enabled === 1,
      sync_interval_minutes: company.sync_interval_minutes
    });

    // Test connection with new credentials
    const isConnected = await this.testBookConnection(companyId);
    if (isConnected) {
      this.companyRepository.updateConnectionStatus(companyId, 'CONNECTED');
    } else {
      this.companyRepository.updateConnectionStatus(companyId, 'ERROR', 'Invalid credentials');
    }

    return updated;
  }

  /**
   * ✅ Get book sync status
   */
  getBookSyncStatus(companyId: number): {
    company: Company;
    isConnected: boolean;
    syncStatus: string;
    lastSyncedAt?: string;
  } | null {
    const company = this.companyRepository.getCompanyById(companyId);
    if (!company) {
      return null;
    }

    return {
      company,
      isConnected: company.connection_status === 'CONNECTED',
      syncStatus: company.sync_status || 'INACTIVE',
      lastSyncedAt: company.last_synced_at
    };
  }
}
