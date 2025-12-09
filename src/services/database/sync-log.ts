import { DatabaseManager } from './db';
import { DataType, SyncStatus, SyncLog } from '../../types';

export class SyncLogService {
  private db: ReturnType<DatabaseManager['getDatabase']>;

  constructor(dbManager: DatabaseManager) {
    this.db = dbManager.getDatabase();
  }

  /**
   * Create a sync log entry
   */
  createLog(
    syncId: string,
    dataType: DataType,
    status: SyncStatus,
    durationMs: number,
    errorMessage?: string
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO sync_logs (sync_id, data_type, timestamp, status, error_message, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      syncId,
      dataType,
      new Date().toISOString(),
      status,
      errorMessage || null,
      durationMs
    );
  }

  /**
   * Get sync logs for a data type
   */
  getLogs(dataType: DataType, limit: number = 50): SyncLog[] {
    const stmt = this.db.prepare(`
      SELECT * 
      FROM sync_logs 
      WHERE data_type = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);
    
    return stmt.all(dataType, limit) as SyncLog[];
  }

  /**
   * Get all sync logs
   */
  getAllLogs(limit: number = 100): SyncLog[] {
    const stmt = this.db.prepare(`
      SELECT * 
      FROM sync_logs 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);
    
    return stmt.all(limit) as SyncLog[];
  }

  /**
   * Get failed sync logs
   */
  getFailedLogs(limit: number = 50): SyncLog[] {
    const stmt = this.db.prepare(`
      SELECT * 
      FROM sync_logs 
      WHERE status = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);
    
    return stmt.all(SyncStatus.FAILED, limit) as SyncLog[];
  }

  /**
   * Clear old logs (older than specified days)
   */
  clearOldLogs(days: number = 30): void {
    const stmt = this.db.prepare(`
      DELETE FROM sync_logs 
      WHERE timestamp < datetime('now', '-' || ? || ' days')
    `);
    
    stmt.run(days);
  }
}

