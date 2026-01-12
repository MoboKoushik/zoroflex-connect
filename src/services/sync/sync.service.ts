// src/services/sync/sync.service.ts (Updated Full Sync Logic with Proper First Sync Handling)
import { DatabaseService, UserProfile } from '../database/database.service';
import { fetchCurrentCompany } from './fetch-to-tally/fetchCurrentCompany';
import { syncCustomers } from './fetch-to-tally/syncCustomers.service';
import { syncInvoices } from './fetch-to-tally/syncInvoices.service';
import { syncPayments } from './fetch-to-tally/syncPayments.service';
import { OrganizationService } from './send-to-platfrom/organization.service';


export class SyncService {
  private dbService: DatabaseService;
  private organizationService: OrganizationService;
  private isRunning = false;

  constructor(dbService: DatabaseService, organizationService: OrganizationService) {
    this.dbService = dbService;
    this.organizationService = organizationService;
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
      const companyData = await fetchCurrentCompany();
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

      // 4. Determine date range for first sync
      let fromDate = '2023-04-01';
      let toDate = '2026-03-31';

      if (type === 'MANUAL') {
        // On manual sync, always do fresh sync with full date range
        this.dbService.log('INFO', 'Manual sync: Performing fresh sync for all entities');

        // Reset first sync flags if needed (optional - only if you want full re-sync on manual)
        // await this.dbService.resetFirstSyncFlags(); // Implement if needed

        // Perform fresh sync for all entities
        await syncCustomers(profile, 'first', fromDate, toDate);
        await syncInvoices(profile, 'first', fromDate, toDate);
        await syncPayments(profile, 'first', fromDate, toDate);
        // await syncJournalEntries(profile, 'first', fromDate, toDate);

      } else {
        // BACKGROUND sync: Smart behavior
        this.dbService.log('INFO', 'Background sync: Checking sync mode for each entity');

        // Customer sync
        // const customerMode = await this.dbService.getEntitySyncMode('CUSTOMER');
        // console.log('customerMode===>', customerMode)
        // if (customerMode) {
        //   await syncCustomers(profile, customerMode === 'first_sync' ? 'first' : 'incremental', 
        //     customerMode === 'first_sync' ? fromDate : undefined, 
        //     customerMode === 'first_sync' ? toDate : undefined);
        // } else {
        //   await syncCustomers(profile, 'first', fromDate, toDate);
        // }

        // // Invoice sync
        // const invoiceMode = await this.dbService.getEntitySyncMode('INVOICE');
        // console.log('invoiceMode===>', invoiceMode)
        // if (invoiceMode) {
        //   await syncInvoices(profile, invoiceMode === 'first_sync' ? 'first' : 'incremental',
        //     invoiceMode === 'first_sync' ? fromDate : undefined,
        //     invoiceMode === 'first_sync' ? toDate : undefined);
        // } else {
        //   await syncInvoices(profile, 'first', fromDate, toDate);
        // }

        // // Payment sync
        // const paymentMode = await this.dbService.getEntitySyncMode('PAYMENT');
        // console.log('paymentMode===>', paymentMode)
        // if (paymentMode) {
        //   await syncPayments(profile, paymentMode === 'first_sync' ? 'first' : 'incremental',
        //     paymentMode === 'first_sync' ? fromDate : undefined,
        //     paymentMode === 'first_sync' ? toDate : undefined);
        // } else {
        //   await syncPayments(profile, 'first', fromDate, toDate);
        // }

        // Journal sync (if implemented)
        // const journalMode = await this.dbService.getEntitySyncMode('JOURNAL');
        // await syncJournalEntries(profile, journalMode === 'first_sync' ? 'first' : 'incremental', ...);
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

  // Manual sync - always does full fresh sync
  async manualSync(profile: UserProfile): Promise<void> {
    this.dbService.log('INFO', 'Manual sync requested by user - performing full fresh sync');
    await this.fullSync(profile, 'MANUAL');
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
}