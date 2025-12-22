// src/services/database/database.service.ts

import * as path from 'path';
import * as fs from 'fs';
import Database from 'better-sqlite3';
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

export interface SyncHistoryRow {
  id: number;
  sync_type: string;
  entity_type: string;
  status: string;
  entity_count: number;
  failed_count?: number;
  max_alter_id: string | null;
  message: string | null;
  summary?: string | null;
  started_at: string;
  completed_at?: string | null;
}

export interface LogRow {
  id: number;
  level: string;
  message: string;
  metadata?: string | null;
  created_at: string;
}

export interface EntitySyncStatus {
  entity: string;
  last_max_alter_id: string;
  last_sync_at: string;
}

export interface LastSyncResult {
  last_successful_sync: string;
}

export class DatabaseService {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor() {
    this.dbPath = path.join(app.getPath('userData'), 'tally-sync_v401.db');
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.init();
  }

  private init(): void {
    this.db = new Database(this.dbPath);
    console.log('SQLite Connected →', this.dbPath);
    this.createTables();
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS entity_sync_status (
        entity TEXT PRIMARY KEY,
        last_max_alter_id TEXT DEFAULT '0',
        last_sync_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS global_sync_status (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_successful_sync DATETIME DEFAULT '1970-01-01',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sync_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        status TEXT NOT NULL,
        entity_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0,
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

      INSERT OR IGNORE INTO global_sync_status (id) VALUES (1);

      INSERT OR IGNORE INTO entity_sync_status (entity, last_max_alter_id) VALUES
        ('CUSTOMER', '0'),
        ('INVOICE', '0'),
        ('PAYMENT', '0'),
        ('STOCKITEM', '0'),
        ('JOURNAL', '0'),
        ('ORGANIZATION', '0');
    `;

    this.db?.exec(sql);
    console.log('Database tables initialized successfully');
  }

  // === Profile Management ===
  async saveProfile(email: string, token: string, billerId?: string, apikey?: string, org?: any): Promise<void> {
    const orgJson = org ? JSON.stringify(org) : null;
    const stmt = this.db!.prepare(
      `INSERT OR REPLACE INTO profiles (email, token, biller_id, apikey, organization, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    );
    stmt.run(email.toLowerCase(), token, billerId || null, apikey || null, orgJson);
  }

  async getProfile(): Promise<UserProfile | null> {
    const stmt = this.db!.prepare(`SELECT * FROM profiles LIMIT 1`);
    const row = stmt.get() as any;
    if (row?.organization) {
      try { row.organization = JSON.parse(row.organization); } catch (e) { console.error('JSON parse error in organization', e); }
    }
    return row || null;
  }

  async updateOrganization(email: string, data: any): Promise<void> {
    const json = JSON.stringify({ ...data, updated_at: new Date().toISOString() });
    const stmt = this.db!.prepare(`UPDATE profiles SET organization = ?, updated_at = datetime('now') WHERE email = ?`);
    stmt.run(json, email.toLowerCase());
  }

  async logoutAndClearProfile(): Promise<void> {
    this.db!.exec(`
      BEGIN TRANSACTION;
      DELETE FROM profiles;
      DELETE FROM sync_history;
      DELETE FROM logs;
      UPDATE global_sync_status SET last_successful_sync = '1970-01-01' WHERE id = 1;
      UPDATE entity_sync_status SET last_max_alter_id = '0', last_sync_at = datetime('now');
      COMMIT;
    `);
    this.log('INFO', 'Logged out & all data cleared');
  }

  // === Entity-Specific AlterID Tracking ===
  async getEntityMaxAlterId(entity: string): Promise<string> {
    const stmt = this.db!.prepare(`SELECT last_max_alter_id FROM entity_sync_status WHERE entity = ?`);
    const row = stmt.get(entity.toUpperCase()) as { last_max_alter_id: string } | undefined;
    return row?.last_max_alter_id || '0';
  }

  async updateEntityMaxAlterId(entity: string, alterId: string): Promise<void> {
    const stmt = this.db!.prepare(`
      INSERT INTO entity_sync_status (entity, last_max_alter_id, last_sync_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(entity) DO UPDATE SET
        last_max_alter_id = excluded.last_max_alter_id,
        last_sync_at = excluded.last_sync_at
    `);
    stmt.run(entity.toUpperCase(), alterId);
  }

  async getAllEntitySyncStatus(): Promise<EntitySyncStatus[]> {
    const stmt = this.db!.prepare(`SELECT entity, last_max_alter_id, last_sync_at FROM entity_sync_status ORDER BY last_sync_at DESC`);
    return stmt.all() as EntitySyncStatus[];
  }

  // === Global Sync Timestamp ===
  async updateLastSuccessfulSync(): Promise<void> {
    const stmt = this.db!.prepare(`UPDATE global_sync_status SET last_successful_sync = datetime('now'), updated_at = datetime('now') WHERE id = 1`);
    stmt.run();
  }

  async getLastSync(): Promise<{ last_successful_sync: string } | null> {
    const stmt = this.db!.prepare(`SELECT last_successful_sync FROM global_sync_status WHERE id = 1`);
    const row = stmt.get() as { last_successful_sync: string } | undefined;
    return row ? { last_successful_sync: row.last_successful_sync } : null;
  }

  // === Sync History Logging ===
  async logSyncStart(type: 'MANUAL' | 'BACKGROUND', entity: string): Promise<number> {
    const stmt = this.db!.prepare(`
      INSERT INTO sync_history (sync_type, entity_type, status)
      VALUES (?, ?, 'STARTED')
    `);
    const info = stmt.run(type, entity.toUpperCase());
    return Number(info.lastInsertRowid);
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
    const stmt = this.db!.prepare(`
      UPDATE sync_history
      SET status = ?, entity_count = ?, failed_count = ?, max_alter_id = ?, message = ?, summary = ?, completed_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run(status, successCount, failedCount, maxId || null, msg || null, summary ? JSON.stringify(summary) : null, id);
  }

  // === Logging ===
  log(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', msg: string, meta?: any): void {
    const metadata = meta ? JSON.stringify(meta) : null;
    const stmt = this.db!.prepare(`INSERT INTO logs (level, message, metadata) VALUES (?, ?, ?)`);
    stmt.run(level, msg, metadata);
    console.log(`[${new Date().toISOString()}] [${level}] ${msg}`, meta || '');
  }

  // === Dashboard Data ===
  async getSyncHistory(limit: number = 100): Promise<SyncHistoryRow[]> {
    const stmt = this.db!.prepare(`SELECT * FROM sync_history ORDER BY started_at DESC LIMIT ?`);
    const rows = stmt.all(limit) as SyncHistoryRow[];
    rows.forEach(row => {
      if (row.summary) {
        try { row.summary = JSON.parse(row.summary); } catch { }
      }
    });
    return rows;
  }

  async getLogs(limit: number = 200): Promise<LogRow[]> {
    const stmt = this.db!.prepare(`SELECT * FROM logs ORDER BY created_at DESC LIMIT ?`);
    const rows = stmt.all(limit) as LogRow[];
    rows.forEach(row => {
      if (row.metadata) {
        try { row.metadata = JSON.parse(row.metadata); } catch { }
      }
    });
    return rows;
  }

  close(): void {
    this.db?.close();
  }
}