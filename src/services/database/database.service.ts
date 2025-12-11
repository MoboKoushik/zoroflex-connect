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
  max_alter_id?: string;
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

export class DatabaseService {
  private db: sqlite3.Database | null = null;
  private dbPath: string;

  constructor() {
    this.dbPath = path.join(app.getPath('userData'), 'tally-sync_v2.db');
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
      CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        token TEXT NOT NULL,
        biller_id TEXT,
        apikey TEXT,
        organization TEXT,
        max_alter_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS last_sync (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_successful_sync DATETIME DEFAULT '1970-01-01',
        last_max_alter_id TEXT DEFAULT '0',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sync_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        status TEXT NOT NULL,
        entity_count INTEGER DEFAULT 0,
        max_alter_id TEXT,
        message TEXT,
        summary TEXT,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;

    this.db!.exec(sql, (err) => {
      if (err) console.error('Table creation failed:', err);
      else this.db!.run(`INSERT OR IGNORE INTO last_sync (id) VALUES (1)`);
    });
  }

  async saveProfile(email: string, token: string, billerId?: string, apikey?: string, org?: any): Promise<void> {
    const orgJson = org ? JSON.stringify(org) : null;
    return new Promise((resolve, reject) => {
      this.db!.run(
        `INSERT OR REPLACE INTO profiles (email, token, biller_id, apikey, organization, max_alter_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        [email.toLowerCase(), token, billerId || null, apikey || null, orgJson, null],
        (err) => (err ? reject(err) : resolve())
      );
    });
  }

  async getProfile(): Promise<UserProfile | null> {
    return new Promise((resolve) => {
      this.db!.get(`SELECT * FROM profiles LIMIT 1`, (err, row: any) => {
        if (row?.organization) {
          try { row.organization = JSON.parse(row.organization); } catch {}
        }
        resolve(row || null);
      });
    });
  }

  async logoutAndClearProfile(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db!.serialize(() => {
        this.db!.run('BEGIN TRANSACTION');
        this.db!.run('DELETE FROM profiles');
        this.db!.run('DELETE FROM sync_history');
        this.db!.run('DELETE FROM logs');
        this.db!.run(`UPDATE last_sync SET last_max_alter_id = '0', last_successful_sync = '1970-01-01'`);
        this.db!.run('COMMIT', (err) => {
          if (err) {
            this.db!.run('ROLLBACK');
            reject(err);
          } else {
            this.log('INFO', 'Logged out & data cleared');
            resolve();
          }
        });
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

async logSyncStart(type: 'MANUAL' | 'BACKGROUND', entity: string): Promise<number> {
  return new Promise((resolve, reject) => {
    this.db!.run(
      `INSERT INTO sync_history (sync_type, entity_type, status) VALUES (?, ?, 'STARTED') RETURNING id`,
      [type, entity],
      function (err: any, row: any) {
        if (err) return reject(err);
        resolve(row?.id);
      }
    );
  });
}

  async logSyncEnd(id: number, status: 'SUCCESS' | 'FAILED', count: number, maxId?: string, msg?: string, summary?: any): Promise<void> {
    return new Promise((resolve) => {
      this.db!.run(
        `UPDATE sync_history SET status=?, entity_count=?, max_alter_id=?, message=?, summary=?, completed_at=datetime('now') WHERE id=?`,
        [status, count, maxId || null, msg || null, summary ? JSON.stringify(summary) : null, id],
        () => resolve()
      );
    });
  }

  async updateGlobalMaxAlterId(id: string): Promise<void> {
    return new Promise((resolve) => {
      this.db!.run(`UPDATE last_sync SET last_max_alter_id=? WHERE id=1`, [id], () => {
        this.db!.run(`UPDATE profiles SET max_alter_id=?`, [id]);
        resolve();
      });
    });
  }

  async getGlobalMaxAlterId(): Promise<string> {
    return new Promise((resolve) => {
      this.db!.get(`SELECT last_max_alter_id FROM last_sync WHERE id=1`, (err, row: any) => {
        resolve(row?.last_max_alter_id || '0');
      });
    });
  }

  async updateLastSuccessfulSync(): Promise<void> {
    return new Promise((resolve) => {
      this.db!.run(`UPDATE last_sync SET last_successful_sync=datetime('now') WHERE id=1`, () => resolve());
    });
  }

  async getLastSuccessfulSync(): Promise<string> {
    return new Promise((resolve) => {
      this.db!.get(`SELECT last_successful_sync FROM last_sync WHERE id=1`, (err, row: any) => {
        resolve(row?.last_successful_sync || '1970-01-01');
      });
    });
  }

  log(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', msg: string, meta?: any): void {
    const m = meta ? JSON.stringify(meta) : null;
    this.db!.run(`INSERT INTO logs (level, message, metadata) VALUES (?, ?, ?)`, [level, msg, m]);
    console.log(`[${new Date().toISOString()}] [${level}] ${msg}`, meta || '');
  }

  close(): void {
    this.db?.close();
  }
}