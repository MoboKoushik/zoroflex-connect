// src/services/sync/sync.service.ts (Updated Full Sync Logic with Proper First Sync Handling)
import { DatabaseService, UserProfile } from '../database/database.service';
import { fetchCurrentCompany } from './fetch-to-tally/fetchCurrentCompany';
import { syncCustomers } from './fetch-to-tally/syncCustomers.service';
import { syncInvoices } from './fetch-to-tally/syncInvoices.service';
import { syncPayments } from './fetch-to-tally/syncPayments.service';
import { OrganizationService } from './send-to-platfrom/organization.service';
import { SyncDateManager, SyncType, EntityType } from './sync-date-manager';
import { CompanyRepository } from '../database/repositories/company.repository';


export class SyncService {
  private dbService: DatabaseService;
  private organizationService: OrganizationService;
  private syncDateManager: SyncDateManager;
  private companyRepository: CompanyRepository;
  private isRunning = false;

  constructor(dbService: DatabaseService, organizationService: OrganizationService) {
    this.dbService = dbService;
    this.organizationService = organizationService;
    this.syncDateManager = new SyncDateManager(dbService);
    this.companyRepository = new CompanyRepository(dbService);
  }

  private async fullSync(profile: UserProfile, type: 'MANUAL' | 'BACKGROUND' = 'BACKGROUND'): Promise<void> {
    if (this.isRunning) {
      this.dbService.log('WARN', 'Sync already in progress; skipping this run');
      return;
    }
    this.isRunning = true;

    try {
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
        // await syncJournalEntries(profile, 'first', fromDate, toDate);

      } else {
        // BACKGROUND sync: Check per-entity first sync status
        this.dbService.log('INFO', 'Background sync: Checking per-entity first sync status');

        // Check which entities need first sync
        const entitiesNeedingFirstSync = await this.dbService.getEntitiesNeedingFirstSync();
        const allEntitiesComplete = await this.dbService.areAllEntitiesFirstSyncComplete();

        // Customer sync
        const customerNeedsFirstSync = entitiesNeedingFirstSync.includes('CUSTOMER');
        if (customerNeedsFirstSync) {
          const customerFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'CUSTOMER', 'fresh');
          this.dbService.log('INFO', 'CUSTOMER first sync needed, running first sync');
          await syncCustomers(profile, 'first', customerFromDate, toDate, this.dbService);
        } else {
          this.dbService.log('INFO', 'CUSTOMER first sync complete, running incremental sync');
          await syncCustomers(profile, 'incremental', undefined, undefined, this.dbService);
        }

        // Invoice sync
        const invoiceNeedsFirstSync = entitiesNeedingFirstSync.includes('INVOICE');
        if (invoiceNeedsFirstSync) {
          const invoiceFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'INVOICE', 'fresh');
          this.dbService.log('INFO', 'INVOICE first sync needed, running first sync');
          await syncInvoices(profile, 'first', invoiceFromDate, toDate, this.dbService);
        } else {
          this.dbService.log('INFO', 'INVOICE first sync complete, running incremental sync');
          await syncInvoices(profile, 'incremental', undefined, undefined, this.dbService);
        }

        // Payment sync
        const paymentNeedsFirstSync = entitiesNeedingFirstSync.includes('PAYMENT');
        if (paymentNeedsFirstSync) {
          const paymentFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'PAYMENT', 'fresh');
          this.dbService.log('INFO', 'PAYMENT first sync needed, running first sync');
          await syncPayments(profile, 'first', paymentFromDate, toDate, this.dbService);
        } else {
          this.dbService.log('INFO', 'PAYMENT first sync complete, running incremental sync');
          await syncPayments(profile, 'incremental', undefined, undefined, this.dbService);
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

  // Manual sync - full sync from BOOKSTARTFROM
  async manualSync(profile: UserProfile, syncType: 'full' | 'fresh' = 'full'): Promise<void> {
    const syncTypeLabel = syncType === 'full' ? 'full (from BOOKSTARTFROM)' : 'fresh (from last sync + 1)';
    this.dbService.log('INFO', `Manual sync requested - performing ${syncTypeLabel} sync`);
    await this.fullSync(profile, 'MANUAL');
  }

  // Force full sync from BOOKSTARTFROM
  async forceFullSync(profile: UserProfile): Promise<void> {
    await this.manualSync(profile, 'full');
  }

  // Force fresh sync from last sync + 1
  async forceFreshSync(profile: UserProfile): Promise<void> {
    await this.manualSync(profile, 'fresh');
  }

  // Background sync - smart (first_sync or incremental based on entity state)
  startBackgroundSync(profile: UserProfile): void {
    this.dbService.log('INFO', 'Starting background sync (initial run + every 5 minutes)');
    this.fullSync(profile, 'BACKGROUND');

    setInterval(() => {
      this.fullSync(profile, 'BACKGROUND');
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  stop(): void {
    this.isRunning = false;
    this.dbService.log('INFO', 'Background sync stopped');
  }

  isRunningSync(): boolean {
    return this.isRunning;
  }
}