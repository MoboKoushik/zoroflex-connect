// src/services/sync.service.ts
import { DatabaseService, UserProfile } from '../database/database.service';
import { fetchCurrentCompany } from './fetch-to-tally/fetchCurrentCompany';
import { OrganizationService } from './send-to-platfrom/organization.service';
import { syncCustomersToAPI } from './dump_data/syncCustomersToAPI'

export class SyncService {
  private dbService: DatabaseService;
  private isRunning = false;

  constructor(
    dbService: DatabaseService,
    private readonly organizationService: OrganizationService
  ) {
    this.dbService = dbService;
  }


  private async fullSync(profile: UserProfile, type: 'MANUAL' | 'BACKGROUND' = 'BACKGROUND'): Promise<void> {
    if (this.isRunning) {
      this.dbService.log('WARN', 'Sync already in progress; skipping');
      return;
    }
    try {
      this.dbService.log('INFO', `${type} full sync initiated`);
      const prof = await this.dbService.getProfile();
      if (type === 'MANUAL' || !prof?.organization?.synced_at) {
        const result = await fetchCurrentCompany();
        if (result) {
          await this.organizationService.syncOrganization(profile, result);
        }
      }
      const ledgers = await syncCustomersToAPI();
      console.log('Total Ledgers:', JSON.stringify(ledgers, null, 2));
      await this.dbService.updateLastSuccessfulSync();
      this.dbService.log('INFO', `${type} full sync completed successfully`);
    } catch (e: any) {
      this.dbService.log('ERROR', 'Full sync failed', e);
    } finally {
      this.isRunning = false;
    }
  }

  async manualSync(profile: UserProfile): Promise<void> {
    await this.fullSync(profile, 'MANUAL');
  }

  startBackgroundSync(profile: UserProfile): void {
    this.fullSync(profile, 'BACKGROUND');
    setInterval(() => this.fullSync(profile, 'BACKGROUND'), 300000);
  }

  stop(): void {
    this.isRunning = false;
    this.dbService.log('INFO', 'Background sync stopped');
  }
}