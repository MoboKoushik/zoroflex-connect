import { DatabaseManager } from './db';
import { DataType, SyncStatus, SyncHistory } from '../../types';

export class HistoryService {
  private db: ReturnType<DatabaseManager['getDatabase']>;

  constructor(dbManager: DatabaseManager) {
    this.db = dbManager.getDatabase();
  }

  /**
   * Get last sync timestamp for a data type
   */
  getLastSyncTimestamp(dataType: DataType): Date | null {
    const stmt = this.db.prepare(`
      SELECT last_sync_timestamp 
      FROM sync_history 
      WHERE data_type = ? 
      ORDER BY last_sync_timestamp DESC 
      LIMIT 1
    `);
    
    const result = stmt.get(dataType) as { last_sync_timestamp: string } | undefined;
    return result ? new Date(result.last_sync_timestamp) : null;
  }

  /**
   * Update sync history
   */
  updateSyncHistory(
    dataType: DataType,
    recordCount: number,
    status: SyncStatus
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO sync_history (data_type, last_sync_timestamp, record_count, status)
      VALUES (?, ?, ?, ?)
    `);
    
    stmt.run(dataType, new Date().toISOString(), recordCount, status);
  }

  /**
   * Get sync history for a data type
   */
  getSyncHistory(dataType: DataType, limit: number = 10): SyncHistory[] {
    const stmt = this.db.prepare(`
      SELECT * 
      FROM sync_history 
      WHERE data_type = ? 
      ORDER BY last_sync_timestamp DESC 
      LIMIT ?
    `);
    
    return stmt.all(dataType, limit) as SyncHistory[];
  }

  /**
   * Get all sync history
   */
  getAllSyncHistory(limit: number = 50): SyncHistory[] {
    const stmt = this.db.prepare(`
      SELECT * 
      FROM sync_history 
      ORDER BY last_sync_timestamp DESC 
      LIMIT ?
    `);
    
    return stmt.all(limit) as SyncHistory[];
  }
}

