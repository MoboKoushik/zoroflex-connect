import { DatabaseManager } from './db';
import { DataType, ChangeType, DataChange } from '../../types';

export class DataChangeService {
  private db: ReturnType<DatabaseManager['getDatabase']>;

  constructor(dbManager: DatabaseManager) {
    this.db = dbManager.getDatabase();
  }

  /**
   * Record a data change
   */
  recordChange(
    dataType: DataType,
    recordId: string,
    changeType: ChangeType,
    beforeData?: any,
    afterData?: any
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO data_changes (data_type, record_id, change_type, before_data, after_data, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      dataType,
      recordId,
      changeType,
      beforeData ? JSON.stringify(beforeData) : null,
      afterData ? JSON.stringify(afterData) : null,
      new Date().toISOString()
    );
  }

  /**
   * Get data changes for a data type
   */
  getChanges(dataType: DataType, limit: number = 100): DataChange[] {
    const stmt = this.db.prepare(`
      SELECT * 
      FROM data_changes 
      WHERE data_type = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);
    
    const results = stmt.all(dataType, limit) as DataChange[];
    return results.map(change => ({
      ...change,
      before_data: change.before_data ? JSON.parse(change.before_data as string) : undefined,
      after_data: change.after_data ? JSON.parse(change.after_data as string) : undefined,
    }));
  }

  /**
   * Get changes for a specific record
   */
  getRecordChanges(dataType: DataType, recordId: string): DataChange[] {
    const stmt = this.db.prepare(`
      SELECT * 
      FROM data_changes 
      WHERE data_type = ? AND record_id = ? 
      ORDER BY timestamp DESC
    `);
    
    const results = stmt.all(dataType, recordId) as DataChange[];
    return results.map(change => ({
      ...change,
      before_data: change.before_data ? JSON.parse(change.before_data as string) : undefined,
      after_data: change.after_data ? JSON.parse(change.after_data as string) : undefined,
    }));
  }

  /**
   * Clear old changes (older than specified days)
   */
  clearOldChanges(days: number = 90): void {
    const stmt = this.db.prepare(`
      DELETE FROM data_changes 
      WHERE timestamp < datetime('now', '-' || ? || ' days')
    `);
    
    stmt.run(days);
  }
}

