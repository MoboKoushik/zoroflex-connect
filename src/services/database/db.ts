import Database from 'better-sqlite3';
import * as path from 'path';
import { app } from 'electron';

export class DatabaseManager {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    // Use app data directory if in Electron context, otherwise use current directory
    const basePath = app ? app.getPath('userData') : __dirname;
    this.dbPath = dbPath || path.join(basePath, 'tally-sync.db');
    this.db = new Database(this.dbPath);
    this.initializeSchema();
  }

  /**
   * Initialize database schema
   */
  private initializeSchema(): void {
    // Sync history table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sync_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data_type TEXT NOT NULL,
        last_sync_timestamp DATETIME NOT NULL,
        record_count INTEGER DEFAULT 0,
        status TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Sync logs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sync_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_id TEXT NOT NULL,
        data_type TEXT NOT NULL,
        timestamp DATETIME NOT NULL,
        status TEXT NOT NULL,
        error_message TEXT,
        duration_ms INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Data change history table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS data_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data_type TEXT NOT NULL,
        record_id TEXT NOT NULL,
        change_type TEXT NOT NULL,
        before_data TEXT,
        after_data TEXT,
        timestamp DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sync_history_data_type ON sync_history(data_type);
      CREATE INDEX IF NOT EXISTS idx_sync_logs_data_type ON sync_logs(data_type);
      CREATE INDEX IF NOT EXISTS idx_sync_logs_timestamp ON sync_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_data_changes_data_type ON data_changes(data_type);
      CREATE INDEX IF NOT EXISTS idx_data_changes_record_id ON data_changes(record_id);
    `);
  }

  /**
   * Get database instance
   */
  getDatabase(): Database.Database {
    return this.db;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

// Singleton instance
let dbManager: DatabaseManager | null = null;

export function getDatabaseManager(dbPath?: string): DatabaseManager {
  if (!dbManager) {
    dbManager = new DatabaseManager(dbPath);
  }
  return dbManager;
}

