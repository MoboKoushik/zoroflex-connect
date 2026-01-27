// src/services/sync/sync.service.ts (Updated Full Sync Logic with Proper First Sync Handling)
import { DatabaseService, UserProfile } from '../database/database.service';
import { fetchCurrentCompany } from './fetch-to-tally/fetchCurrentCompany';
import { syncCustomers } from './fetch-to-tally/syncCustomers.service';
import { syncInvoices } from './fetch-to-tally/syncInvoices.service';
import { syncPayments } from './fetch-to-tally/syncPayments.service';
import { syncJournalVouchers } from './fetch-to-tally/syncJournalVouchers.service';
import { OrganizationService } from './send-to-platfrom/organization.service';
import { SyncDateManager, SyncType, EntityType } from './sync-date-manager';
import { CompanyRepository } from '../database/repositories/company.repository';
import { setTallyUrl } from '../tally/batch-fetcher';
import { getTallyUrl } from '../config/tally-url-helper';


export class SyncService {
  private dbService: DatabaseService;
  private organizationService: OrganizationService;
  private syncDateManager: SyncDateManager;
  private companyRepository: CompanyRepository;
  private isRunning = false;
  private backgroundSyncInterval: NodeJS.Timeout | null = null;

  constructor(dbService: DatabaseService, organizationService: OrganizationService) {
    this.dbService = dbService;
    this.organizationService = organizationService;
    this.syncDateManager = new SyncDateManager(dbService);
    this.companyRepository = new CompanyRepository(dbService);
  }

  /**
   * Initialize Tally URL from settings before sync operations
   */
  private async initializeTallyUrl(): Promise<void> {
    const tallyUrl = await getTallyUrl(this.dbService);
    setTallyUrl(tallyUrl);
    this.dbService.log('INFO', `Tally URL set to: ${tallyUrl}`);
  }

