// src/database/database.service.ts

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
  updated_at?: string;
}

export interface SyncSummary {
  total: number;
  created: number;
  updated: number;
  failed: number;
  skipped: number;
}

export interface SyncHistoryRow {
  id: number;
  sync_type: string;
  entity_type: string;
  status: string;
  entity_count: number;
  failed_count?: number;
  max_alter_id: string;
  message: string;
  summary?: string;
  started_at: string;
  completed_at?: string;
}

export interface LogRow {
  id: number;
  level: string;
  message: string;
  metadata?: string;
  created_at: string;
}

export interface EntitySyncStatus {
  entity: string;
  last_max_alter_id: string;
  last_sync_at: string;
}

export class DatabaseService {
  private db: sqlite3.Database | null = null;
  private dbPath: string;

  constructor() {
    this.dbPath = path.join(app.getPath('userData'), 'tally-sync_v400.db');
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.init();
  }

  private init(): void {
    this.db = new sqlite3.Database(this.dbPath, (err) => {
      if (err) return console.error('DB Error:', err);
      console.log('SQLite Connected →', this.dbPath);
      this.createTables();
    });
  }

  private createTables(): void {
    const sql = `
      -- User profiles
      CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        token TEXT NOT NULL,
        biller_id TEXT,
        apikey TEXT,
        organization TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Per-entity incremental sync tracking
      CREATE TABLE IF NOT EXISTS entity_sync_status (
        entity TEXT PRIMARY KEY,
        last_max_alter_id TEXT DEFAULT '0',
        last_sync_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Global last successful sync timestamp
      CREATE TABLE IF NOT EXISTS global_sync_status (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_successful_sync DATETIME DEFAULT '1970-01-01',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Sync history logs (detailed per run)
      CREATE TABLE IF NOT EXISTS sync_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_type TEXT NOT NULL,        -- MANUAL / BACKGROUND
        entity_type TEXT NOT NULL,      -- CUSTOMER, INVOICE, etc.
        status TEXT NOT NULL,           -- STARTED, SUCCESS, FAILED, PARTIAL
        entity_count INTEGER DEFAULT 0, -- successful
        failed_count INTEGER DEFAULT 0,
        max_alter_id TEXT,
        message TEXT,
        summary TEXT,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
      );

      -- Application logs
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Seed initial data
      INSERT OR IGNORE INTO global_sync_status (id) VALUES (1);

      -- Seed common entities
      INSERT OR IGNORE INTO entity_sync_status (entity, last_max_alter_id) VALUES
        ('CUSTOMER', '0'),
        ('INVOICE', '0'),
        ('PAYMENT', '0'),
        ('STOCKITEM', '0'),
        ('JOURNAL', '0');
    `;

    this.db!.exec(sql, (err) => {
      if (err) {
        console.error('Table creation failed:', err);
      } else {
        console.log('Database tables initialized successfully');
      }
    });
  }

