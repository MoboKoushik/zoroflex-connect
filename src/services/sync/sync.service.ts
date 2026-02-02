// src/services/sync/sync.service.ts (Updated Full Sync Logic with Proper First Sync Handling)
import { DatabaseService, UserProfile } from '../database/database.service';
import { fetchCurrentCompany } from './fetch-to-tally/fetchCurrentCompany';
import { syncCustomers } from './fetch-to-tally/syncCustomers.service';
import { syncInvoices } from './fetch-to-tally/syncInvoices.service';
import { syncPayments } from './fetch-to-tally/syncPayments.service';
import { syncJournalVouchers } from './fetch-to-tally/syncJournalVouchers.service';
import { syncDebitNotes } from './fetch-to-tally/syncDebitNotes.service';
import { syncDeletedVouchers } from './fetch-to-tally/syncDeletedVouchers.service';
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

  private calculateOverallStatus(results: any[]): 'SUCCESS' | 'PARTIAL' | 'FAILED' {
    // Filter out null/undefined results (entities that didn't run)
    const validResults = results.filter(r => r != null);

    // If no valid results, return SUCCESS (nothing failed)
    if (validResults.length === 0) return 'SUCCESS';

    // Normalize status from different result formats:
    // - Some services return {status: 'SUCCESS'/'PARTIAL'/'FAILED'}
    // - syncDeletedVouchers returns {success: true/false}
    const statuses = validResults.map(r => {
      // If status field exists, use it
      if (r.status) return r.status;
      // If success field exists (e.g., syncDeletedVouchers)
      if (r.success !== undefined) return r.success ? 'SUCCESS' : 'FAILED';
      // If has error field, it's failed
      if (r.error) return 'FAILED';
      // Default to SUCCESS if we have a result object
      return 'SUCCESS';
    });

    const hasSuccess = statuses.some(s => s === 'SUCCESS');
    const hasFailed = statuses.some(s => s === 'FAILED');
    const hasPartial = statuses.some(s => s === 'PARTIAL');

    // If any PARTIAL, overall is PARTIAL
    if (hasPartial) return 'PARTIAL';

    // If any failed
    if (hasFailed) {
      // If some success and some failed = PARTIAL
      if (hasSuccess) return 'PARTIAL';
      // All failed = FAILED
      return 'FAILED';
    }

    // No failures = SUCCESS
    return 'SUCCESS';
  }

  private async fullSync(profile: UserProfile, type: 'MANUAL' | 'BACKGROUND' = 'BACKGROUND'): Promise<void> {
    if (this.isRunning) {
      this.dbService.log('WARN', 'Sync already in progress; skipping this run');
      return;
    }
    this.isRunning = true;
    let customerResult: any;
    let invoiceResult: any;
    let paymentResult: any;
    let jvResult: any;
    let debitNoteResult: any;
    let deletedResult: any;
    const syncStartTime = Date.now();
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
        customerResult = await syncCustomers(profile, 'first', fromDate, toDate, this.dbService);
        invoiceResult = await syncInvoices(profile, 'first', fromDate, toDate, this.dbService);
        paymentResult = await syncPayments(profile, 'first', fromDate, toDate, this.dbService);
        jvResult = await syncJournalVouchers(profile, 'first', fromDate, toDate, this.dbService);
        debitNoteResult = await syncDebitNotes(profile, 'first', fromDate, toDate, this.dbService);

        // Sync deleted/cancelled vouchers
        this.dbService.log('INFO', 'Syncing deleted/cancelled vouchers');
        deletedResult = await syncDeletedVouchers(profile, 'first', fromDate, toDate, this.dbService);

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
          customerResult = await syncCustomers(profile, 'first', customerFromDate, toDate, this.dbService);

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
          customerResult = await syncCustomers(profile, 'first', customerFromDate, toDate, this.dbService);

          // Check if first sync is now complete
          const stillIncomplete = await this.dbService.getIncompleteSyncBatches('CUSTOMER');
          if (stillIncomplete.length === 0) {
            await this.dbService.completeEntityFirstSync('CUSTOMER');
            this.dbService.log('INFO', 'CUSTOMER first sync completed, marked as complete');
          }
        } else {
          // First sync complete, run incremental sync
          const customerFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'CUSTOMER', 'fresh');
          this.dbService.log('INFO', 'CUSTOMER first sync complete, running incremental sync');
          customerResult = await syncCustomers(profile, 'incremental', customerFromDate, toDate, this.dbService);
        }

        // Invoice sync
        const invoiceIsFirstSyncComplete = await this.dbService.isEntityFirstSyncCompleted('INVOICE');
        const invoiceIncompleteMonths = await this.dbService.getIncompleteMonths('INVOICE');

        // // Only run first sync if it's not complete AND has incomplete months
        if (!invoiceIsFirstSyncComplete && invoiceIncompleteMonths.length > 0) {
          this.dbService.log('INFO', `INVOICE has incomplete months: ${invoiceIncompleteMonths.join(', ')}, resuming first sync`);
          const invoiceFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'INVOICE', 'fresh');
          invoiceResult = await syncInvoices(profile, 'first', invoiceFromDate, toDate, this.dbService);

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
          invoiceResult = await syncInvoices(profile, 'first', invoiceFromDate, toDate, this.dbService);

          // Check if first sync is now complete
          const stillIncomplete = await this.dbService.getIncompleteMonths('INVOICE');
          if (stillIncomplete.length === 0) {
            await this.dbService.completeEntityFirstSync('INVOICE');
            this.dbService.log('INFO', 'INVOICE first sync completed, marked as complete');
          }
        } else {
          // First sync complete, run incremental sync
          this.dbService.log('INFO', 'INVOICE first sync complete, running incremental sync');
          invoiceResult = await syncInvoices(profile, 'incremental', undefined, undefined, this.dbService);
        }

        // Payment sync
        const paymentIsFirstSyncComplete = await this.dbService.isEntityFirstSyncCompleted('PAYMENT');
        const paymentIncompleteMonths = await this.dbService.getIncompleteMonths('PAYMENT');

        // Only run first sync if it's not complete AND has incomplete months
        if (!paymentIsFirstSyncComplete && paymentIncompleteMonths.length > 0) {
          this.dbService.log('INFO', `PAYMENT has incomplete months: ${paymentIncompleteMonths.join(', ')}, resuming first sync`);
          const paymentFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'PAYMENT', 'fresh');
          paymentResult = await syncPayments(profile, 'first', paymentFromDate, toDate, this.dbService);

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
          paymentResult = await syncPayments(profile, 'first', paymentFromDate, toDate, this.dbService);

          // Check if first sync is now complete
          const stillIncomplete = await this.dbService.getIncompleteMonths('PAYMENT');
          if (stillIncomplete.length === 0) {
            await this.dbService.completeEntityFirstSync('PAYMENT');
            this.dbService.log('INFO', 'PAYMENT first sync completed, marked as complete');
          }
        } else {
          // First sync complete, run incremental sync
          this.dbService.log('INFO', 'PAYMENT first sync complete, running incremental sync');
          paymentResult = await syncPayments(profile, 'incremental', undefined, undefined, this.dbService);
        }

        // Journal Voucher sync
        const jvIsFirstSyncComplete = await this.dbService.isEntityFirstSyncCompleted('JOURNAL');
        const jvIncompleteMonths = await this.dbService.getIncompleteMonths('JOURNAL');

        // Only run first sync if it's not complete AND has incomplete months
        if (!jvIsFirstSyncComplete && jvIncompleteMonths.length > 0) {
          this.dbService.log('INFO', `JOURNAL has incomplete months: ${jvIncompleteMonths.join(', ')}, resuming first sync`);
          const jvFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'JOURNAL', 'fresh');
          jvResult = await syncJournalVouchers(profile, 'first', jvFromDate, toDate, this.dbService);

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
          jvResult = await syncJournalVouchers(profile, 'first', jvFromDate, toDate, this.dbService);

          // Check if first sync is now complete
          const stillIncomplete = await this.dbService.getIncompleteMonths('JOURNAL');
          if (stillIncomplete.length === 0) {
            await this.dbService.completeEntityFirstSync('JOURNAL');
            this.dbService.log('INFO', 'JOURNAL first sync completed, marked as complete');
          }
        } else {
          // First sync complete, run incremental sync
          this.dbService.log('INFO', 'JOURNAL first sync complete, running incremental sync');
          jvResult = await syncJournalVouchers(profile, 'incremental', undefined, undefined, this.dbService);
        }

        // Debit Note sync
        const debitNoteIsFirstSyncComplete = await this.dbService.isEntityFirstSyncCompleted('DEBITNOTE');
        const debitNoteIncompleteMonths = await this.dbService.getIncompleteMonths('DEBITNOTE');

        // Only run first sync if it's not complete AND has incomplete months
        if (!debitNoteIsFirstSyncComplete && debitNoteIncompleteMonths.length > 0) {
          this.dbService.log('INFO', `DEBITNOTE has incomplete months: ${debitNoteIncompleteMonths.join(', ')}, resuming first sync`);
          const debitNoteFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'DEBITNOTE', 'fresh');
          debitNoteResult = await syncDebitNotes(profile, 'first', debitNoteFromDate, toDate, this.dbService);

          // Check if first sync is now complete
          const stillIncomplete = await this.dbService.getIncompleteMonths('DEBITNOTE');
          if (stillIncomplete.length === 0) {
            await this.dbService.completeEntityFirstSync('DEBITNOTE');
            this.dbService.log('INFO', 'DEBITNOTE first sync completed, marked as complete');
          }
        } else if (!debitNoteIsFirstSyncComplete) {
          // First sync needed
          this.dbService.log('INFO', 'DEBITNOTE first sync needed, running first sync');
          const debitNoteFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'DEBITNOTE', 'fresh');
          debitNoteResult = await syncDebitNotes(profile, 'first', debitNoteFromDate, toDate, this.dbService);

          // Check if first sync is now complete
          const stillIncomplete = await this.dbService.getIncompleteMonths('DEBITNOTE');
          if (stillIncomplete.length === 0) {
            await this.dbService.completeEntityFirstSync('DEBITNOTE');
            this.dbService.log('INFO', 'DEBITNOTE first sync completed, marked as complete');
          }
        } else {
          // First sync complete, run incremental sync
          this.dbService.log('INFO', 'DEBITNOTE first sync complete, running incremental sync');
          debitNoteResult = await syncDebitNotes(profile, 'incremental', undefined, undefined, this.dbService);
        }

        // Deleted vouchers sync (always incremental in background sync)
        this.dbService.log('INFO', 'Syncing deleted/cancelled vouchers (incremental)');
        const deleteFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'ALL', 'fresh');
        deletedResult = await syncDeletedVouchers(profile, 'incremental', deleteFromDate, toDate, this.dbService);

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

      const incompleteMonths = [];
      if (!await this.dbService.isEntityFirstSyncCompleted('INVOICE')) {
        incompleteMonths.push(...await this.dbService.getIncompleteMonths('INVOICE'));
      }

      const syncStartedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const duration = Math.round((Date.now() - syncStartTime) / 1000);
      const totalRecords =
        (customerResult?.successCount || 0) + (customerResult?.failedCount || 0) +
        (invoiceResult?.successCount || 0) + (invoiceResult?.failedCount || 0) +
        (paymentResult?.successCount || 0) + (paymentResult?.failedCount || 0) +
        (jvResult?.successCount || 0) + (jvResult?.failedCount || 0) +
        (debitNoteResult?.successCount || 0) + (debitNoteResult?.failedCount || 0) +
        (deletedResult?.totalFetched || 0);

      // Build error detail from failed counts
      const failedDetails: string[] = [];
      if (customerResult?.failedCount > 0) failedDetails.push(`Customer: ${customerResult.failedCount} failed`);
      if (invoiceResult?.failedCount > 0) failedDetails.push(`Invoice: ${invoiceResult.failedCount} failed`);
      if (paymentResult?.failedCount > 0) failedDetails.push(`Receipt: ${paymentResult.failedCount} failed`);
      if (jvResult?.failedCount > 0) failedDetails.push(`Journal: ${jvResult.failedCount} failed`);
      if (debitNoteResult?.failedCount > 0) failedDetails.push(`Debit Note: ${debitNoteResult.failedCount} failed`);
      if (deletedResult?.error) failedDetails.push(`Delete Sync: ${deletedResult.error}`);
      const errorDetail = failedDetails.length > 0 ? failedDetails.join('; ') : '';

      await this.dbService.logSyncSummary({
        sync_started_at: syncStartedAt,
        sync_mode: type === 'MANUAL' ? 'FULL_FIRST' : 'BACKGROUND_INCREMENTAL',
        trigger_type: type === 'MANUAL' ? 'MANUAL_FULL' : 'AUTO_BACKGROUND',
        customer_count: customerResult?.successCount || 0,
        journal_count: jvResult?.successCount || 0,
        invoice_count: invoiceResult?.successCount || 0,
        receipt_count: paymentResult?.successCount || 0,
        debit_note_count: debitNoteResult?.successCount || 0,
        cancel_delete_count: (deletedResult?.deleted || 0) + (deletedResult?.cancelled || 0),
        overall_status: this.calculateOverallStatus([customerResult, invoiceResult, paymentResult, jvResult, debitNoteResult, deletedResult]),
        error_detail: errorDetail,
        total_records: totalRecords,
        duration_seconds: duration,
        max_alter_id: await this.dbService.getEntityMaxAlterId('INVOICE') || '0',
        incomplete_months: incompleteMonths?.length > 0 ? incompleteMonths?.join(', ') : ''
      });

      await this.dbService.updateLastSuccessfulSync();
      this.dbService.log('INFO', `${type} sync completed successfully`);

    } catch (error: any) {
      this.dbService.log('ERROR', `${type} sync failed`, { error: error?.message || error });
      const syncStartedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const duration = Math.round((Date.now() - syncStartTime) / 1000);
      const totalRecords =
        (customerResult?.successCount || 0) + (customerResult?.failedCount || 0) +
        (invoiceResult?.successCount || 0) + (invoiceResult?.failedCount || 0) +
        (paymentResult?.successCount || 0) + (paymentResult?.failedCount || 0) +
        (jvResult?.successCount || 0) + (jvResult?.failedCount || 0) +
        (debitNoteResult?.successCount || 0) + (debitNoteResult?.failedCount || 0) +
        (deletedResult?.totalFetched || 0);

      // Build error detail including failed counts and the main error
      const failedDetails: string[] = [];
      if (error?.message) failedDetails.push(error.message);
      if (customerResult?.failedCount > 0) failedDetails.push(`Customer: ${customerResult.failedCount} failed`);
      if (invoiceResult?.failedCount > 0) failedDetails.push(`Invoice: ${invoiceResult.failedCount} failed`);
      if (paymentResult?.failedCount > 0) failedDetails.push(`Receipt: ${paymentResult.failedCount} failed`);
      if (jvResult?.failedCount > 0) failedDetails.push(`Journal: ${jvResult.failedCount} failed`);
      if (debitNoteResult?.failedCount > 0) failedDetails.push(`Debit Note: ${debitNoteResult.failedCount} failed`);

      await this.dbService.logSyncSummary({
        sync_started_at: syncStartedAt,
        sync_mode: type === 'MANUAL' ? 'FULL_FIRST' : 'BACKGROUND_INCREMENTAL',
        trigger_type: type === 'MANUAL' ? 'MANUAL_FULL' : 'AUTO_BACKGROUND',
        customer_count: customerResult?.successCount || 0,
        journal_count: jvResult?.successCount || 0,
        invoice_count: invoiceResult?.successCount || 0,
        receipt_count: paymentResult?.successCount || 0,
        debit_note_count: debitNoteResult?.successCount || 0,
        cancel_delete_count: (deletedResult?.deleted || 0) + (deletedResult?.cancelled || 0),
        overall_status: this.calculateOverallStatus([customerResult, invoiceResult, paymentResult, jvResult, debitNoteResult, deletedResult]),
        error_detail: failedDetails.join('; '),
        total_records: totalRecords,
        duration_seconds: duration,
        max_alter_id: await this.dbService.getEntityMaxAlterId('INVOICE') || '0',
        incomplete_months: ''
      });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  // Manual sync - smart sync (per-entity status check )
  async manualSync(profile: UserProfile): Promise<void> {
    this.dbService.log('INFO', 'Manual sync requested - performing smart sync (per-entity status check)');

    if (this.isRunning) {
      this.dbService.log('WARN', 'Sync already in progress; skipping this run');
      return;
    }
    this.isRunning = true;
    let customerResult: any;
    let invoiceResult: any;
    let paymentResult: any;
    let jvResult: any;
    let debitNoteResult: any;
    let deletedResult: any;
    const syncStartTime = Date.now();
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
        customerResult = await syncCustomers(profile, 'first', customerFromDate, toDate, this.dbService);

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
        customerResult = await syncCustomers(profile, 'first', customerFromDate, toDate, this.dbService);

        // Check if first sync is now complete
        const stillIncomplete = await this.dbService.getIncompleteSyncBatches('CUSTOMER');
        if (stillIncomplete.length === 0) {
          await this.dbService.completeEntityFirstSync('CUSTOMER');
          this.dbService.log('INFO', 'CUSTOMER first sync completed, marked as complete');
        }
      } else {
        // First sync complete, run incremental sync
        this.dbService.log('INFO', 'CUSTOMER first sync complete, running incremental sync');
        const customerFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'CUSTOMER', 'fresh');
        customerResult = await syncCustomers(profile, 'incremental', customerFromDate, toDate, this.dbService);
      }

      // Invoice sync
      const invoiceIsFirstSyncComplete = await this.dbService.isEntityFirstSyncCompleted('INVOICE');
      const invoiceIncompleteMonths = await this.dbService.getIncompleteMonths('INVOICE');

      // Only run first sync if it's not complete AND has incomplete months
      if (!invoiceIsFirstSyncComplete && invoiceIncompleteMonths.length > 0) {
        this.dbService.log('INFO', `INVOICE has incomplete months: ${invoiceIncompleteMonths.join(', ')}, resuming first sync`);
        const invoiceFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'INVOICE', 'fresh');
        invoiceResult = await syncInvoices(profile, 'first', invoiceFromDate, toDate, this.dbService);

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
        invoiceResult = await syncInvoices(profile, 'first', invoiceFromDate, toDate, this.dbService);

        // Check if first sync is now complete
        const stillIncomplete = await this.dbService.getIncompleteMonths('INVOICE');
        if (stillIncomplete.length === 0) {
          await this.dbService.completeEntityFirstSync('INVOICE');
          this.dbService.log('INFO', 'INVOICE first sync completed, marked as complete');
        }
      } else {
        // First sync complete, run incremental sync
        this.dbService.log('INFO', 'INVOICE first sync complete, running incremental sync');
        invoiceResult = await syncInvoices(profile, 'incremental', undefined, undefined, this.dbService);
      }

      // Payment sync
      const paymentIsFirstSyncComplete = await this.dbService.isEntityFirstSyncCompleted('PAYMENT');
      const paymentIncompleteMonths = await this.dbService.getIncompleteMonths('PAYMENT');

      // Only run first sync if it's not complete AND has incomplete months
      if (!paymentIsFirstSyncComplete && paymentIncompleteMonths.length > 0) {
        this.dbService.log('INFO', `PAYMENT has incomplete months: ${paymentIncompleteMonths.join(', ')}, resuming first sync`);
        const paymentFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'PAYMENT', 'fresh');
        paymentResult = await syncPayments(profile, 'first', paymentFromDate, toDate, this.dbService);

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
        paymentResult = await syncPayments(profile, 'first', paymentFromDate, toDate, this.dbService);

        // Check if first sync is now complete
        const stillIncomplete = await this.dbService.getIncompleteMonths('PAYMENT');
        if (stillIncomplete.length === 0) {
          await this.dbService.completeEntityFirstSync('PAYMENT');
          this.dbService.log('INFO', 'PAYMENT first sync completed, marked as complete');
        }
      } else {
        // First sync complete, run incremental sync
        this.dbService.log('INFO', 'PAYMENT first sync complete, running incremental sync');
        paymentResult = await syncPayments(profile, 'incremental', undefined, undefined, this.dbService);
      }

      // Journal Voucher sync
      const jvIsFirstSyncComplete = await this.dbService.isEntityFirstSyncCompleted('JOURNAL');
      const jvIncompleteMonths = await this.dbService.getIncompleteMonths('JOURNAL');

      // Only run first sync if it's not complete AND has incomplete months
      if (!jvIsFirstSyncComplete && jvIncompleteMonths.length > 0) {
        this.dbService.log('INFO', `JOURNAL has incomplete months: ${jvIncompleteMonths.join(', ')}, resuming first sync`);
        const jvFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'JOURNAL', 'fresh');
        jvResult = await syncJournalVouchers(profile, 'first', jvFromDate, toDate, this.dbService);

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
        jvResult = await syncJournalVouchers(profile, 'first', jvFromDate, toDate, this.dbService);

        // Check if first sync is now complete
        const stillIncomplete = await this.dbService.getIncompleteMonths('JOURNAL');
        if (stillIncomplete.length === 0) {
          await this.dbService.completeEntityFirstSync('JOURNAL');
          this.dbService.log('INFO', 'JOURNAL first sync completed, marked as complete');
        }
      } else {
        // First sync complete, run incremental sync
        this.dbService.log('INFO', 'JOURNAL first sync complete, running incremental sync');
        jvResult = await syncJournalVouchers(profile, 'incremental', undefined, undefined, this.dbService);
      }

      // Debit Note sync
      const debitNoteIsFirstSyncComplete = await this.dbService.isEntityFirstSyncCompleted('DEBITNOTE');
      const debitNoteIncompleteMonths = await this.dbService.getIncompleteMonths('DEBITNOTE');

      // Only run first sync if it's not complete AND has incomplete months
      if (!debitNoteIsFirstSyncComplete && debitNoteIncompleteMonths.length > 0) {
        this.dbService.log('INFO', `DEBITNOTE has incomplete months: ${debitNoteIncompleteMonths.join(', ')}, resuming first sync`);
        const debitNoteFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'DEBITNOTE', 'fresh');
        debitNoteResult = await syncDebitNotes(profile, 'first', debitNoteFromDate, toDate, this.dbService);

        // Check if first sync is now complete
        const stillIncomplete = await this.dbService.getIncompleteMonths('DEBITNOTE');
        if (stillIncomplete.length === 0) {
          await this.dbService.completeEntityFirstSync('DEBITNOTE');
          this.dbService.log('INFO', 'DEBITNOTE first sync completed, marked as complete');
        }
      } else if (!debitNoteIsFirstSyncComplete) {
        // First sync needed
        this.dbService.log('INFO', 'DEBITNOTE first sync needed, running first sync');
        const debitNoteFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'DEBITNOTE', 'fresh');
        debitNoteResult = await syncDebitNotes(profile, 'first', debitNoteFromDate, toDate, this.dbService);

        // Check if first sync is now complete
        const stillIncomplete = await this.dbService.getIncompleteMonths('DEBITNOTE');
        if (stillIncomplete.length === 0) {
          await this.dbService.completeEntityFirstSync('DEBITNOTE');
          this.dbService.log('INFO', 'DEBITNOTE first sync completed, marked as complete');
        }
      } else {
        // First sync complete, run incremental sync
        this.dbService.log('INFO', 'DEBITNOTE first sync complete, running incremental sync');
        debitNoteResult = await syncDebitNotes(profile, 'incremental', undefined, undefined, this.dbService);
      }

      // Deleted vouchers sync (always incremental in manual sync)
      this.dbService.log('INFO', 'Syncing deleted/cancelled vouchers (incremental)');
      const deleteFromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, 'ALL', 'fresh');
      deletedResult = await syncDeletedVouchers(profile, 'incremental', deleteFromDate, toDate, this.dbService);

      // Check if all entities have completed first sync
      const allComplete = await this.dbService.areAllEntitiesFirstSyncComplete();
      if (allComplete) {
        this.dbService.log('INFO', 'All entities first sync complete, dumping database to backend');
        const currentOrgUuid = this.dbService.getCurrentOrganizationUuid();
        if (currentOrgUuid && profile.biller_id) {
          await this.dbService.dumpDatabaseToBackend(profile.biller_id, currentOrgUuid);
        }
      }

      // Incomplete months (first sync hole)
      const incompleteMonths = [];
      if (!await this.dbService.isEntityFirstSyncCompleted('INVOICE')) {
        incompleteMonths.push(...await this.dbService.getIncompleteMonths('INVOICE'));
      }

      const syncStartedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const duration = Math.round((Date.now() - syncStartTime) / 1000);
      const totalRecords =
        (customerResult?.successCount || 0) + (customerResult?.failedCount || 0) +
        (invoiceResult?.successCount || 0) + (invoiceResult?.failedCount || 0) +
        (paymentResult?.successCount || 0) + (paymentResult?.failedCount || 0) +
        (jvResult?.successCount || 0) + (jvResult?.failedCount || 0) +
        (debitNoteResult?.successCount || 0) + (debitNoteResult?.failedCount || 0) +
        (deletedResult?.totalFetched || 0);

      // Build error detail from failed counts
      const failedDetails: string[] = [];
      if (customerResult?.failedCount > 0) failedDetails.push(`Customer: ${customerResult.failedCount} failed`);
      if (invoiceResult?.failedCount > 0) failedDetails.push(`Invoice: ${invoiceResult.failedCount} failed`);
      if (paymentResult?.failedCount > 0) failedDetails.push(`Receipt: ${paymentResult.failedCount} failed`);
      if (jvResult?.failedCount > 0) failedDetails.push(`Journal: ${jvResult.failedCount} failed`);
      if (debitNoteResult?.failedCount > 0) failedDetails.push(`Debit Note: ${debitNoteResult.failedCount} failed`);
      if (deletedResult?.error) failedDetails.push(`Delete Sync: ${deletedResult.error}`);
      const errorDetail = failedDetails.length > 0 ? failedDetails.join('; ') : '';

      await this.dbService.logSyncSummary({
        sync_started_at: syncStartedAt,
        sync_mode: 'FULL_FIRST',
        trigger_type: 'MANUAL_FULL',
        customer_count: customerResult?.successCount || 0,
        journal_count: jvResult?.successCount || 0,
        invoice_count: invoiceResult?.successCount || 0,
        receipt_count: paymentResult?.successCount || 0,
        debit_note_count: debitNoteResult?.successCount || 0,
        cancel_delete_count: (deletedResult?.deleted || 0) + (deletedResult?.cancelled || 0),
        overall_status: this.calculateOverallStatus([customerResult, invoiceResult, paymentResult, jvResult, debitNoteResult, deletedResult]),
        error_detail: errorDetail,
        total_records: totalRecords,
        duration_seconds: duration,
        max_alter_id: await this.dbService.getEntityMaxAlterId('INVOICE') || '0',
        incomplete_months: incompleteMonths.length > 0 ? incompleteMonths.join(', ') : ''
      });

      await this.dbService.updateLastSuccessfulSync();
      this.dbService.log('INFO', 'MANUAL sync completed successfully');

    } catch (error: any) {
      this.dbService.log('ERROR', 'MANUAL sync failed', { error: error?.message || error });
      const syncStartedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const duration = Math.round((Date.now() - syncStartTime) / 1000);
      const totalRecords =
        (customerResult?.successCount || 0) + (customerResult?.failedCount || 0) +
        (invoiceResult?.successCount || 0) + (invoiceResult?.failedCount || 0) +
        (paymentResult?.successCount || 0) + (paymentResult?.failedCount || 0) +
        (jvResult?.successCount || 0) + (jvResult?.failedCount || 0) +
        (debitNoteResult?.successCount || 0) + (debitNoteResult?.failedCount || 0) +
        (deletedResult?.totalFetched || 0);

      // Build error detail including failed counts and the main error
      const failedDetails: string[] = [];
      if (error?.message) failedDetails.push(error.message);
      if (customerResult?.failedCount > 0) failedDetails.push(`Customer: ${customerResult.failedCount} failed`);
      if (invoiceResult?.failedCount > 0) failedDetails.push(`Invoice: ${invoiceResult.failedCount} failed`);
      if (paymentResult?.failedCount > 0) failedDetails.push(`Receipt: ${paymentResult.failedCount} failed`);
      if (jvResult?.failedCount > 0) failedDetails.push(`Journal: ${jvResult.failedCount} failed`);
      if (debitNoteResult?.failedCount > 0) failedDetails.push(`Debit Note: ${debitNoteResult.failedCount} failed`);

      await this.dbService.logSyncSummary({
        sync_started_at: syncStartedAt,
        sync_mode: 'FULL_FIRST',
        trigger_type: 'MANUAL_FULL',
        customer_count: customerResult?.successCount || 0,
        journal_count: jvResult?.successCount || 0,
        invoice_count: invoiceResult?.successCount || 0,
        receipt_count: paymentResult?.successCount || 0,
        debit_note_count: debitNoteResult?.successCount || 0,
        cancel_delete_count: (deletedResult?.deleted || 0) + (deletedResult?.cancelled || 0),
        overall_status: this.calculateOverallStatus([customerResult, invoiceResult, paymentResult, jvResult, debitNoteResult, deletedResult]),
        error_detail: failedDetails.join('; '),
        total_records: totalRecords,
        duration_seconds: duration,
        max_alter_id: await this.dbService.getEntityMaxAlterId('INVOICE') || '0',
        incomplete_months: ''
      });
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

      // Deleted vouchers sync (fresh sync)
      this.dbService.log('INFO', 'Force full fresh sync: Syncing deleted/cancelled vouchers');
      await syncDeletedVouchers(profile, 'first', customerFromDate, toDate, this.dbService);

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


  private async runEntitySync(
    profile: UserProfile,
    entityType: EntityType,
    mode: 'first' | 'incremental',
    fromDate: string,
    toDate: string
  ): Promise<any> {
    switch (entityType) {
      case 'CUSTOMER':
        return syncCustomers(profile, mode, fromDate, toDate, this.dbService);
      case 'INVOICE':
        return syncInvoices(profile, mode, fromDate, toDate, this.dbService);
      case 'PAYMENT':
        return syncPayments(profile, mode, fromDate, toDate, this.dbService);
      case 'JOURNAL':
        return syncJournalVouchers(profile, mode, fromDate, toDate, this.dbService);
      case 'DEBITNOTE':
        return syncDebitNotes(profile, mode, fromDate, toDate, this.dbService);
      default:
        throw new Error(`Unknown entity: ${entityType}`);
    }
  }

  /**
 * Sync specific entity only (Customer, Invoice, Payment, Journal, or DebitNote)
 */
  async syncEntity(
    profile: UserProfile,
    entityType: 'CUSTOMER' | 'INVOICE' | 'PAYMENT' | 'JOURNAL' | 'DEBITNOTE'
  ): Promise<void> {
    if (this.isRunning) {
      this.dbService.log('WARN', 'Sync already in progress; skipping this run');
      return;
    }

    this.isRunning = true;
    const syncStartTime = Date.now();

    let errorDetail: string | null = null;
    let result: any = null;

    try {
      // 1. Initialize Tally URL
      await this.initializeTallyUrl();

      this.dbService.log('INFO', `Entity-specific sync initiated for: ${entityType}`);

      // 2. Fetch current company from Tally (validation)
      const companyData = await fetchCurrentCompany(this.dbService);
      if (!companyData) {
        throw new Error('Please select your company in Tally Prime software');
      }

      // 3. Get active company
      const activeCompany = this.companyRepository.getActiveCompany(profile.biller_id || '');
      if (!activeCompany) {
        throw new Error('No active company selected. Please select a company first.');
      }

      const toDate = this.syncDateManager.getSyncEndDate();
      const isFirstSyncComplete = await this.dbService.isEntityFirstSyncCompleted(entityType);

      // 4. Decide mode & fromDate
      let mode: 'first' | 'incremental' = isFirstSyncComplete ? 'incremental' : 'first';
      let fromDate: string | undefined;

      if (!isFirstSyncComplete) {
        fromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, entityType, 'fresh');
        this.dbService.log('INFO', `${entityType}: Running first sync`, { fromDate, toDate });
      } else {
        fromDate = this.syncDateManager.getSyncStartDate(activeCompany.id, entityType, 'incremental');
        this.dbService.log('INFO', `${entityType}: Running incremental sync`, { fromAlterId: fromDate });
      }

      // 5. Run sync with error handling
      result = await this.runEntitySync(profile, entityType, mode, fromDate, toDate).catch(err => {
        errorDetail = err?.message || 'Unknown error during entity sync';
        this.dbService.log('ERROR', `${entityType} sync failed`, { error: errorDetail });
        return { successCount: 0, failedCount: 1, status: 'FAILED', maxAlterId: '0', error: errorDetail };
      });

      // 6. First sync complete check (if first mode)
      if (mode === 'first') {
        const stillIncomplete = await this.dbService.getIncompleteMonths(entityType);
        if (stillIncomplete.length === 0) {
          await this.dbService.completeEntityFirstSync(entityType);
          this.dbService.log('INFO', `${entityType} first sync completed, marked as complete`);
        } else {
          errorDetail = errorDetail || `Incomplete months remaining: ${stillIncomplete.join(', ')}`;
        }
      }

      // 7. Log to sync_summary_history
      const syncStartedAt = new Date(syncStartTime).toISOString().replace('T', ' ').slice(0, 19);
      const duration = Math.round((Date.now() - syncStartTime) / 1000);

      const countField =
        entityType === 'CUSTOMER' ? 'customer_count' :
          entityType === 'JOURNAL' ? 'journal_count' :
            `${entityType.toLowerCase()}_count`;

      await this.dbService.logSyncSummary({
        sync_started_at: syncStartedAt,
        sync_mode: isFirstSyncComplete ? 'ENTITY_INCREMENTAL' : 'ENTITY_FIRST',
        trigger_type: 'MANUAL_SINGLE',
        entity_type: entityType,
        [countField]: result?.successCount || 0,
        overall_status: result?.status || 'UNKNOWN',
        error_detail: errorDetail || result?.error || null,
        total_records: (result?.successCount || 0) + (result?.failedCount || 0),
        duration_seconds: duration,
        max_alter_id: result?.maxAlterId || '0',
        incomplete_months: mode === 'first' && result?.status !== 'SUCCESS'
          ? (await this.dbService.getIncompleteMonths(entityType)).join(', ') || ''
          : ''
      });

      this.dbService.log('INFO', `Entity-specific sync completed for: ${entityType}`, {
        success: result?.successCount || 0,
        failed: result?.failedCount || 0,
        status: result?.status || 'UNKNOWN',
        duration_seconds: duration
      });

      await this.dbService.updateLastSuccessfulSync();

    } catch (error: any) {
      const syncStartedAt = new Date(syncStartTime).toISOString().replace('T', ' ').slice(0, 19);
      const duration = Math.round((Date.now() - syncStartTime) / 1000);

      const errorMsg = error?.message ||
        error?.response?.data?.message ||
        error?.stack?.split('\n')[0] ||
        'Unknown entity sync error';

      await this.dbService.logSyncSummary({
        sync_started_at: syncStartedAt,
        sync_mode: 'ENTITY_ERROR',
        trigger_type: 'MANUAL_SINGLE',
        entity_type: entityType,
        overall_status: 'FAILED',
        error_detail: errorMsg,
        total_records: 0,
        duration_seconds: duration,
        max_alter_id: '0'
      });

      this.dbService.log('ERROR', `Entity-specific sync crashed for ${entityType}`, { error: errorMsg });
      throw error;

    } finally {
      this.isRunning = false;
    }
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

}