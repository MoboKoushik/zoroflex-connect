// src/services/sync/entity-sync/base-entity-sync.ts

import { DatabaseService, UserProfile } from '../../database/database.service';

export interface SyncResult {
  status: 'SUCCESS' | 'FAILED' | 'PARTIAL';
  entityCount: number;
  failedCount?: number;
  message?: string;
}

export interface MonthBatch {
  month: string;              // Format: YYYY-MM (e.g., '2023-04')
  fromDate: string;           // Format: YYYY-MM-DD (e.g., '2023-04-01')
  toDate: string;             // Format: YYYY-MM-DD (e.g., '2023-04-30')
  tallyFromDate: string;      // Format: YYYYMMDD (e.g., '20230401')
  tallyToDate: string;        // Format: YYYYMMDD (e.g., '20230430')
}

export interface BatchProgress {
  lastCompletedMonth: string | null;
  currentAlterId: string;
  completedBatches: number;
  totalBatches: number;
  syncMode: 'first_sync' | 'incremental';
}

/**
 * Abstract base class for entity sync services
 * Implements template method pattern for sync operations
 */
export abstract class BaseEntitySync {
  protected entityType: string;
  protected db: DatabaseService;

  constructor(entityType: string, dbService?: DatabaseService) {
    this.entityType = entityType;
    this.db = dbService || new DatabaseService();
  }

  /**
   * Main sync method - determines sync mode and delegates to appropriate handler
   */
  async sync(profile: UserProfile, syncType: 'MANUAL' | 'BACKGROUND'): Promise<SyncResult> {
    const syncMode = await this.db.getEntitySyncMode(this.entityType);

    this.db.log('INFO', `Starting ${syncMode} sync for ${this.entityType}`, {
      syncType,
      syncMode
    });

    try {
      if (syncMode === 'first_sync') {
        return await this.performFirstSync(profile, syncType);
      } else {
        return await this.performIncrementalSync(profile, syncType);
      }
    } catch (error: any) {
      this.db.log('ERROR', `${this.entityType} sync failed`, {
        error: error.message,
        syncMode,
        syncType
      });
      throw error;
    }
  }

  /**
   * Abstract methods to be implemented by subclasses
   */
  protected abstract performFirstSync(profile: UserProfile, syncType: string): Promise<SyncResult>;
  protected abstract performIncrementalSync(profile: UserProfile, syncType: string): Promise<SyncResult>;
  protected abstract sendToApi(records: any[], profile: UserProfile): Promise<any>;

  /**
   * Common utility: Generate monthly batches from date range
   * Reused logic from fetchLedgers.ts
   */
  protected async generateMonthlyBatches(fromDate: string, toDate: string): Promise<MonthBatch[]> {
    const batches: MonthBatch[] = [];
    const start = new Date(fromDate);
    const end = new Date(toDate);

    let current = new Date(start);

    while (current <= end) {
      const year = current.getFullYear();
      const month = current.getMonth();

      // First day of month
      const monthStart = new Date(year, month, 1);
      // Last day of month
      const monthEnd = new Date(year, month + 1, 0);

      // Don't go beyond the end date
      const batchEnd = monthEnd > end ? end : monthEnd;

      const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
      const fromDateStr = this.formatDate(monthStart);
      const toDateStr = this.formatDate(batchEnd);
      const tallyFromDateStr = this.formatDateForTally(monthStart);
      const tallyToDateStr = this.formatDateForTally(batchEnd);

      batches.push({
        month: monthStr,
        fromDate: fromDateStr,
        toDate: toDateStr,
        tallyFromDate: tallyFromDateStr,
        tallyToDate: tallyToDateStr
      });

      // Move to next month
      current = new Date(year, month + 1, 1);
    }

    return batches;
  }

  /**
   * Get batch progress for entity (used to resume interrupted sync)
   */
  protected async getBatchProgress(): Promise<BatchProgress> {
    return await this.db.getEntityBatchProgress(this.entityType);
  }

  /**
   * Update batch progress after completing a monthly batch
   */
  protected async updateBatchProgress(progress: {
    lastCompletedMonth: string;
    completedBatches: number;
  }): Promise<void> {
    await this.db.updateEntityBatchProgress(this.entityType, progress);
  }

  /**
   * Mark first sync as completed and switch to incremental mode
   */
  protected async markFirstSyncCompleted(): Promise<void> {
    await this.db.completeEntityFirstSync(this.entityType);
    await this.db.setEntitySyncMode(this.entityType, 'incremental');
  }

  /**
   * Format date to YYYY-MM-DD
   */
  protected formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Format date to YYYYMMDD for Tally
   */
  protected formatDateForTally(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  /**
   * Chunk array into smaller batches
   */
  protected chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Extract maximum ALTER_ID from records
   */
  protected extractMaxAlterId(records: any[]): string {
    const alterIds = records.map(r => parseInt(r.ALTER_ID || r.tally_alter_id || '0'));
    return Math.max(...alterIds).toString();
  }
}
