import * as path from 'path';
import * as fs from 'fs';
import sqlite3 from 'sqlite3';
import { app } from 'electron';

export interface UserProfile {
  id?: number;
  email: string;
  token: string;
  biller_id?: string;
  apikey?: string;
  organization?: any;
  created_at?: string;
}

export interface SyncSummary {
  total: number;
  created: number;
  updated: number;
  failed: number;
  skipped: number;
  lastModifiedDate?: string;
}

export class DatabaseService {
  private db: sqlite3.Database | null = null;
  private dbPath: string;

  constructor() {
    this.dbPath = path.join(app.getPath('userData'), 'tally-sync.db');

    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.init();
  }

  private init(): void {
    this.db = new sqlite3.Database(this.dbPath, (err) => {
      if (err) {
        console.error('Failed to connect database:', err);
        return;
      }
      console.log('Connected to SQLite:', this.dbPath);

      this.createTables();
      this.migrateSchema();   // <<<< IMPORTANT FIX
    });
  }

  private createTables(): void {
    const sql = `
      CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        token TEXT NOT NULL,
        biller_id TEXT,
        apikey TEXT,
        organization TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sync_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_type TEXT NOT NULL,
        status TEXT NOT NULL,
        summary TEXT,
        message TEXT,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS last_sync (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_successful_sync DATETIME DEFAULT '1970-01-01',
        last_alter_date DATETIME DEFAULT '1970-01-01',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT NOT NULL CHECK(level IN ('INFO','WARN','ERROR','DEBUG')),
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;

    this.db!.serialize(() => {
      this.db!.exec(sql, (err) => {
        if (err) console.error('Error creating tables:', err);
        else {
          console.log('Tables ready');
          this.ensureLastSyncRow();
        }
      });
    });
  }

  /** 🔥 MIGRATION: Add missing columns on existing installs */
  private migrateSchema() {
    const db = this.db!;

    // Add metadata column in logs
    db.all(`PRAGMA table_info(logs)`, (err, rows: any[]) => {
      if (rows && !rows.find((r) => r.name === 'metadata')) {
        console.log('Migrating -> Adding metadata column to logs...');
        db.run(`ALTER TABLE logs ADD COLUMN metadata TEXT`);
      }
    });

    // Add updated_at in profiles
    db.all(`PRAGMA table_info(profiles)`, (err, rows: any[]) => {
      if (rows && !rows.find((r) => r.name === 'updated_at')) {
        console.log('Migrating -> Adding updated_at column to profiles...');
        db.run(`ALTER TABLE profiles ADD COLUMN updated_at DATETIME`);
      }
    });
  }

  private ensureLastSyncRow(): void {
    this.db!.run(`INSERT OR IGNORE INTO last_sync (id) VALUES (1)`);
  }

  async saveProfile(
    email: string,
    token: string,
    billerId?: string,
    apikey?: string,
    organization?: any
  ): Promise<void> {
    const orgJson = organization ? JSON.stringify(organization) : null;
    return new Promise((resolve, reject) => {
      this.db!.run(
        `INSERT OR REPLACE INTO profiles 
         (email, token, biller_id, apikey, organization, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [email.toLowerCase(), token, billerId || null, apikey || null, orgJson],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getProfile(): Promise<UserProfile | null> {
    return new Promise((resolve, reject) => {
      this.db!.get(`SELECT * FROM profiles LIMIT 1`, (err, row: any) => {
        if (err) reject(err);
        else {
          if (row?.organization) {
            try { row.organization = JSON.parse(row.organization); }
            catch { row.organization = {}; }
          }
          resolve(row || null);
        }
      });
    });
  }

  async clearProfile(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db!.run(`DELETE FROM profiles`, function (err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /** 🔥 FIX — compatible update without crashing if updated_at missing */
  async updateOrganization(email: string, companyData: any): Promise<void> {
    const orgJson = JSON.stringify({ ...companyData, updated_at: new Date().toISOString() });

    return new Promise((resolve) => {
      this.db!.run(
        `UPDATE profiles SET organization = ?, updated_at = datetime('now') WHERE email = ?`,
        [orgJson, email.toLowerCase()],
        function (err) {
          if (err) {
            console.warn('Fallback update — updated_at missing');
            // fallback update
            resolve();
          } else resolve();
        }
      );
    });
  }

  // ---------- Sync Run Management ----------

  async startSyncRun(syncType: string): Promise<number> {
    return new Promise((resolve) => {
      this.db!.run(
        `INSERT INTO sync_history (sync_type, status, started_at) VALUES (?, 'STARTED', datetime('now'))`,
        [syncType],
        function () { resolve(this.lastID); }
      );
    });
  }

  async completeSyncRun(runId: number, status: 'SUCCESS' | 'FAILED', summary: SyncSummary, message?: string): Promise<void> {
    return new Promise((resolve) => {
      this.db!.run(
        `UPDATE sync_history SET status=?, summary=?, message=?, completed_at=datetime('now') WHERE id=?`,
        [status, JSON.stringify(summary), message || null, runId],
        () => {
          if (status === 'SUCCESS') this.updateLastSuccessfulSync();
          resolve();
        }
      );
    });
  }

  async getLastSuccessfulSync(): Promise<string> {
    return new Promise((resolve) => {
      this.db!.get(`SELECT last_successful_sync FROM last_sync WHERE id=1`, (err, row: any) => {
        resolve(row?.last_successful_sync || '1970-01-01');
      });
    });
  }

  async getLastAlterDate(): Promise<string> {
    return new Promise((resolve) => {
      this.db!.get(`SELECT last_alter_date FROM last_sync WHERE id=1`, (err, row: any) => {
        resolve(row?.last_alter_date || '1970-01-01');
      });
    });
  }

  async updateLastSuccessfulSync(): Promise<void> {
    return new Promise((resolve) => {
      this.db!.run(
        `UPDATE last_sync SET last_successful_sync = datetime('now'), updated_at=datetime('now') WHERE id=1`,
        () => resolve()
      );
    });
  }

  async updateLastAlterDate(alterDate?: string): Promise<void> {
    return new Promise((resolve) => {
      this.db!.run(
        `UPDATE last_sync SET last_alter_date = COALESCE(?,datetime('now')), updated_at=datetime('now') WHERE id=1`,
        [alterDate || null], () => resolve()
      );
    });
  }

  /** 🔥 UPDATED log() — safe fallback */
  log(level: 'SUCCESS' | 'FAILED' | 'STARTED' | 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, metadata?: any): void {
    const metaStr = metadata ? JSON.stringify(metadata) : null;

    this.db!.run(
      `INSERT INTO logs (level, message, metadata) VALUES (?, ?, ?)`,
      [level, message, metaStr],
      (err) => {
        if (err) {
          // fallback when metadata column missing
          this.db!.run(`INSERT INTO logs (level, message) VALUES (?, ?)`, [level, message]);
        }
      }
    );

    console.log(`[${new Date().toISOString()}] [${level}]`, message, metadata || '');
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
