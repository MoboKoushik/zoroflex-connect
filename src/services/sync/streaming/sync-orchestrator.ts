import { DatabaseService, UserProfile } from '../../database/database.service';
import { ResumeManager } from '../resume/resume-manager';
import { ApiSyncService } from '../api-sync/api-sync-service';

export class SyncOrchestrator {
  private resumeManager: ResumeManager;
  private apiSyncService: ApiSyncService;

  constructor(private db: DatabaseService) {
    this.resumeManager = new ResumeManager(db);
    this.apiSyncService = new ApiSyncService(db);
  }

  async syncEntity(entityType: 'CUSTOMER' | 'INVOICE' | 'RECEIPT' | 'JOURNAL', profile: UserProfile): Promise<void> {
    const runId = await this.db.logSyncStart('BACKGROUND', entityType);

    try {
      this.db.log('INFO', `Starting sync for ${entityType}`);

      // Step 1: Fetch from Tally and store in SQLite (with resume capability)
      await this.resumeManager.resumeSync(entityType);

      // Step 2: Sync to API (separate process, doesn't block local usage)
      try {
        await this.apiSyncService.syncToAPI(entityType);
      } catch (apiError: any) {
        // API sync failure doesn't block - log and continue
        this.db.log('WARN', `API sync failed for ${entityType}, but local sync succeeded`, {
          error: apiError.message
        });
      }

      // Get sync stats
      const status = await this.db.getEntitySyncStatus(entityType);
      const unsyncedCount = (await this.db.getUnsyncedRecords(entityType, 10000)).length;

      await this.db.logSyncEnd(
        runId,
        'SUCCESS',
        unsyncedCount === 0 ? 100 : 95, // Estimate success rate
        0,
        status?.last_max_alter_id || '0',
        `Sync completed. ${unsyncedCount} records pending API sync.`
      );

      this.db.log('INFO', `Completed sync for ${entityType}`);
    } catch (error: any) {
      await this.db.logSyncEnd(
        runId,
        'FAILED',
        0,
        1,
        undefined,
        error.message
      );
      this.db.log('ERROR', `Sync failed for ${entityType}`, { error: error.message });
      throw error;
    }
  }

  async syncAll(profile: UserProfile): Promise<void> {
    this.db.log('INFO', 'Starting full sync (all entities)');

    // Sync in order: Customers first (vouchers depend on customers)
    await this.syncEntity('CUSTOMER', profile);
    await this.syncEntity('INVOICE', profile);
    await this.syncEntity('RECEIPT', profile);
    await this.syncEntity('JOURNAL', profile);

    this.db.log('INFO', 'Full sync completed');
  }
}