  private async fullSync(profile: UserProfile, type: 'MANUAL' | 'BACKGROUND' = 'BACKGROUND'): Promise<void> {
    if (this.isRunning) {
      this.dbService.log('WARN', 'Sync already in progress; skipping this run');
      return;
    }
    this.isRunning = true;

    try {
      // Initialize Tally URL from settings
      await this.initializeTallyUrl();

      this.dbService.log('INFO', `${type} sync initiated`);

      // 1. Fetch current company from Tally
      const companyData = await fetchCurrentCompany(this.dbService);
      if (!companyData) {
        throw new Error('Please select your company in Tally Prime software');
      }

      // 2. Validate organization matches
      const prof = await this.dbService.getProfile();
      const profileOrgId = prof?.organization?.response?.organization_id?.trim() || '';

      // Get organization_id from BILLER data (new format) or fallback to old format
      const billerData = companyData.BILLER_DATA || companyData;
      const tallyOrgId = (billerData.ORGANIZATION_ID || companyData.COMPANYNUMBER || '').trim();

      if (profileOrgId && tallyOrgId && profileOrgId !== tallyOrgId) {
        throw new Error('Please select your company in Tally Prime software');
      }

      // 3. Sync Organization (only on MANUAL or first time)
      if (type === 'MANUAL' || !prof?.organization?.synced_at) {
        this.dbService.log('INFO', 'Syncing organization data');
        await this.organizationService.syncOrganization(profile, companyData);
      }

      // 4. Get active company
      const activeCompany = this.companyRepository.getActiveCompany(profile.biller_id || '');
      if (!activeCompany) {
        if (type === 'MANUAL') {
          throw new Error('No active company selected. Please select a company first.');
        } else {
          // For background sync, just log and return silently
          this.dbService.log('INFO', 'Background sync skipped: No active company selected');
          return;
        }
      }

      // 5. Determine date range using SyncDateManager
      const syncType: SyncType = type === 'MANUAL' ? 'full' : 'fresh';
      const toDate = this.syncDateManager.getSyncEndDate();

      if (type === 'MANUAL') {
        // Manual sync: Full sync from BOOKSTARTFROM
        this.dbService.log('INFO', 'Manual sync: Performing full sync from BOOKSTARTFROM', {
          book_start_from: activeCompany.book_start_from,
          to_date: toDate
        });

        const fromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'ALL', 'full');
        
        // Perform full sync for all entities
        await syncCustomers(profile, 'first', fromDate, toDate, this.dbService);
        await syncInvoices(profile, 'first', fromDate, toDate, this.dbService);
        await syncPayments(profile, 'first', fromDate, toDate, this.dbService);
        await syncJournalVouchers(profile, 'first', fromDate, toDate, this.dbService);

      } else {
        // BACKGROUND sync: Check per-entity first sync status
        this.dbService.log('INFO', 'Background sync: Checking per-entity first sync status');
        const toDate = this.syncDateManager.getSyncEndDate();

        // Customer sync
        const customerIsFirstSyncComplete = await this.dbService.isEntityFirstSyncCompleted('CUSTOMER');
        const customerIncompleteBatches = await this.dbService.getIncompleteSyncBatches('CUSTOMER');
        
        // Only run first sync if it's not complete AND (needs first sync OR has incomplete batches)
        if (!customerIsFirstSyncComplete && customerIncompleteBatches.length > 0) {
          this.dbService.log('INFO', `CUSTOMER has ${customerIncompleteBatches.length} incomplete batches, resuming first sync`);
          const customerFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'CUSTOMER', 'fresh');
          await syncCustomers(profile, 'first', customerFromDate, toDate, this.dbService);
          
          // Check if first sync is now complete
          const stillIncomplete = await this.dbService.getIncompleteSyncBatches('CUSTOMER');
          if (stillIncomplete.length === 0) {
            await this.dbService.completeEntityFirstSync('CUSTOMER');
            this.dbService.log('INFO', 'CUSTOMER first sync completed, marked as complete');
          }
        } else if (!customerIsFirstSyncComplete) {
          // First sync needed
          this.dbService.log('INFO', 'CUSTOMER first sync needed, running first sync');
          const customerFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'CUSTOMER', 'fresh');
          await syncCustomers(profile, 'first', customerFromDate, toDate, this.dbService);
          
          // Check if first sync is now complete
          const stillIncomplete = await this.dbService.getIncompleteSyncBatches('CUSTOMER');
          if (stillIncomplete.length === 0) {
            await this.dbService.completeEntityFirstSync('CUSTOMER');
            this.dbService.log('INFO', 'CUSTOMER first sync completed, marked as complete');
          }
        } else {
          // First sync complete, run incremental sync
          this.dbService.log('INFO', 'CUSTOMER first sync complete, running incremental sync');
          await syncCustomers(profile, 'incremental', undefined, undefined, this.dbService);
        }

        // Invoice sync
        const invoiceIsFirstSyncComplete = await this.dbService.isEntityFirstSyncCompleted('INVOICE');
        const invoiceIncompleteMonths = await this.dbService.getIncompleteMonths('INVOICE');
        
        // // Only run first sync if it's not complete AND has incomplete months
        if (!invoiceIsFirstSyncComplete && invoiceIncompleteMonths.length > 0) {
          this.dbService.log('INFO', `INVOICE has incomplete months: ${invoiceIncompleteMonths.join(', ')}, resuming first sync`);
          const invoiceFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'INVOICE', 'fresh');
          await syncInvoices(profile, 'first', invoiceFromDate, toDate, this.dbService);
          
