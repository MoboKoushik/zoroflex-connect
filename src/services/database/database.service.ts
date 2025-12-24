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

export interface ApiLogRow {
  id: number;
  endpoint: string;
  method: string;
  request_payload: string | null;
  response_payload: string | null;
  status_code: number | null;
  status: 'SUCCESS' | 'ERROR';
  error_message: string | null;
  duration_ms: number;
  created_at: string;
}

export interface TallyVoucherLogRow {
  id: number;
  voucher_number: string;
  voucher_type: string;
  date: string;
  party_name: string | null;
  amount: number;
  status: 'SUCCESS' | 'FAILED';
  error_message: string | null;
  sync_history_id: number | null;
  created_at: string;
}

export interface AppSetting {
  key: string;
  value: string;
  updated_at: string;
}

export interface SyncRecordDetail {
  id: number;
  sync_history_id: number;
  record_id: string;
  record_name: string;
  record_type: 'ORGANIZATION' | 'CUSTOMER';
  status: 'SUCCESS' | 'FAILED';
  error_message: string | null;
  synced_at: string;
}

export interface RecentSyncHistoryItem {
  entityType: 'ORGANIZATION' | 'CUSTOMER';
  entityName: string;
  totalRecords: number;
  successCount: number;
  failedCount: number;
  lastSyncTime: string;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  syncHistoryId: number;
}

export class DatabaseService {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor() {
    this.dbPath = path.join(app.getPath('userData'), 'tally-sync_v400.db');
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
        last_sync_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_batch_start_alter_id TEXT,
        last_batch_end_alter_id TEXT,
        last_sync_status TEXT DEFAULT 'IDLE'
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

      CREATE TABLE IF NOT EXISTS api_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        endpoint TEXT NOT NULL,
        method TEXT NOT NULL,
        request_payload TEXT,
        response_payload TEXT,
        status_code INTEGER,
        status TEXT NOT NULL,
        error_message TEXT,
        duration_ms INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tally_voucher_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        voucher_number TEXT NOT NULL,
        voucher_type TEXT NOT NULL,
        date TEXT NOT NULL,
        party_name TEXT,
        amount REAL DEFAULT 0,
        status TEXT NOT NULL,
        error_message TEXT,
        sync_history_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sync_record_details (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_history_id INTEGER NOT NULL,
        record_id TEXT NOT NULL,
        record_name TEXT NOT NULL,
        record_type TEXT NOT NULL,
        status TEXT NOT NULL,
        error_message TEXT,
        synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Customers (Ledgers) table
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id TEXT UNIQUE NOT NULL,
        alter_id TEXT NOT NULL,
        name TEXT NOT NULL,
        contact_person TEXT,
        email TEXT,
        email_cc TEXT,
        phone TEXT,
        mobile TEXT,
        whatsapp_number TEXT,
        company_name TEXT,
        additional_address_lines TEXT,
        gstin TEXT,
        gst_registration_type TEXT,
        gst_state TEXT,
        bank_details TEXT,
        opening_balance REAL DEFAULT 0,
        current_balance REAL DEFAULT 0,
        current_balance_at DATETIME,
        biller_id TEXT,
        synced_to_api INTEGER DEFAULT 0,
        api_sync_attempts INTEGER DEFAULT 0,
        api_sync_error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Vouchers table
      CREATE TABLE IF NOT EXISTS vouchers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        voucher_id TEXT UNIQUE NOT NULL,
        alter_id TEXT NOT NULL,
        voucher_type TEXT NOT NULL,
        voucher_number TEXT NOT NULL,
        date TEXT NOT NULL,
        customer_id TEXT,
        customer_name TEXT,
        party_ledger_name TEXT,
        total_amount REAL DEFAULT 0,
        balance_amount REAL DEFAULT 0,
        narration TEXT,
        voucher_data TEXT,
        synced_to_api INTEGER DEFAULT 0,
        api_sync_attempts INTEGER DEFAULT 0,
        api_sync_error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
      );

      -- Voucher line items table
      CREATE TABLE IF NOT EXISTS voucher_line_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        voucher_id TEXT NOT NULL,
        line_number INTEGER NOT NULL,
        stock_item_name TEXT,
        billed_qty REAL DEFAULT 0,
        rate REAL DEFAULT 0,
        amount REAL DEFAULT 0,
        basic_unit TEXT,
        alt_unit TEXT,
        taxable_percentage REAL,
        discount REAL DEFAULT 0,
        batch_allocations TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (voucher_id) REFERENCES vouchers(voucher_id)
      );