  // === Profile Management ===
  async saveProfile(email: string, token: string, billerId?: string, apikey?: string, org?: any): Promise<void> {
    const orgJson = org ? JSON.stringify(org) : null;
    return new Promise((resolve, reject) => {
      this.db!.run(
        `INSERT OR REPLACE INTO profiles (email, token, biller_id, apikey, organization, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        [email.toLowerCase(), token, billerId || null, apikey || null, orgJson],
        (err) => (err ? reject(err) : resolve())
      );
    });
  }

  async getProfile(): Promise<UserProfile | null> {
    return new Promise((resolve) => {
      this.db!.get(`SELECT * FROM profiles LIMIT 1`, (err, row: any) => {
        if (row?.organization) {
          try { row.organization = JSON.parse(row.organization); } catch (e) { console.error('JSON parse error in organization', e); }
        }
        resolve(row || null);
      });
    });
  }

  async updateOrganization(email: string, data: any): Promise<void> {
    const json = JSON.stringify({ ...data, updated_at: new Date().toISOString() });
    return new Promise((resolve) => {
      this.db!.run(
        `UPDATE profiles SET organization = ?, updated_at = datetime('now') WHERE email = ?`,
        [json, email.toLowerCase()],
        () => resolve()
      );
    });
  }

  async logoutAndClearProfile(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db!.serialize(() => {
        this.db!.run('BEGIN TRANSACTION');
        this.db!.run('DELETE FROM profiles');
        this.db!.run('DELETE FROM sync_history');
        this.db!.run('DELETE FROM logs');
        this.db!.run(`UPDATE global_sync_status SET last_successful_sync = '1970-01-01' WHERE id = 1`);
        this.db!.run(`UPDATE entity_sync_status SET last_max_alter_id = '0', last_sync_at = datetime('now')`);
        this.db!.run('COMMIT', (err) => {
          if (err) {
            this.db!.run('ROLLBACK');
            reject(err);
          } else {
            this.log('INFO', 'Logged out & all data cleared');
            resolve();
          }
        });
      });
    });
  }

  // === Entity-Specific AlterID Tracking ===
  async getEntityMaxAlterId(entity: string): Promise<string> {
    return new Promise((resolve) => {
      this.db!.get(
        `SELECT last_max_alter_id FROM entity_sync_status WHERE entity = ?`,
        [entity.toUpperCase()],
        (err, row: any) => {
          resolve(row?.last_max_alter_id || '0');
        }
      );
    });
  }

  async updateEntityMaxAlterId(entity: string, alterId: string): Promise<void> {
    return new Promise((resolve) => {
      this.db!.run(
        `INSERT INTO entity_sync_status (entity, last_max_alter_id, last_sync_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(entity) DO UPDATE SET
           last_max_alter_id = excluded.last_max_alter_id,
           last_sync_at = excluded.last_sync_at`,
        [entity.toUpperCase(), alterId],
        () => resolve()
      );
    });
  }

  async getAllEntitySyncStatus(): Promise<EntitySyncStatus[]> {
    return new Promise((resolve) => {
      this.db!.all(
        `SELECT entity, last_max_alter_id, last_sync_at FROM entity_sync_status ORDER BY last_sync_at DESC`,
        (err, rows: any[]) => {
          resolve(rows || []);
        }
      );
    });
  }

  // === Global Sync Timestamp ===
  async updateLastSuccessfulSync(): Promise<void> {
    return new Promise((resolve) => {
      this.db!.run(
        `UPDATE global_sync_status SET last_successful_sync = datetime('now'), updated_at = datetime('now') WHERE id = 1`,
        () => resolve()
      );
    });
  }

  async getLastSuccessfulSync(): Promise<string> {
    return new Promise((resolve) => {
      this.db!.get(
        `SELECT last_successful_sync FROM global_sync_status WHERE id = 1`,
        (err, row: any) => {
          resolve(row?.last_successful_sync || '1970-01-01');
        }
      );
    });
  }

  // === Sync History Logging ===
  async logSyncStart(type: 'MANUAL' | 'BACKGROUND', entity: string): Promise<number> {
    return new Promise((resolve, reject) => {
      this.db!.run(
        `INSERT INTO sync_history (sync_type, entity_type, status) VALUES (?, ?, 'STARTED')`,
        [type, entity.toUpperCase()],
        function (err) {
          if (err) return reject(err);
          resolve(this.lastID);
        }
      );
    });
  }

  async logSyncEnd(
    id: number,
    status: 'SUCCESS' | 'FAILED' | 'PARTIAL',
    successCount: number,
    failedCount: number = 0,
    maxId?: string,
    msg?: string,
    summary?: any
  ): Promise<void> {
    return new Promise((resolve) => {
      this.db!.run(
        `UPDATE sync_history
         SET status = ?, entity_count = ?, failed_count = ?, max_alter_id = ?, message = ?, summary = ?, completed_at = datetime('now')
         WHERE id = ?`,
        [status, successCount, failedCount, maxId || null, msg || null, summary ? JSON.stringify(summary) : null, id],
        () => resolve()
      );
    });
  }

  // === Logging ===
  log(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', msg: string, meta?: any): void {
    const metadata = meta ? JSON.stringify(meta) : null;
    this.db!.run(
      `INSERT INTO logs (level, message, metadata) VALUES (?, ?, ?)`,
      [level, msg, metadata],
      () => {}
    );
    console.log(`[${new Date().toISOString()}] [${level}] ${msg}`, meta || '');
  }

  // === Dashboard Data ===
  async getSyncHistory(limit: number = 100): Promise<SyncHistoryRow[]> {
    return new Promise((resolve, reject) => {
      this.db!.all(`SELECT * FROM sync_history ORDER BY started_at DESC LIMIT ?`, [limit], (err, rows: any[]) => {
        if (err) return reject(err);
        rows.forEach(row => {
          if (row.summary) {
            try { row.summary = JSON.parse(row.summary); } catch {}
          }
        });
        resolve(rows);
      });
    });
  }

  async getLogs(limit: number = 200): Promise<LogRow[]> {
    return new Promise((resolve, reject) => {
      this.db!.all(`SELECT * FROM logs ORDER BY created_at DESC LIMIT ?`, [limit], (err, rows: any[]) => {
        if (err) return reject(err);
        rows.forEach(row => {
          if (row.metadata) {
            try { row.metadata = JSON.parse(row.metadata); } catch {}
          }
        });
        resolve(rows);
      });
    });
  }

  async getLastSync(): Promise<{ last_successful_sync: string } | null> {
    return new Promise((resolve) => {
      this.db!.get(`SELECT last_successful_sync FROM global_sync_status WHERE id = 1`, (err, row: any) => {
        resolve(row || null);
      });
    });
  }

  close(): void {
    this.db?.close();
  }
}