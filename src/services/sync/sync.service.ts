import { DatabaseService, UserProfile } from '../../services/database/database.service';
import { fetchCurrentCompany } from './fetch-to-tally/fetchCurrentCompany';
import { OrganizationService } from './send-to-platfrom/organization.service';
import { syncCustomers } from '../sync/fetch-to-tally/fetchLedgers';
import { syncVouchers } from '../sync/fetch-to-tally/fetchVouchers';

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

      const prof = await this.dbService.getProfile();
      if (type === 'MANUAL' || !prof?.organization?.synced_at) {
        this.dbService.log('INFO', 'Syncing organization data');
        const companyData = await fetchCurrentCompany();
        if (companyData) {
          await this.organizationService.syncOrganization(profile, companyData);
        } else {
          this.dbService.log('WARN', 'No company data received from Tally – skipping organization sync');
        }
      }

      this.dbService.log('INFO', 'Starting customer sync');
      await syncCustomers();

      this.dbService.log('INFO', 'Starting voucher sync (Invoice, Receipt, Journal)');
      await syncVouchers();


      await this.dbService.updateLastSuccessfulSync();
      this.dbService.log('INFO', `${type} sync completed successfully`);

    } catch (error: any) {
      this.dbService.log('ERROR', `${type} sync failed`, {
        error: error?.message || error
      });
    } finally {
      this.isRunning = false;
    }
  }


  async manualSync(profile: UserProfile): Promise<void> {
    this.dbService.log('INFO', 'Manual sync requested by user');
    await this.fullSync(profile, 'MANUAL');
  }


  startBackgroundSync(profile: UserProfile): void {
    this.dbService.log('INFO', 'Starting background sync (initial run + every 5 minutes)');
    this.fullSync(profile, 'BACKGROUND');

    setInterval(() => {
      this.fullSync(profile, 'BACKGROUND');
    }, 5 * 60 * 1000);
  }

  stop(): void {
    this.isRunning = false;
    this.dbService.log('INFO', 'Background sync stopped');
  }
}