      -- Inventory items table
      CREATE TABLE IF NOT EXISTS inventory_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stock_item_id TEXT UNIQUE NOT NULL,
        alter_id TEXT NOT NULL,
        name TEXT NOT NULL,
        unit TEXT,
        opening_balance REAL DEFAULT 0,
        current_balance REAL DEFAULT 0,
        item_data TEXT,
        synced_to_api INTEGER DEFAULT 0,
        api_sync_attempts INTEGER DEFAULT 0,
        api_sync_error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Organizations table
      CREATE TABLE IF NOT EXISTS organizations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_number TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        address TEXT,
        state TEXT,
        country TEXT,
        gstin TEXT,
        company_data TEXT,
        synced_to_api INTEGER DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- API sync batches table
      CREATE TABLE IF NOT EXISTS api_sync_batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        batch_number INTEGER NOT NULL,
        record_count INTEGER NOT NULL,
        status TEXT NOT NULL,
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        synced_at DATETIME,
        UNIQUE(entity_type, batch_number)
      );

      -- API sync records table
      CREATE TABLE IF NOT EXISTS api_sync_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id INTEGER NOT NULL,
        entity_type TEXT NOT NULL,
        record_id TEXT NOT NULL,
        status TEXT NOT NULL,
        error_message TEXT,
        synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (batch_id) REFERENCES api_sync_batches(id)
      );

      CREATE INDEX IF NOT EXISTS idx_api_logs_created_at ON api_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_api_logs_status ON api_logs(status);
      CREATE INDEX IF NOT EXISTS idx_tally_voucher_logs_date ON tally_voucher_logs(date DESC);
      CREATE INDEX IF NOT EXISTS idx_tally_voucher_logs_type ON tally_voucher_logs(voucher_type);
      CREATE INDEX IF NOT EXISTS idx_tally_voucher_logs_status ON tally_voucher_logs(status);
      CREATE INDEX IF NOT EXISTS idx_tally_voucher_logs_sync_history ON tally_voucher_logs(sync_history_id);
      CREATE INDEX IF NOT EXISTS idx_sync_record_details_sync_history ON sync_record_details(sync_history_id);
      CREATE INDEX IF NOT EXISTS idx_sync_record_details_record_type ON sync_record_details(record_type);
      CREATE INDEX IF NOT EXISTS idx_sync_record_details_status ON sync_record_details(status);

      -- Indexes for customers table
      CREATE INDEX IF NOT EXISTS idx_customers_alter_id ON customers(alter_id);
      CREATE INDEX IF NOT EXISTS idx_customers_synced_to_api ON customers(synced_to_api);
      CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

      -- Indexes for vouchers table
      CREATE INDEX IF NOT EXISTS idx_vouchers_alter_id ON vouchers(alter_id);
      CREATE INDEX IF NOT EXISTS idx_vouchers_type ON vouchers(voucher_type);
      CREATE INDEX IF NOT EXISTS idx_vouchers_date ON vouchers(date DESC);
      CREATE INDEX IF NOT EXISTS idx_vouchers_customer_id ON vouchers(customer_id);
      CREATE INDEX IF NOT EXISTS idx_vouchers_synced_to_api ON vouchers(synced_to_api);

      -- Indexes for voucher_line_items table
      CREATE INDEX IF NOT EXISTS idx_line_items_voucher_id ON voucher_line_items(voucher_id);

      -- Indexes for inventory_items table
      CREATE INDEX IF NOT EXISTS idx_inventory_alter_id ON inventory_items(alter_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_synced_to_api ON inventory_items(synced_to_api);

      -- Indexes for api_sync_batches table
      CREATE INDEX IF NOT EXISTS idx_api_sync_batches_status ON api_sync_batches(status);
      CREATE INDEX IF NOT EXISTS idx_api_sync_batches_entity ON api_sync_batches(entity_type);

      -- Indexes for api_sync_records table
      CREATE INDEX IF NOT EXISTS idx_api_sync_records_batch_id ON api_sync_records(batch_id);
      CREATE INDEX IF NOT EXISTS idx_api_sync_records_record_id ON api_sync_records(record_id);

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

  async getEntitySyncStatus(entity: string): Promise<{
    entity: string;
    last_max_alter_id: string;
    last_sync_at: string;
    last_batch_start_alter_id?: string;
    last_batch_end_alter_id?: string;
    last_sync_status?: string;
  } | null> {
    const stmt = this.db!.prepare(`
      SELECT entity, last_max_alter_id, last_sync_at, 
             last_batch_start_alter_id, last_batch_end_alter_id, last_sync_status
      FROM entity_sync_status WHERE entity = ?
    `);
    const row = stmt.get(entity.toUpperCase()) as any;
    return row || null;
  }

  async updateEntityMaxAlterId(entity: string, alterId: string, tx?: any): Promise<void> {
    const executor = tx || this.db!;
    const stmt = executor.prepare(`
      INSERT INTO entity_sync_status (entity, last_max_alter_id, last_sync_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(entity) DO UPDATE SET
        last_max_alter_id = excluded.last_max_alter_id,
        last_sync_at = excluded.last_sync_at
    `);
    stmt.run(entity.toUpperCase(), alterId);
  }

  async updateEntitySyncStatus(
    entity: string,
    updates: {
      last_max_alter_id?: string;
      last_batch_start_alter_id?: string;
      last_batch_end_alter_id?: string;
      last_sync_status?: string;
    }
  ): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.last_max_alter_id !== undefined) {
      fields.push('last_max_alter_id = ?');
      values.push(updates.last_max_alter_id);
    }
    if (updates.last_batch_start_alter_id !== undefined) {
      fields.push('last_batch_start_alter_id = ?');
      values.push(updates.last_batch_start_alter_id);
    }
    if (updates.last_batch_end_alter_id !== undefined) {
      fields.push('last_batch_end_alter_id = ?');
      values.push(updates.last_batch_end_alter_id);
    }
    if (updates.last_sync_status !== undefined) {
      fields.push('last_sync_status = ?');
      values.push(updates.last_sync_status);
    }

    fields.push('last_sync_at = datetime(\'now\')');
    values.push(entity.toUpperCase());

    const stmt = this.db!.prepare(`
      UPDATE entity_sync_status
      SET ${fields.join(', ')}
      WHERE entity = ?
    `);
    stmt.run(...values);
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

  // === API Logs ===
  async logApiRequest(
    endpoint: string,
    method: string,
    requestPayload: any,
    responsePayload: any,
    statusCode: number | null,
    status: 'SUCCESS' | 'ERROR',
    errorMessage: string | null,
    durationMs: number
  ): Promise<void> {
    const requestJson = requestPayload ? JSON.stringify(requestPayload) : null;
    const responseJson = responsePayload ? JSON.stringify(responsePayload) : null;
    const stmt = this.db!.prepare(`
      INSERT INTO api_logs (endpoint, method, request_payload, response_payload, status_code, status, error_message, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(endpoint, method.toUpperCase(), requestJson, responseJson, statusCode, status, errorMessage, durationMs);
  }

  async getApiLogs(filters?: {
    status?: 'SUCCESS' | 'ERROR';
    endpoint?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
  }): Promise<ApiLogRow[]> {
    let query = `SELECT * FROM api_logs WHERE 1=1`;
    const params: any[] = [];

    if (filters?.status) {
      query += ` AND status = ?`;
      params.push(filters.status);
    }
    if (filters?.endpoint) {
      query += ` AND endpoint LIKE ?`;
      params.push(`%${filters.endpoint}%`);
    }
    if (filters?.fromDate) {
      query += ` AND created_at >= ?`;
      params.push(filters.fromDate);
    }
    if (filters?.toDate) {
      query += ` AND created_at <= ?`;
      params.push(filters.toDate);
    }

    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(filters?.limit || 200);

    const stmt = this.db!.prepare(query);
    const rows = stmt.all(...params) as ApiLogRow[];
    rows.forEach(row => {
      if (row.request_payload) {
        try { row.request_payload = JSON.parse(row.request_payload); } catch { }
      }
      if (row.response_payload) {
        try { row.response_payload = JSON.parse(row.response_payload); } catch { }
      }
    });
    return rows;
  }

  // === Tally Voucher Logs ===
  async logTallyVoucher(
    voucherNumber: string,
    voucherType: string,
    date: string,
    partyName: string | null,
    amount: number,
    status: 'SUCCESS' | 'FAILED',
    errorMessage: string | null,
    syncHistoryId: number | null
  ): Promise<void> {
    const stmt = this.db!.prepare(`
      INSERT INTO tally_voucher_logs (voucher_number, voucher_type, date, party_name, amount, status, error_message, sync_history_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(voucherNumber, voucherType, date, partyName, amount, status, errorMessage, syncHistoryId);
  }

  async getTallyVoucherLogs(filters?: {
    voucherType?: string;
    status?: 'SUCCESS' | 'FAILED';
    fromDate?: string;
    toDate?: string;
    search?: string;
    limit?: number;
  }): Promise<TallyVoucherLogRow[]> {
    let query = `SELECT * FROM tally_voucher_logs WHERE 1=1`;
    const params: any[] = [];

    if (filters?.voucherType) {
      // Case-insensitive match and handle variations
      // Map common variations to actual stored values
      const typeMap: Record<string, string[]> = {
        'sales': ['sales'],
        'credit_note': ['credit_note', 'credit note'],
        'receipt': ['receipt', 'RECEIPT'],
        'jv_entry': ['jv_entry', 'JVENTRY', 'JV', 'jventry'],
        'JVENTRY': ['jv_entry', 'JVENTRY', 'JV', 'jventry'],
        'JV': ['jv_entry', 'JVENTRY', 'JV', 'jventry'],
        'RECEIPT': ['receipt', 'RECEIPT']
      };

      const searchTypes = typeMap[filters.voucherType] || [filters.voucherType];
      const placeholders = searchTypes.map(() => '?').join(',');
      // Only check voucher_type column (entry_type doesn't exist in tally_voucher_logs table)
      query += ` AND LOWER(voucher_type) IN (${placeholders})`;
      params.push(...searchTypes.map(t => t.toLowerCase()));
    }
    if (filters?.status) {
      query += ` AND status = ?`;
      params.push(filters.status);
    }
    if (filters?.fromDate) {
      query += ` AND date >= ?`;
      params.push(filters.fromDate);
    }
    if (filters?.toDate) {
      query += ` AND date <= ?`;
      params.push(filters.toDate);
    }
    if (filters?.search) {
      query += ` AND (voucher_number LIKE ? OR party_name LIKE ?)`;
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    query += ` ORDER BY date DESC, created_at DESC LIMIT ?`;
    params.push(filters?.limit || 200);

    const stmt = this.db!.prepare(query);
    return stmt.all(...params) as TallyVoucherLogRow[];
  }

  // === App Settings ===
  async getSetting(key: string): Promise<string | null> {
    const stmt = this.db!.prepare(`SELECT value FROM app_settings WHERE key = ?`);
    const row = stmt.get(key) as { value: string } | undefined;
    return row?.value || null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    const stmt = this.db!.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = datetime('now')
    `);
    stmt.run(key, value);
  }

  async getAllSettings(): Promise<Record<string, string>> {
    const stmt = this.db!.prepare(`SELECT key, value FROM app_settings`);
    const rows = stmt.all() as { key: string; value: string }[];
    const settings: Record<string, string> = {};
    rows.forEach(row => {
      settings[row.key] = row.value;
    });
    return settings;
  }

  // === Log Management ===
  async clearLogs(logType: 'system' | 'api' | 'voucher'): Promise<void> {
    if (logType === 'system') {
      this.db!.exec('DELETE FROM logs');
    } else if (logType === 'api') {
      this.db!.exec('DELETE FROM api_logs');
    } else if (logType === 'voucher') {
      this.db!.exec('DELETE FROM tally_voucher_logs');
    }
  }

  // === Sync Record Details ===
  async logSyncRecordDetail(
    syncHistoryId: number,
    recordId: string,
    recordName: string,
    recordType: 'ORGANIZATION' | 'CUSTOMER',
    status: 'SUCCESS' | 'FAILED',
    errorMessage: string | null = null
  ): Promise<void> {
    const stmt = this.db!.prepare(`
      INSERT INTO sync_record_details (sync_history_id, record_id, record_name, record_type, status, error_message)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(syncHistoryId, recordId, recordName, recordType, status, errorMessage);
  }

  async getSyncRecordDetails(
    syncHistoryId: number,
    filters?: {
      status?: 'SUCCESS' | 'FAILED';
      search?: string;
    }
  ): Promise<SyncRecordDetail[]> {
    let query = `SELECT * FROM sync_record_details WHERE sync_history_id = ?`;
    const params: any[] = [syncHistoryId];

    if (filters?.status) {
      query += ` AND status = ?`;
      params.push(filters.status);
    }
    if (filters?.search) {
      query += ` AND (record_id LIKE ? OR record_name LIKE ?)`;
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    query += ` ORDER BY synced_at DESC`;

    const stmt = this.db!.prepare(query);
    return stmt.all(...params) as SyncRecordDetail[];
  }

  // === Recent Sync History (Grouped) ===
  async getRecentSyncHistoryGrouped(): Promise<RecentSyncHistoryItem[]> {
    // Get all syncs and filter for ORGANIZATION and CUSTOMER (case-insensitive)
    const stmt = this.db!.prepare(`
      SELECT * FROM sync_history
      ORDER BY started_at DESC
    `);
    const allSyncs = stmt.all() as SyncHistoryRow[];

    console.log('All syncs from database:', allSyncs.length);
    console.log('All sync entity types:', allSyncs.map(s => ({ type: s.entity_type, id: s.id, status: s.status })));

    // Filter for ORGANIZATION and CUSTOMER (case-insensitive, trim whitespace)
    const filteredSyncs = allSyncs.filter(s => {
      const type = (s.entity_type || '').trim().toUpperCase();
      return type === 'ORGANIZATION' || type === 'CUSTOMER';
    });

    console.log('Filtered syncs for recent history:', filteredSyncs.length, filteredSyncs.map(s => ({ type: s.entity_type, status: s.status, count: s.entity_count, id: s.id })));

    // Group by entity_type and get latest for each (case-insensitive)
    const latestByType: Map<string, SyncHistoryRow> = new Map();
    for (const sync of filteredSyncs) {
      const key = (sync.entity_type || '').trim().toUpperCase();
      // Only get the latest (first one we encounter since we're ordering DESC)
      if (!latestByType.has(key)) {
        latestByType.set(key, sync);
      }
    }

    console.log('Latest by type keys:', Array.from(latestByType.keys()));

    const result: RecentSyncHistoryItem[] = [];

    // Process Organization
    const orgSync = latestByType.get('ORGANIZATION');
    if (orgSync) {
      const profile = await this.getProfile();
      const orgName = profile?.organization?.name || 'Organization';
      const orgEntityCount = orgSync.entity_count != null ? parseInt(String(orgSync.entity_count), 10) : 0;
      const orgFailedCount = orgSync.failed_count != null ? parseInt(String(orgSync.failed_count), 10) : 0;

      result.push({
        entityType: 'ORGANIZATION',
        entityName: orgName,
        totalRecords: orgEntityCount + orgFailedCount,
        successCount: orgEntityCount,
        failedCount: orgFailedCount,
        lastSyncTime: orgSync.completed_at || orgSync.started_at,
        status: orgSync.status as 'SUCCESS' | 'PARTIAL' | 'FAILED',
        syncHistoryId: orgSync.id
      });
      console.log('Added Organization sync:', orgSync.id, 'entity_count:', orgEntityCount, 'totalRecords:', orgEntityCount + orgFailedCount);
    }

    // Process Customer
    const customerSync = latestByType.get('CUSTOMER');
    if (customerSync) {
      // Ensure we're getting numeric values
      const entityCount = parseInt(String(customerSync.entity_count || 0), 10);
      const failedCount = parseInt(String(customerSync.failed_count || 0), 10);
      const totalRecords = entityCount + failedCount;
      const successCount = entityCount;

      console.log('Customer sync data:', {
        id: customerSync.id,
        entity_count: customerSync.entity_count,
        entity_count_parsed: entityCount,
        failed_count: customerSync.failed_count,
        failed_count_parsed: failedCount,
        totalRecords,
        successCount,
        failedCount,
        status: customerSync.status
      });

      const customerItem = {
        entityType: 'CUSTOMER' as const,
        entityName: 'Customers',
        totalRecords: totalRecords,
        successCount: successCount,
        failedCount: failedCount,
        lastSyncTime: customerSync.completed_at || customerSync.started_at,
        status: customerSync.status as 'SUCCESS' | 'PARTIAL' | 'FAILED',
        syncHistoryId: customerSync.id
      };

      console.log('Customer item to be added:', JSON.stringify(customerItem, null, 2));
      result.push(customerItem);
      console.log('Added Customer sync to result:', customerSync.id, 'totalRecords:', totalRecords, 'successCount:', successCount);
    } else {
      console.log('No CUSTOMER sync found in database. Available types:', Array.from(latestByType.keys()));
    }

    return result;
  }

  // === Voucher Sync Summary ===
  async getVoucherSyncSummary(): Promise<Record<string, { totalAttempted: number; successCount: number; failedCount: number }>> {
    // Get all syncs and find VOUCHER (case-insensitive)
    const stmt = this.db!.prepare(`
      SELECT * FROM sync_history
      ORDER BY started_at DESC
    `);
    const allSyncs = stmt.all() as SyncHistoryRow[];

    // Find latest VOUCHER sync (case-insensitive)
    const latestVoucherSync = allSyncs.find(s => s.entity_type.toUpperCase() === 'VOUCHER');

    console.log('Latest voucher sync:', latestVoucherSync ? { id: latestVoucherSync.id, status: latestVoucherSync.status, count: latestVoucherSync.entity_count } : 'none');

    const result: Record<string, { totalAttempted: number; successCount: number; failedCount: number }> = {};

    // First, try to get from tally_voucher_logs table (most accurate)
    if (latestVoucherSync) {
      const voucherStmt = this.db!.prepare(`
        SELECT voucher_type, 
               COUNT(*) as total,
               SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as success,
               SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed
        FROM tally_voucher_logs
        WHERE sync_history_id = ?
        GROUP BY voucher_type
      `);
      const voucherStats = voucherStmt.all(latestVoucherSync.id) as any[];

      console.log('Voucher stats from tally_voucher_logs:', voucherStats.length, voucherStats);

      if (voucherStats.length > 0) {
        for (const stat of voucherStats) {
          const typeName = stat.voucher_type || 'Unknown';
          // Normalize voucher type names - keep original case but capitalize first letter
          const normalizedType = typeName.charAt(0).toUpperCase() + typeName.slice(1);
          result[normalizedType] = {
            totalAttempted: stat.total || 0,
            successCount: stat.success || 0,
            failedCount: stat.failed || 0
          };
        }
        console.log('Returning voucher summary from tally_voucher_logs:', result);
        return result;
      }

      // If no voucher logs, try to get all voucher logs (might be from different sync_history_id)
      const allVoucherStmt = this.db!.prepare(`
        SELECT voucher_type, 
               COUNT(*) as total,
               SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as success,
               SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed
        FROM tally_voucher_logs
        GROUP BY voucher_type
      `);
      const allVoucherStats = allVoucherStmt.all() as any[];

      if (allVoucherStats.length > 0) {
        console.log('Using all voucher logs:', allVoucherStats.length);
        for (const stat of allVoucherStats) {
          const typeName = stat.voucher_type || 'Unknown';
          const normalizedType = typeName.charAt(0).toUpperCase() + typeName.slice(1);
          result[normalizedType] = {
            totalAttempted: stat.total || 0,
            successCount: stat.success || 0,
            failedCount: stat.failed || 0
          };
        }
        return result;
      }
    }

    // Fallback to summary JSON if tally_voucher_logs is empty
    if (latestVoucherSync && latestVoucherSync.summary) {
      let summary: any = {};
      try {
        summary = typeof latestVoucherSync.summary === 'string'
          ? JSON.parse(latestVoucherSync.summary)
          : latestVoucherSync.summary;
      } catch (e) {
        console.error('Failed to parse voucher summary:', e);
        // Fallback: use entity_count if available
        const failedCount = latestVoucherSync.failed_count || 0;
        if (latestVoucherSync.entity_count > 0 || failedCount > 0) {
          result['All Vouchers'] = {
            totalAttempted: (latestVoucherSync.entity_count || 0) + failedCount,
            successCount: latestVoucherSync.entity_count || 0,
            failedCount: failedCount
          };
        }
        return result;
      }

      // Check if summary has voucher type breakdowns
      if (summary.invoice) {
        result['Sales'] = {
          totalAttempted: (summary.invoice.success || 0) + (summary.invoice.failed || 0),
          successCount: summary.invoice.success || 0,
          failedCount: summary.invoice.failed || 0
        };
      }
      if (summary.receipt) {
        result['Receipt'] = {
          totalAttempted: (summary.receipt.success || 0) + (summary.receipt.failed || 0),
          successCount: summary.receipt.success || 0,
          failedCount: summary.receipt.failed || 0
        };
      }
      if (summary.jv || summary.jv_entry) {
        result['Journal'] = {
          totalAttempted: ((summary.jv?.success || summary.jv_entry?.success || 0) + (summary.jv?.failed || summary.jv_entry?.failed || 0)),
          successCount: summary.jv?.success || summary.jv_entry?.success || 0,
          failedCount: summary.jv?.failed || summary.jv_entry?.failed || 0
        };
      }

      // If no breakdown in summary but we have counts, show aggregate
      const failedCountInSummary = latestVoucherSync.failed_count || 0;
      if (Object.keys(result).length === 0 && (latestVoucherSync.entity_count > 0 || failedCountInSummary > 0)) {
        result['All Vouchers'] = {
          totalAttempted: (latestVoucherSync.entity_count || 0) + failedCountInSummary,
          successCount: latestVoucherSync.entity_count || 0,
          failedCount: failedCountInSummary
        };
      }
    } else if (latestVoucherSync) {
      const failedCountFallback = latestVoucherSync.failed_count || 0;
      // No summary JSON, but we have counts - show aggregate
      if (latestVoucherSync.entity_count > 0 || failedCountFallback > 0) {
        result['All Vouchers'] = {
          totalAttempted: (latestVoucherSync.entity_count || 0) + failedCountFallback,
          successCount: latestVoucherSync.entity_count || 0,
          failedCount: failedCountFallback
        };
      }
    }

    console.log('Final voucher summary result:', result);
    return result;
  }

  // === Customer Operations ===
  upsertCustomer(customer: {
    customer_id: string;
    alter_id: string;
    name: string;
    contact_person?: string;
    email?: string;
    email_cc?: string;
    phone?: string;
    mobile?: string;
    whatsapp_number?: string;
    company_name?: string;
    additional_address_lines?: string[];
    gstin?: string;
    gst_registration_type?: string;
    gst_state?: string;
    bank_details?: any[];
    opening_balance?: number;
    current_balance?: number;
    current_balance_at?: string;
    biller_id?: string;
  }, tx?: any): void {
    const executor = tx || this.db!;
    const stmt = executor.prepare(`
      INSERT INTO customers (
        customer_id, alter_id, name, contact_person, email, email_cc,
        phone, mobile, whatsapp_number, company_name, additional_address_lines,
        gstin, gst_registration_type, gst_state, bank_details,
        opening_balance, current_balance, current_balance_at, biller_id,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(customer_id) DO UPDATE SET
        alter_id = excluded.alter_id,
        name = excluded.name,
        contact_person = excluded.contact_person,
        email = excluded.email,
        email_cc = excluded.email_cc,
        phone = excluded.phone,
        mobile = excluded.mobile,
        whatsapp_number = excluded.whatsapp_number,
        company_name = excluded.company_name,
        additional_address_lines = excluded.additional_address_lines,
        gstin = excluded.gstin,
        gst_registration_type = excluded.gst_registration_type,
        gst_state = excluded.gst_state,
        bank_details = excluded.bank_details,
        opening_balance = excluded.opening_balance,
        current_balance = excluded.current_balance,
        current_balance_at = excluded.current_balance_at,
        biller_id = excluded.biller_id,
        updated_at = datetime('now')
    `);

    stmt.run(
      customer.customer_id,
      customer.alter_id,
      customer.name,
      customer.contact_person || null,
      customer.email || null,
      customer.email_cc || null,
      customer.phone || null,
      customer.mobile || null,
      customer.whatsapp_number || null,
      customer.company_name || null,
      customer.additional_address_lines ? JSON.stringify(customer.additional_address_lines) : null,
      customer.gstin || null,
      customer.gst_registration_type || null,
      customer.gst_state || null,
      customer.bank_details ? JSON.stringify(customer.bank_details) : null,
      customer.opening_balance || 0,
      customer.current_balance || 0,
      customer.current_balance_at || null,
      customer.biller_id || null
    );
  }

  // === Voucher Operations ===
  upsertVoucher(voucher: {
    voucher_id: string;
    alter_id: string;
    voucher_type: string;
    voucher_number: string;
    date: string;
    customer_id?: string;
    customer_name?: string;
    party_ledger_name?: string;
    total_amount?: number;
    balance_amount?: number;
    narration?: string;
    voucher_data?: any;
  }, tx?: any): void {
    const executor = tx || this.db!;
    const stmt = executor.prepare(`
      INSERT INTO vouchers (
        voucher_id, alter_id, voucher_type, voucher_number, date,
        customer_id, customer_name, party_ledger_name,
        total_amount, balance_amount, narration, voucher_data,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(voucher_id) DO UPDATE SET
        alter_id = excluded.alter_id,
        voucher_type = excluded.voucher_type,
        voucher_number = excluded.voucher_number,
        date = excluded.date,
        customer_id = excluded.customer_id,
        customer_name = excluded.customer_name,
        party_ledger_name = excluded.party_ledger_name,
        total_amount = excluded.total_amount,
        balance_amount = excluded.balance_amount,
        narration = excluded.narration,
        voucher_data = excluded.voucher_data,
        updated_at = datetime('now')
    `);

    stmt.run(
      voucher.voucher_id,
      voucher.alter_id,
      voucher.voucher_type,
      voucher.voucher_number,
      voucher.date,
      voucher.customer_id || null,
      voucher.customer_name || null,
      voucher.party_ledger_name || null,
      voucher.total_amount || 0,
      voucher.balance_amount || 0,
      voucher.narration || null,
      voucher.voucher_data ? JSON.stringify(voucher.voucher_data) : null
    );
  }

  upsertVoucherLineItems(voucherId: string, lineItems: Array<{
    line_number: number;
    stock_item_name?: string;
    billed_qty?: number;
    rate?: number;
    amount?: number;
    basic_unit?: string;
    alt_unit?: string;
    taxable_percentage?: number;
    discount?: number;
    batch_allocations?: any;
  }>, tx?: any): void {
    const executor = tx || this.db!;

    // Delete existing line items for this voucher
    const deleteStmt = executor.prepare(`DELETE FROM voucher_line_items WHERE voucher_id = ?`);
    deleteStmt.run(voucherId);

    // Insert new line items
    const insertStmt = executor.prepare(`
      INSERT INTO voucher_line_items (
        voucher_id, line_number, stock_item_name, billed_qty, rate, amount,
        basic_unit, alt_unit, taxable_percentage, discount, batch_allocations
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of lineItems) {
      insertStmt.run(
        voucherId,
        item.line_number,
        item.stock_item_name || null,
        item.billed_qty || 0,
        item.rate || 0,
        item.amount || 0,
        item.basic_unit || null,
        item.alt_unit || null,
        item.taxable_percentage || null,
        item.discount || 0,
        item.batch_allocations ? JSON.stringify(item.batch_allocations) : null
      );
    }
  }

  // === API Sync Batch Operations ===
  createApiSyncBatch(entityType: string, batchNumber: number, recordCount: number): number {
    const stmt = this.db!.prepare(`
      INSERT INTO api_sync_batches (entity_type, batch_number, record_count, status)
      VALUES (?, ?, ?, 'PENDING')
      ON CONFLICT(entity_type, batch_number) DO UPDATE SET
        record_count = excluded.record_count,
        status = 'PENDING',
        retry_count = 0,
        error_message = NULL
    `);
    const result = stmt.run(entityType.toUpperCase(), batchNumber, recordCount);
    return Number(result.lastInsertRowid);
  }

  updateApiSyncBatchStatus(
    batchId: number,
    status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'RETRYING',
    errorMessage?: string,
    retryCount?: number
  ): void {
    const stmt = this.db!.prepare(`
      UPDATE api_sync_batches
      SET status = ?,
          error_message = ?,
          retry_count = COALESCE(?, retry_count),
          synced_at = CASE WHEN ? = 'SUCCESS' THEN datetime('now') ELSE synced_at END
      WHERE id = ?
    `);
    stmt.run(status, errorMessage || null, retryCount || null, status, batchId);
  }

  getUnsyncedRecords(entityType: string, limit: number = 100): Array<{ id: number;[key: string]: any }> {
    let tableName: string;
    let idColumn: string;
    let syncedColumn = 'synced_to_api';

    switch (entityType.toUpperCase()) {
      case 'CUSTOMER':
        tableName = 'customers';
        idColumn = 'customer_id';
        break;
      case 'INVOICE':
      case 'RECEIPT':
      case 'JOURNAL':
        tableName = 'vouchers';
        idColumn = 'voucher_id';
        break;
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }

    const stmt = this.db!.prepare(`
      SELECT * FROM ${tableName}
      WHERE ${syncedColumn} = 0
      ORDER BY alter_id ASC
      LIMIT ?
    `);
    return stmt.all(limit) as Array<{ id: number;[key: string]: any }>;
  }

  markRecordsAsSynced(entityType: string, recordIds: string[]): void {
    let tableName: string;
    let idColumn: string;

    switch (entityType.toUpperCase()) {
      case 'CUSTOMER':
        tableName = 'customers';
        idColumn = 'customer_id';
        break;
      case 'INVOICE':
      case 'RECEIPT':
      case 'JOURNAL':
        tableName = 'vouchers';
        idColumn = 'voucher_id';
        break;
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }

    const placeholders = recordIds.map(() => '?').join(',');
    const stmt = this.db!.prepare(`
      UPDATE ${tableName}
      SET synced_to_api = 1,
          api_sync_attempts = 0,
          api_sync_error = NULL
      WHERE ${idColumn} IN (${placeholders})
    `);
    stmt.run(...recordIds);
  }

  // === Transaction Support ===
  execInTransaction(callback: (db: Database.Database) => void): void {
    try {
      this.db!.exec('BEGIN TRANSACTION');
      callback(this.db!);
      this.db!.exec('COMMIT');
    } catch (error) {
      this.db!.exec('ROLLBACK');
      throw error;
    }
  }

  // === Customer Data Retrieval ===
  async getCustomers(filters?: {
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    let query = 'SELECT * FROM customers WHERE 1=1';
    const params: any[] = [];

    if (filters?.search) {
      query += ' AND (name LIKE ? OR customer_id LIKE ? OR email LIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    query += ' ORDER BY created_at DESC';

    if (filters?.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
      if (filters.offset) {
        query += ' OFFSET ?';
        params.push(filters.offset);
      }
    }

    const stmt = this.db!.prepare(query);
    const rows = stmt.all(...params) as any[];

    // Parse JSON fields
    return rows.map(row => ({
      ...row,
      additional_address_lines: row.additional_address_lines
        ? JSON.parse(row.additional_address_lines)
        : [],
      bank_details: row.bank_details
        ? JSON.parse(row.bank_details)
        : []
    }));
  }

  async getCustomersCount(search?: string): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM customers WHERE 1=1';
    const params: any[] = [];

    if (search) {
      query += ' AND (name LIKE ? OR customer_id LIKE ? OR email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const stmt = this.db!.prepare(query);
    const result = stmt.get(...params) as { count: number };
    return result.count;
  }

  // === Voucher Data Retrieval ===
  async getVouchers(filters?: {
    voucher_type?: string;
    search?: string;
    date_from?: string;
    date_to?: string;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    let query = 'SELECT * FROM vouchers WHERE 1=1';
    const params: any[] = [];

    if (filters?.voucher_type) {
      query += ' AND voucher_type = ?';
      params.push(filters.voucher_type);
    }

    if (filters?.search) {
      query += ' AND (voucher_number LIKE ? OR customer_name LIKE ? OR party_ledger_name LIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    if (filters?.date_from) {
      query += ' AND date >= ?';
      params.push(filters.date_from);
    }

    if (filters?.date_to) {
      query += ' AND date <= ?';
      params.push(filters.date_to);
    }

    query += ' ORDER BY date DESC, created_at DESC';

    if (filters?.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
      if (filters.offset) {
        query += ' OFFSET ?';
        params.push(filters.offset);
      }
    }

    const stmt = this.db!.prepare(query);
    const rows = stmt.all(...params) as any[];

    // Parse JSON fields
    return rows.map(row => ({
      ...row,
      voucher_data: row.voucher_data
        ? JSON.parse(row.voucher_data)
        : null
    }));
  }

  async getVouchersCount(filters?: {
    voucher_type?: string;
    search?: string;
    date_from?: string;
    date_to?: string;
  }): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM vouchers WHERE 1=1';
    const params: any[] = [];

    if (filters?.voucher_type) {
      query += ' AND voucher_type = ?';
      params.push(filters.voucher_type);
    }

    if (filters?.search) {
      query += ' AND (voucher_number LIKE ? OR customer_name LIKE ? OR party_ledger_name LIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    if (filters?.date_from) {
      query += ' AND date >= ?';
      params.push(filters.date_from);
    }

    if (filters?.date_to) {
      query += ' AND date <= ?';
      params.push(filters.date_to);
    }

    const stmt = this.db!.prepare(query);
    const result = stmt.get(...params) as { count: number };
    return result.count;
  }

  async getVoucherLineItems(voucherId: string): Promise<any[]> {
    const stmt = this.db!.prepare(`
      SELECT * FROM voucher_line_items 
      WHERE voucher_id = ? 
      ORDER BY line_number ASC
    `);
    const rows = stmt.all(voucherId) as any[];

    // Parse JSON fields
    return rows.map(row => ({
      ...row,
      batch_allocations: row.batch_allocations
        ? JSON.parse(row.batch_allocations)
        : []
    }));
  }

  close(): void {
    this.db?.close();
  }
}