          // Check if first sync is now complete
          const stillIncomplete = await this.dbService.getIncompleteMonths('INVOICE');
          if (stillIncomplete.length === 0) {
            await this.dbService.completeEntityFirstSync('INVOICE');
            this.dbService.log('INFO', 'INVOICE first sync completed, marked as complete');
          }
        } else if (!invoiceIsFirstSyncComplete) {
          // First sync needed
          this.dbService.log('INFO', 'INVOICE first sync needed, running first sync');
          const invoiceFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'INVOICE', 'fresh');
          await syncInvoices(profile, 'first', invoiceFromDate, toDate, this.dbService);
          
          // Check if first sync is now complete
          const stillIncomplete = await this.dbService.getIncompleteMonths('INVOICE');
          if (stillIncomplete.length === 0) {
            await this.dbService.completeEntityFirstSync('INVOICE');
            this.dbService.log('INFO', 'INVOICE first sync completed, marked as complete');
          }
        } else {
          // First sync complete, run incremental sync
          this.dbService.log('INFO', 'INVOICE first sync complete, running incremental sync');
          await syncInvoices(profile, 'incremental', undefined, undefined, this.dbService);
        }

        // Payment sync
        const paymentIsFirstSyncComplete = await this.dbService.isEntityFirstSyncCompleted('PAYMENT');
        const paymentIncompleteMonths = await this.dbService.getIncompleteMonths('PAYMENT');
        
        // Only run first sync if it's not complete AND has incomplete months
        if (!paymentIsFirstSyncComplete && paymentIncompleteMonths.length > 0) {
          this.dbService.log('INFO', `PAYMENT has incomplete months: ${paymentIncompleteMonths.join(', ')}, resuming first sync`);
          const paymentFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'PAYMENT', 'fresh');
          await syncPayments(profile, 'first', paymentFromDate, toDate, this.dbService);
          
          // Check if first sync is now complete
          const stillIncomplete = await this.dbService.getIncompleteMonths('PAYMENT');
          if (stillIncomplete.length === 0) {
            await this.dbService.completeEntityFirstSync('PAYMENT');
            this.dbService.log('INFO', 'PAYMENT first sync completed, marked as complete');
          }
        } else if (!paymentIsFirstSyncComplete) {
          // First sync needed
          this.dbService.log('INFO', 'PAYMENT first sync needed, running first sync');
          const paymentFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'PAYMENT', 'fresh');
          await syncPayments(profile, 'first', paymentFromDate, toDate, this.dbService);
          
          // Check if first sync is now complete
          const stillIncomplete = await this.dbService.getIncompleteMonths('PAYMENT');
          if (stillIncomplete.length === 0) {
            await this.dbService.completeEntityFirstSync('PAYMENT');
            this.dbService.log('INFO', 'PAYMENT first sync completed, marked as complete');
          }
        } else {
          // First sync complete, run incremental sync
          this.dbService.log('INFO', 'PAYMENT first sync complete, running incremental sync');
          await syncPayments(profile, 'incremental', undefined, undefined, this.dbService);
        }

        // Journal Voucher sync
        const jvIsFirstSyncComplete = await this.dbService.isEntityFirstSyncCompleted('JOURNAL');
        const jvIncompleteMonths = await this.dbService.getIncompleteMonths('JOURNAL');
        
        // Only run first sync if it's not complete AND has incomplete months
        if (!jvIsFirstSyncComplete && jvIncompleteMonths.length > 0) {
          this.dbService.log('INFO', `JOURNAL has incomplete months: ${jvIncompleteMonths.join(', ')}, resuming first sync`);
          const jvFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'JOURNAL', 'fresh');
          await syncJournalVouchers(profile, 'first', jvFromDate, toDate, this.dbService);
          
          // Check if first sync is now complete
          const stillIncomplete = await this.dbService.getIncompleteMonths('JOURNAL');
          if (stillIncomplete.length === 0) {
            await this.dbService.completeEntityFirstSync('JOURNAL');
            this.dbService.log('INFO', 'JOURNAL first sync completed, marked as complete');
          }
        } else if (!jvIsFirstSyncComplete) {
          // First sync needed
          this.dbService.log('INFO', 'JOURNAL first sync needed, running first sync');
          const jvFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'JOURNAL', 'fresh');
          await syncJournalVouchers(profile, 'first', jvFromDate, toDate, this.dbService);
          
          // Check if first sync is now complete
          const stillIncomplete = await this.dbService.getIncompleteMonths('JOURNAL');
          if (stillIncomplete.length === 0) {
            await this.dbService.completeEntityFirstSync('JOURNAL');
            this.dbService.log('INFO', 'JOURNAL first sync completed, marked as complete');
          }
        } else {
          // First sync complete, run incremental sync
          this.dbService.log('INFO', 'JOURNAL first sync complete, running incremental sync');
          await syncJournalVouchers(profile, 'incremental', undefined, undefined, this.dbService);
        }

        // Check if all entities have completed first sync - if yes, dump database to backend
        const allComplete = await this.dbService.areAllEntitiesFirstSyncComplete();
        if (allComplete) {
          this.dbService.log('INFO', 'All entities first sync complete, dumping database to backend');
          const currentOrgUuid = this.dbService.getCurrentOrganizationUuid();
          if (currentOrgUuid && profile.biller_id) {
            await this.dbService.dumpDatabaseToBackend(profile.biller_id, currentOrgUuid);
          }
        }
      }

      await this.dbService.updateLastSuccessfulSync();
      this.dbService.log('INFO', `${type} sync completed successfully`);

    } catch (error: any) {
      this.dbService.log('ERROR', `${type} sync failed`, { error: error?.message || error });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  // Manual sync - smart sync (per-entity status check করে)
  async manualSync(profile: UserProfile): Promise<void> {
    this.dbService.log('INFO', 'Manual sync requested - performing smart sync (per-entity status check)');

    if (this.isRunning) {
      this.dbService.log('WARN', 'Sync already in progress; skipping this run');
      return;
    }
    this.isRunning = true;

    try {
      // Initialize Tally URL from settings
      await this.initializeTallyUrl();

      this.dbService.log('INFO', 'MANUAL sync initiated');

      // 1. Fetch current company from Tally
      const companyData = await fetchCurrentCompany(this.dbService);
      if (!companyData) {
        throw new Error('Please select your company in Tally Prime software');
      }

      // 2. Validate organization matches
      const prof = await this.dbService.getProfile();
      const profileOrgId = prof?.organization?.response?.organization_id?.trim() || '';
      const billerData = companyData.BILLER_DATA || companyData;
      const tallyOrgId = (billerData.ORGANIZATION_ID || companyData.COMPANYNUMBER || '').trim();

      if (profileOrgId && tallyOrgId && profileOrgId !== tallyOrgId) {
        throw new Error('Please select your company in Tally Prime software');
      }

      // 3. Sync Organization (only on first time)
      if (!prof?.organization?.synced_at) {
        this.dbService.log('INFO', 'Syncing organization data');
        await this.organizationService.syncOrganization(profile, companyData);
      }

      // 4. Get active company
      const activeCompany = this.companyRepository.getActiveCompany(profile.biller_id || '');
      if (!activeCompany) {
        throw new Error('No active company selected. Please select a company first.');
      }

      // 5. Smart sync: Check per-entity first sync status
      this.dbService.log('INFO', 'Manual sync: Checking per-entity first sync status');
      const toDate = this.syncDateManager.getSyncEndDate();

      // Customer sync
      const customerIsFirstSyncComplete = await this.dbService.isEntityFirstSyncCompleted('CUSTOMER');
      const customerIncompleteBatches = await this.dbService.getIncompleteSyncBatches('CUSTOMER');
      
      // Only run first sync if it's not complete AND (needs first sync OR has incomplete batches)
      if (!customerIsFirstSyncComplete && customerIncompleteBatches.length > 0) {
        this.dbService.log('INFO', `CUSTOMER has ${customerIncompleteBatches.length} incomplete batches, resuming first sync`);
        const customerFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'CUSTOMER', 'fresh');
        await syncCustomers(profile, 'first', customerFromDate, toDate, this.dbService);
        
        // Check if first sync is now complete
        const stillIncomplete = await this.dbService.getIncompleteSyncBatches('CUSTOMER');
        if (stillIncomplete.length === 0) {
          await this.dbService.completeEntityFirstSync('CUSTOMER');
          this.dbService.log('INFO', 'CUSTOMER first sync completed, marked as complete');
        }
      } else if (!customerIsFirstSyncComplete) {
        // First sync needed
        this.dbService.log('INFO', 'CUSTOMER first sync needed, running first sync');
        const customerFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'CUSTOMER', 'fresh');
        await syncCustomers(profile, 'first', customerFromDate, toDate, this.dbService);
        
        // Check if first sync is now complete
        const stillIncomplete = await this.dbService.getIncompleteSyncBatches('CUSTOMER');
        if (stillIncomplete.length === 0) {
          await this.dbService.completeEntityFirstSync('CUSTOMER');
          this.dbService.log('INFO', 'CUSTOMER first sync completed, marked as complete');
        }
      } else {
        // First sync complete, run incremental sync
        this.dbService.log('INFO', 'CUSTOMER first sync complete, running incremental sync');
        await syncCustomers(profile, 'incremental', undefined, undefined, this.dbService);
      }

      // Invoice sync
      const invoiceIsFirstSyncComplete = await this.dbService.isEntityFirstSyncCompleted('INVOICE');
      const invoiceIncompleteMonths = await this.dbService.getIncompleteMonths('INVOICE');
      
      // Only run first sync if it's not complete AND has incomplete months
      if (!invoiceIsFirstSyncComplete && invoiceIncompleteMonths.length > 0) {
        this.dbService.log('INFO', `INVOICE has incomplete months: ${invoiceIncompleteMonths.join(', ')}, resuming first sync`);
        const invoiceFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'INVOICE', 'fresh');
        await syncInvoices(profile, 'first', invoiceFromDate, toDate, this.dbService);
        
        // Check if first sync is now complete
        const stillIncomplete = await this.dbService.getIncompleteMonths('INVOICE');
        if (stillIncomplete.length === 0) {
          await this.dbService.completeEntityFirstSync('INVOICE');
          this.dbService.log('INFO', 'INVOICE first sync completed, marked as complete');
        }
      } else if (!invoiceIsFirstSyncComplete) {
        // First sync needed
        this.dbService.log('INFO', 'INVOICE first sync needed, running first sync');
        const invoiceFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'INVOICE', 'fresh');
        await syncInvoices(profile, 'first', invoiceFromDate, toDate, this.dbService);
        
        // Check if first sync is now complete
        const stillIncomplete = await this.dbService.getIncompleteMonths('INVOICE');
        if (stillIncomplete.length === 0) {
          await this.dbService.completeEntityFirstSync('INVOICE');
          this.dbService.log('INFO', 'INVOICE first sync completed, marked as complete');
        }
      } else {
        // First sync complete, run incremental sync
        this.dbService.log('INFO', 'INVOICE first sync complete, running incremental sync');
        await syncInvoices(profile, 'incremental', undefined, undefined, this.dbService);
      }

      // Payment sync
      const paymentIsFirstSyncComplete = await this.dbService.isEntityFirstSyncCompleted('PAYMENT');
      const paymentIncompleteMonths = await this.dbService.getIncompleteMonths('PAYMENT');
      
      // Only run first sync if it's not complete AND has incomplete months
      if (!paymentIsFirstSyncComplete && paymentIncompleteMonths.length > 0) {
        this.dbService.log('INFO', `PAYMENT has incomplete months: ${paymentIncompleteMonths.join(', ')}, resuming first sync`);
        const paymentFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'PAYMENT', 'fresh');
        await syncPayments(profile, 'first', paymentFromDate, toDate, this.dbService);
        
        // Check if first sync is now complete
        const stillIncomplete = await this.dbService.getIncompleteMonths('PAYMENT');
        if (stillIncomplete.length === 0) {
          await this.dbService.completeEntityFirstSync('PAYMENT');
          this.dbService.log('INFO', 'PAYMENT first sync completed, marked as complete');
        }
      } else if (!paymentIsFirstSyncComplete) {
        // First sync needed
        this.dbService.log('INFO', 'PAYMENT first sync needed, running first sync');
        const paymentFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'PAYMENT', 'fresh');
        await syncPayments(profile, 'first', paymentFromDate, toDate, this.dbService);
        
        // Check if first sync is now complete
        const stillIncomplete = await this.dbService.getIncompleteMonths('PAYMENT');
        if (stillIncomplete.length === 0) {
          await this.dbService.completeEntityFirstSync('PAYMENT');
          this.dbService.log('INFO', 'PAYMENT first sync completed, marked as complete');
        }
      } else {
        // First sync complete, run incremental sync
        this.dbService.log('INFO', 'PAYMENT first sync complete, running incremental sync');
        await syncPayments(profile, 'incremental', undefined, undefined, this.dbService);
      }

      // Journal Voucher sync
      const jvIsFirstSyncComplete = await this.dbService.isEntityFirstSyncCompleted('JOURNAL');
      const jvIncompleteMonths = await this.dbService.getIncompleteMonths('JOURNAL');
      
      // Only run first sync if it's not complete AND has incomplete months
      if (!jvIsFirstSyncComplete && jvIncompleteMonths.length > 0) {
        this.dbService.log('INFO', `JOURNAL has incomplete months: ${jvIncompleteMonths.join(', ')}, resuming first sync`);
        const jvFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'JOURNAL', 'fresh');
        await syncJournalVouchers(profile, 'first', jvFromDate, toDate, this.dbService);
        
        // Check if first sync is now complete
        const stillIncomplete = await this.dbService.getIncompleteMonths('JOURNAL');
        if (stillIncomplete.length === 0) {
          await this.dbService.completeEntityFirstSync('JOURNAL');
          this.dbService.log('INFO', 'JOURNAL first sync completed, marked as complete');
        }
      } else if (!jvIsFirstSyncComplete) {
        // First sync needed
        this.dbService.log('INFO', 'JOURNAL first sync needed, running first sync');
        const jvFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'JOURNAL', 'fresh');
        await syncJournalVouchers(profile, 'first', jvFromDate, toDate, this.dbService);
        
        // Check if first sync is now complete
        const stillIncomplete = await this.dbService.getIncompleteMonths('JOURNAL');
        if (stillIncomplete.length === 0) {
          await this.dbService.completeEntityFirstSync('JOURNAL');
          this.dbService.log('INFO', 'JOURNAL first sync completed, marked as complete');
        }
      } else {
        // First sync complete, run incremental sync
        this.dbService.log('INFO', 'JOURNAL first sync complete, running incremental sync');
        await syncJournalVouchers(profile, 'incremental', undefined, undefined, this.dbService);
      }

      // Check if all entities have completed first sync
      const allComplete = await this.dbService.areAllEntitiesFirstSyncComplete();
      if (allComplete) {
        this.dbService.log('INFO', 'All entities first sync complete, dumping database to backend');
        const currentOrgUuid = this.dbService.getCurrentOrganizationUuid();
        if (currentOrgUuid && profile.biller_id) {
          await this.dbService.dumpDatabaseToBackend(profile.biller_id, currentOrgUuid);
        }
      }

      await this.dbService.updateLastSuccessfulSync();
      this.dbService.log('INFO', 'MANUAL sync completed successfully');

    } catch (error: any) {
      this.dbService.log('ERROR', 'MANUAL sync failed', { error: error?.message || error });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  // Force full fresh sync - সব entity-র জন্য fresh sync
  async forceFullFreshSync(profile: UserProfile): Promise<void> {
    this.dbService.log('INFO', 'Force full fresh sync requested - performing fresh sync for all entities');

    if (this.isRunning) {
      this.dbService.log('WARN', 'Sync already in progress; skipping this run');
      return;
    }
    this.isRunning = true;

    try {
      // Initialize Tally URL from settings
      await this.initializeTallyUrl();

      this.dbService.log('INFO', 'FORCE FULL FRESH sync initiated');

      // 1. Fetch current company from Tally
      const companyData = await fetchCurrentCompany(this.dbService);
      if (!companyData) {
        throw new Error('Please select your company in Tally Prime software');
      }

      // 2. Validate organization matches
      const prof = await this.dbService.getProfile();
      const profileOrgId = prof?.organization?.response?.organization_id?.trim() || '';
      const billerData = companyData.BILLER_DATA || companyData;
      const tallyOrgId = (billerData.ORGANIZATION_ID || companyData.COMPANYNUMBER || '').trim();

      if (profileOrgId && tallyOrgId && profileOrgId !== tallyOrgId) {
        throw new Error('Please select your company in Tally Prime software');
      }

      // 3. Sync Organization (only on first time)
      if (!prof?.organization?.synced_at) {
        this.dbService.log('INFO', 'Syncing organization data');
        await this.organizationService.syncOrganization(profile, companyData);
      }

      // 4. Get active company
      const activeCompany = this.companyRepository.getActiveCompany(profile.biller_id || '');
      if (!activeCompany) {
        throw new Error('No active company selected. Please select a company first.');
      }

      // 5. Force fresh sync for all entities
      const toDate = this.syncDateManager.getSyncEndDate();
      
      const customerFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'CUSTOMER', 'fresh');
      const invoiceFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'INVOICE', 'fresh');
      const paymentFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'PAYMENT', 'fresh');

      this.dbService.log('INFO', 'Force full fresh sync: Running fresh sync for all entities');
      
      await syncCustomers(profile, 'first', customerFromDate, toDate, this.dbService);
      await syncInvoices(profile, 'first', invoiceFromDate, toDate, this.dbService);
      await syncPayments(profile, 'first', paymentFromDate, toDate, this.dbService);
      
      // Journal Voucher sync
      const jvFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'JOURNAL', 'fresh');
      await syncJournalVouchers(profile, 'first', jvFromDate, toDate, this.dbService);

      await this.dbService.updateLastSuccessfulSync();
      this.dbService.log('INFO', 'Force full fresh sync completed successfully');

    } catch (error: any) {
      this.dbService.log('ERROR', 'Force full fresh sync failed', { error: error?.message || error });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  // Keep old methods for backward compatibility
  async forceFullSync(profile: UserProfile): Promise<void> {
    await this.forceFullFreshSync(profile);
  }

  async forceFreshSync(profile: UserProfile): Promise<void> {
    await this.forceFullFreshSync(profile);
  }

  // Background sync - smart (first_sync or incremental based on entity state)
  async startBackgroundSync(profile: UserProfile): Promise<void> {
    // Stop existing background sync if running
    this.stopBackgroundSync();
    
    // Check if background sync is enabled
    const enabled = await this.dbService.getSetting('backgroundSyncEnabled');
    if (enabled === 'false') {
      this.dbService.log('INFO', 'Background sync is disabled in settings');
      return;
    }

    // Get sync interval from settings (default: 5 minutes = 300 seconds)
    const intervalStr = await this.dbService.getSetting('syncDuration');
    const intervalSeconds = intervalStr ? parseInt(intervalStr, 10) : 300;
    const intervalMs = intervalSeconds * 1000;
    
    this.dbService.log('INFO', `Starting background sync (initial run + every ${intervalSeconds} seconds)`);
    
    // Initial sync
    this.fullSync(profile, 'BACKGROUND').catch(err => {
      this.dbService.log('ERROR', 'Background sync initial run failed', { error: err.message });
    });

    // Periodic sync
    this.backgroundSyncInterval = setInterval(() => {
      this.fullSync(profile, 'BACKGROUND').catch(err => {
        this.dbService.log('ERROR', 'Background sync periodic run failed', { error: err.message });
      });
    }, intervalMs);
  }

  stopBackgroundSync(): void {
    if (this.backgroundSyncInterval) {
      clearInterval(this.backgroundSyncInterval);
      this.backgroundSyncInterval = null;
      this.dbService.log('INFO', 'Background sync interval stopped');
    }
  }

  // Restart background sync with new settings
  async restartBackgroundSync(profile: UserProfile): Promise<void> {
    this.stopBackgroundSync();
    // Wait a bit before restarting
    await new Promise(resolve => setTimeout(resolve, 1000));
    await this.startBackgroundSync(profile);
  }

  stop(): void {
    this.isRunning = false;
    this.stopBackgroundSync();
    this.dbService.log('INFO', 'Background sync stopped');
  }

  isRunningSync(): boolean {
    return this.isRunning;
  }

  /**
   * Sync specific entity only (Customer, Invoice, Payment, or Journal)
   */
  async syncEntity(profile: UserProfile, entityType: 'CUSTOMER' | 'INVOICE' | 'PAYMENT' | 'JOURNAL'): Promise<void> {
    if (this.isRunning) {
      this.dbService.log('WARN', 'Sync already in progress; skipping this run');
      return;
    }
    this.isRunning = true;

    try {
      // Initialize Tally URL from settings
      await this.initializeTallyUrl();

      this.dbService.log('INFO', `Entity-specific sync initiated for: ${entityType}`);

      // 1. Fetch current company from Tally
      const companyData = await fetchCurrentCompany(this.dbService);
      if (!companyData) {
        throw new Error('Please select your company in Tally Prime software');
      }

      // 2. Get active company
      const activeCompany = this.companyRepository.getActiveCompany(profile.biller_id || '');
      if (!activeCompany) {
        throw new Error('No active company selected. Please select a company first.');
      }

      const toDate = this.syncDateManager.getSyncEndDate();

      // 3. Check entity first sync status and sync accordingly
      const isFirstSyncComplete = await this.dbService.isEntityFirstSyncCompleted(entityType);

      if (entityType === 'CUSTOMER') {
        if (isFirstSyncComplete) {
          this.dbService.log('INFO', 'CUSTOMER: Running incremental sync');
          await syncCustomers(profile, 'incremental', undefined, undefined, this.dbService);
        } else {
          const fromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'CUSTOMER', 'fresh');
          this.dbService.log('INFO', 'CUSTOMER: Running first sync');
          await syncCustomers(profile, 'first', fromDate, toDate, this.dbService);

          // Check if first sync is now complete
          const stillIncomplete = await this.dbService.getIncompleteSyncBatches('CUSTOMER');
          if (stillIncomplete.length === 0) {
            await this.dbService.completeEntityFirstSync('CUSTOMER');
            this.dbService.log('INFO', 'CUSTOMER first sync completed, marked as complete');
          }
        }
      } else if (entityType === 'INVOICE') {
        if (isFirstSyncComplete) {
          this.dbService.log('INFO', 'INVOICE: Running incremental sync');
          await syncInvoices(profile, 'incremental', undefined, undefined, this.dbService);
        } else {
          const fromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'INVOICE', 'fresh');
          this.dbService.log('INFO', 'INVOICE: Running first sync');
          await syncInvoices(profile, 'first', fromDate, toDate, this.dbService);

          // Check if first sync is now complete
          const stillIncomplete = await this.dbService.getIncompleteMonths('INVOICE');
          if (stillIncomplete.length === 0) {
            await this.dbService.completeEntityFirstSync('INVOICE');
            this.dbService.log('INFO', 'INVOICE first sync completed, marked as complete');
          }
        }
      } else if (entityType === 'PAYMENT') {
        if (isFirstSyncComplete) {
          this.dbService.log('INFO', 'PAYMENT: Running incremental sync');
          await syncPayments(profile, 'incremental', undefined, undefined, this.dbService);
        } else {
          const fromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'PAYMENT', 'fresh');
          this.dbService.log('INFO', 'PAYMENT: Running first sync');
          await syncPayments(profile, 'first', fromDate, toDate, this.dbService);

          // Check if first sync is now complete
          const stillIncomplete = await this.dbService.getIncompleteMonths('PAYMENT');
          if (stillIncomplete.length === 0) {
            await this.dbService.completeEntityFirstSync('PAYMENT');
            this.dbService.log('INFO', 'PAYMENT first sync completed, marked as complete');
          }
        }
      } else if (entityType === 'JOURNAL') {
        if (isFirstSyncComplete) {
          this.dbService.log('INFO', 'JOURNAL: Running incremental sync');
          await syncJournalVouchers(profile, 'incremental', undefined, undefined, this.dbService);
        } else {
          const fromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'JOURNAL', 'fresh');
          this.dbService.log('INFO', 'JOURNAL: Running first sync');
          await syncJournalVouchers(profile, 'first', fromDate, toDate, this.dbService);

          // Check if first sync is now complete
          const stillIncomplete = await this.dbService.getIncompleteMonths('JOURNAL');
          if (stillIncomplete.length === 0) {
            await this.dbService.completeEntityFirstSync('JOURNAL');
            this.dbService.log('INFO', 'JOURNAL first sync completed, marked as complete');
          }
        }
      }

      await this.dbService.updateLastSuccessfulSync();
      this.dbService.log('INFO', `Entity-specific sync completed for: ${entityType}`);

    } catch (error: any) {
      this.dbService.log('ERROR', `Entity-specific sync failed for ${entityType}`, { error: error?.message || error });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }
}