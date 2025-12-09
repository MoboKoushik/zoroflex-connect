import * as path from 'path';
import * as fs from 'fs';
import sqlite3 from 'sqlite3';
import { app } from 'electron';  // For userData path

export class DatabaseService {
  private db: sqlite3.Database | null = null;
  private dbPath: string;

  constructor() {
    this.dbPath = path.join(app.getPath('userData'), 'tally-sync.db');
    if (!fs.existsSync(path.dirname(this.dbPath))) {
      fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    }
    this.init();
  }

  private init(): void {
    this.db = new sqlite3.Database(this.dbPath, (err) => {
      if (err) {
        console.error('Database init error:', err);
      } else {
        console.log('SQLite DB connected');
        this.createTables();
      }
    });
  }

  private createTables(): void {
    // Existing tables (assume these are already in your code)
    const syncHistorySQL = `
      CREATE TABLE IF NOT EXISTS sync_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_type TEXT NOT NULL,
        status TEXT NOT NULL,
        data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    this.db?.run(syncHistorySQL, (err) => {
      if (err) console.error('Sync history table create error:', err);
    });

    const logsSQL = `
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    this.db?.run(logsSQL, (err) => {
      if (err) console.error('Logs table create error:', err);
    });

    // Updated profiles table with new fields
    const profilesSQL = `
      CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        token TEXT NOT NULL,
        biller_id TEXT,
        apikey TEXT,
        organization TEXT,  -- JSON stringified
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    this.db?.run(profilesSQL, (err) => {
      if (err) console.error('Profiles table create error:', err);
    });
  }

  // Updated: Get full profile
  getProfile(): Promise<{ email: string; token: string; biller_id?: string; apikey?: string; organization?: any } | null> {
    return new Promise((resolve, reject) => {
      this.db?.get(
        'SELECT email, token, biller_id, apikey, organization FROM profiles LIMIT 1',
        (err, row: any) => {
          if (err) {
            console.error('Get profile error:', err);
            reject(err);
          } else {
            if (row && row.organization) {
              try {
                row.organization = JSON.parse(row.organization);
              } catch (parseErr) {
                console.error('Parse organization JSON error:', parseErr);
                row.organization = {};
              }
            }
            resolve(row ? row : null);
          }
        }
      );
    });
  }

  // Updated: Save full profile after login
  saveProfile(email: string, token: string, billerId?: string, apikey?: string, organization?: any): Promise<void> {
    const orgJson = organization ? JSON.stringify(organization) : null;
    return new Promise((resolve, reject) => {
      this.db?.run(
        'INSERT OR REPLACE INTO profiles (email, token, biller_id, apikey, organization) VALUES (?, ?, ?, ?, ?)',
        [email, token, billerId || null, apikey || null, orgJson],
        (err) => {
          if (err) {
            console.error('Save profile error:', err);
            reject(err);
          } else {
            console.log('Profile saved with full data');
            resolve();
          }
        }
      );
    });
  }

  // Example existing method (keep if you have; e.g., for logs)
  logSync(syncType: string, status: string, data?: any): void {
    const dataStr = data ? JSON.stringify(data) : null;
    this.db?.run(
      'INSERT INTO logs (level, message) VALUES (?, ?)',
      [`SYNC_${status.toUpperCase()}`, `Sync ${syncType}: ${dataStr || 'Completed'}`],
      (err) => {
        if (err) console.error('Log error:', err);
      }
    );
  }

  // Close DB on app quit (add if needed)
  close(): void {
    this.db?.close((err) => {
      if (err) console.error('DB close error:', err);
    });
  }
}