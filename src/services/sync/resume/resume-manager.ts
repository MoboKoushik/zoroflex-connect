import { DatabaseService } from '../../database/database.service';
import { BatchFetcher } from '../streaming/batch-fetcher';
import { BatchProcessor } from '../streaming/batch-processor';

export class ResumeManager {
  private batchFetcher: BatchFetcher;
  private batchProcessor: BatchProcessor;
  private readonly BATCH_SIZE = 100;

  constructor(private db: DatabaseService) {
    this.batchFetcher = new BatchFetcher();
    this.batchProcessor = new BatchProcessor(db);
  }

  async resumeSync(entityType: string): Promise<void> {
    // 1. Get last batch status
    const status = await this.db.getEntitySyncStatus(entityType);
    
    if (!status) {
      this.db.log('ERROR', `No sync status found for entity: ${entityType}`);
      return;
    }

    // 2. Check if last sync was interrupted
    if (status.last_sync_status === 'RUNNING') {
      this.db.log('INFO', `Resuming interrupted sync for ${entityType} from AlterID ${status.last_max_alter_id}`);
      // 3. Resume from last successful AlterID
      await this.syncFromAlterId(entityType, status.last_max_alter_id);
    } else {
      // Start fresh from last_max_alter_id
      await this.syncFromAlterId(entityType, status.last_max_alter_id);
    }
  }

  private async syncFromAlterId(entityType: string, fromAlterId: string): Promise<void> {
    // Mark as RUNNING
    await this.db.updateEntitySyncStatus(entityType, {
      last_sync_status: 'RUNNING',
      last_batch_start_alter_id: fromAlterId
    });

    try {
      let currentAlterId = fromAlterId;
      let hasMore = true;
      let totalProcessed = 0;
      let totalFailed = 0;

      this.db.log('INFO', `Starting sync for ${entityType} from AlterID ${currentAlterId}`);

      while (hasMore) {
        try {
          // Fetch batch
          const { records, toAlterId, actualCount } = await this.batchFetcher.fetchBatch(
            entityType,
            currentAlterId
          );

          if (records.length === 0) {
            hasMore = false;
            this.db.log('INFO', `No more records found for ${entityType} after AlterID ${currentAlterId}`);
            break;
          }

          this.db.log('INFO', `Fetched ${records.length} ${entityType} records (AlterID ${currentAlterId} to ${toAlterId})`);

          // Process batch
          const { successCount, failedCount } = await this.batchProcessor.processBatch(
            entityType,
            records,
            toAlterId
          );

          totalProcessed += successCount;
          totalFailed += failedCount;

          this.db.log('INFO', `Processed batch: ${successCount} success, ${failedCount} failed`);

          // Update checkpoint after EACH batch (critical for resume capability)
          await this.db.updateEntityMaxAlterId(entityType, toAlterId);
          await this.db.updateEntitySyncStatus(entityType, {
            last_batch_end_alter_id: toAlterId
          });

          currentAlterId = toAlterId;

          // If we got less than BATCH_SIZE, we're done
          if (actualCount < this.BATCH_SIZE) {
            hasMore = false;
            this.db.log('INFO', `Reached end of ${entityType} data (got ${actualCount} < ${this.BATCH_SIZE} records)`);
          }
        } catch (batchError: any) {
          this.db.log('ERROR', `Batch processing failed for ${entityType}`, {
            fromAlterId: currentAlterId,
            error: batchError.message
          });
          // Continue to next batch instead of failing completely
          // Increment AlterID to skip this batch
          const currentIdNum = parseInt(currentAlterId || '0', 10);
          currentAlterId = (currentIdNum + 100).toString();
          totalFailed += this.BATCH_SIZE; // Estimate failed count
        }
      }

      // Mark as IDLE
      await this.db.updateEntitySyncStatus(entityType, {
        last_sync_status: 'IDLE',
        last_max_alter_id: currentAlterId
      });

      this.db.log('INFO', `Completed sync for ${entityType}: ${totalProcessed} processed, ${totalFailed} failed`);
    } catch (error: any) {
      // Mark as FAILED
      await this.db.updateEntitySyncStatus(entityType, {
        last_sync_status: 'FAILED'
      });
      this.db.log('ERROR', `Sync failed for ${entityType}`, { error: error.message });
      throw error;
    }
  }
}

