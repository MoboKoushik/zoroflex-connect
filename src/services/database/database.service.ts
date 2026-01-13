// src/services/database/database.service.ts

import * as path from 'path';
import * as fs from 'fs';
import Database from 'better-sqlite3';
import { app } from 'electron';
import axios from 'axios';
import FormData from 'form-data';
import { getApiUrl } from '../config/api-url-helper';

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
  company_id: number | null;
  endpoint: string;
  method: string;
  request_headers: string | null;
  request_payload: string | null;
  response_headers: string | null;
  response_payload: string | null;
  status_code: number | null;
  status: 'SUCCESS' | 'ERROR';
  error_message: string | null;
  error_stack: string | null;
  duration_ms: number;
  retry_count: number;
  created_at: string;
}

export interface TallySyncLogRow {
  id: number;
  company_id: number | null;
  sync_type: string;
  entity_type: string;
  sync_mode: string;
  batch_id: number | null;
  batch_month: string | null;
  batch_number: number | null;
  alter_id: string | null;
  from_alter_id: string | null;
  to_alter_id: string | null;
  request_payload: string | null;
  response_payload: string | null;
  records_fetched: number;
  records_stored: number;
  records_sent: number;
  records_success: number;
  records_failed: number;
  status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'IN_PROGRESS';
  error_message: string | null;
  duration_ms: number;
  started_at: string;
  completed_at: string | null;
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

export interface SyncSettings {
  id: number;
  from_date: string;
  to_date: string;
  is_first_sync_completed: number;
  first_sync_started_at?: string;
  first_sync_completed_at?: string;
  created_at: string;
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

export interface CustomerData {
  id?: number;
  tally_master_id: string;
  ledger_name: string;
  ledger_name_lower: string;
  contact_person?: string;
  email?: string;
  email_cc?: string;
  phone?: string;
  mobile?: string;
  company_name?: string;
  address_json?: string;
  gstin?: string;
  gst_registration_type?: string;
  gst_state?: string;
  bank_details_json?: string;
  opening_balance?: number;
  current_balance?: number;
  current_balance_at?: string;
  tally_alter_id: string;
  synced_at?: string;
  updated_at?: string;
}

export interface VoucherData {
  id?: number;
  tally_master_id: string;
  voucher_number: string;
  voucher_type: string;
  voucher_date: string;
  party_ledger_name?: string;
  customer_master_id?: string;
  total_amount?: number;
  biller_id?: string;
  address?: string;
  state?: string;
  country?: string;
  company_name?: string;
  narration?: string;
  tally_alter_id: string;
  voucher_data_json?: string;
  synced_to_api?: number;
  api_sync_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface VoucherLedgerData {
  id?: number;
  voucher_id: number;
  ledger_name: string;
  amount: number;
  is_party_ledger: number;
  is_deemed_positive: number;
  parent?: string;
}

export interface SyncBatchRow {
  id: number;
  sync_run_id: number;
  entity_type: string;
  batch_number: number;
  batch_size: number;
  from_alter_id: string | null;
  to_alter_id: string | null;
  records_fetched: number;
  records_stored: number;
  records_sent_to_api: number;
  status: string;
  error_message: string | null;
  month_identifier?: string | null;
  month_from_date?: string | null;
  month_to_date?: string | null;
  sync_mode?: string | null;
  started_at: string;
  completed_at: string | null;
}

export class DatabaseService {
  private db: Database.Database | null = null;
  private dbPath: string = '';
  private currentOrganizationUuid: string | null = null;

  constructor(organizationUuid?: string | null) {
    if (organizationUuid) {
      this.initializeDatabase(organizationUuid);
    } else {
      // Default database for initial setup (before login)
      this.dbPath = path.join(app.getPath('userData'), 'tally-sync_default.db');
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      this.init();
    }
  }

  /**
   * Initialize database with organization UUID
   */
  initializeDatabase(organizationUuid: string): void {
    if (this.currentOrganizationUuid === organizationUuid && this.db) {
      // Already using this database
      return;
    }

    // Close existing database if any
    this.closeDatabase();

    // Set new database path
    this.currentOrganizationUuid = organizationUuid;
    this.dbPath = path.join(app.getPath('userData'), `tally-sync_${organizationUuid}.db`);
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.init();
  }

  /**
   * Switch to a different organization database
   */
  switchDatabase(organizationUuid: string): void {
    this.initializeDatabase(organizationUuid);
  }

  /**
   * Close current database connection
   */
  closeDatabase(): void {
    if (this.db) {
      try {
        this.db.close();
        console.log('Database connection closed:', this.dbPath);
      } catch (error) {
        console.error('Error closing database:', error);
      }
      this.db = null;
    }
  }

  /**
   * Get current database path
   */
  getDatabasePath(): string {
    return this.dbPath;
  }

  /**
   * Get current organization UUID
   */
  getCurrentOrganizationUuid(): string | null {
    return this.currentOrganizationUuid;
  }

  /**
   * Check if database file exists
   */
  databaseExists(organizationUuid: string): boolean {
    const dbPath = path.join(app.getPath('userData'), `tally-sync_${organizationUuid}.db`);
    return fs.existsSync(dbPath);
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

        -- Incremental sync tracking (existing)
        last_max_alter_id TEXT DEFAULT '0',
        last_sync_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        -- Fresh sync tracking
        is_first_sync_completed INTEGER DEFAULT 0,
        first_sync_started_at DATETIME,
        first_sync_completed_at DATETIME,

        -- Fresh sync progress tracking (for resume capability)
        last_completed_batch_month TEXT,
        current_batch_alter_id TEXT DEFAULT '0',

        -- Metadata counters (for Invoice/Payment/Journal - no local storage)
        total_batches INTEGER DEFAULT 0,
        completed_batches INTEGER DEFAULT 0,
        total_records_sent INTEGER DEFAULT 0,
        total_records_success INTEGER DEFAULT 0,
        total_records_failed INTEGER DEFAULT 0,

        sync_mode TEXT DEFAULT 'incremental'
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
        company_id INTEGER,
        endpoint TEXT NOT NULL,
        method TEXT NOT NULL,
        request_headers TEXT,
        request_payload TEXT,
        response_headers TEXT,
        response_payload TEXT,
        status_code INTEGER,
        status TEXT NOT NULL,
        error_message TEXT,
        error_stack TEXT,
        duration_ms INTEGER DEFAULT 0,
        retry_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id)
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

      CREATE TABLE IF NOT EXISTS tally_sync_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER,
        sync_type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        sync_mode TEXT NOT NULL,
        batch_id INTEGER,
        batch_month TEXT,
        batch_number INTEGER,
        alter_id TEXT,
        from_alter_id TEXT,
        to_alter_id TEXT,
        request_payload TEXT,
        response_payload TEXT,
        records_fetched INTEGER DEFAULT 0,
        records_stored INTEGER DEFAULT 0,
        records_sent INTEGER DEFAULT 0,
        records_success INTEGER DEFAULT 0,
        records_failed INTEGER DEFAULT 0,
        status TEXT NOT NULL,
        error_message TEXT,
        duration_ms INTEGER DEFAULT 0,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id)
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sync_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        from_date TEXT NOT NULL DEFAULT '',
        to_date TEXT NOT NULL DEFAULT '',
        is_first_sync_completed INTEGER DEFAULT 0,
        first_sync_started_at DATETIME,
        first_sync_completed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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

      CREATE INDEX IF NOT EXISTS idx_api_logs_created_at ON api_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_api_logs_status ON api_logs(status);
      CREATE INDEX IF NOT EXISTS idx_tally_voucher_logs_date ON tally_voucher_logs(date DESC);
      CREATE INDEX IF NOT EXISTS idx_tally_voucher_logs_type ON tally_voucher_logs(voucher_type);
      CREATE INDEX IF NOT EXISTS idx_tally_voucher_logs_status ON tally_voucher_logs(status);
      CREATE INDEX IF NOT EXISTS idx_tally_voucher_logs_sync_history ON tally_voucher_logs(sync_history_id);
      CREATE INDEX IF NOT EXISTS idx_tally_sync_logs_company_id ON tally_sync_logs(company_id);
      CREATE INDEX IF NOT EXISTS idx_tally_sync_logs_entity_type ON tally_sync_logs(entity_type);
      CREATE INDEX IF NOT EXISTS idx_tally_sync_logs_status ON tally_sync_logs(status);
      CREATE INDEX IF NOT EXISTS idx_tally_sync_logs_created_at ON tally_sync_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tally_sync_logs_batch ON tally_sync_logs(batch_id, batch_month, batch_number);
      CREATE INDEX IF NOT EXISTS idx_sync_record_details_sync_history ON sync_record_details(sync_history_id);
      CREATE INDEX IF NOT EXISTS idx_sync_record_details_record_type ON sync_record_details(record_type);
      CREATE INDEX IF NOT EXISTS idx_sync_record_details_status ON sync_record_details(status);

      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tally_master_id TEXT UNIQUE NOT NULL,
        ledger_name TEXT NOT NULL,
        ledger_name_lower TEXT NOT NULL,
        contact_person TEXT,
        email TEXT,
        email_cc TEXT,
        phone TEXT,
        mobile TEXT,
        company_name TEXT,
        address_json TEXT,
        gstin TEXT,
        gst_registration_type TEXT,
        gst_state TEXT,
        bank_details_json TEXT,
        opening_balance REAL DEFAULT 0,
        current_balance REAL DEFAULT 0,
        current_balance_at TEXT,
        tally_alter_id TEXT NOT NULL,
        synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_customers_tally_master_id ON customers(tally_master_id);
      CREATE INDEX IF NOT EXISTS idx_customers_ledger_name_lower ON customers(ledger_name_lower);
      CREATE INDEX IF NOT EXISTS idx_customers_tally_alter_id ON customers(tally_alter_id);

      CREATE TABLE IF NOT EXISTS vouchers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tally_master_id TEXT UNIQUE NOT NULL,
        voucher_number TEXT NOT NULL,
        voucher_type TEXT NOT NULL,
        voucher_date TEXT NOT NULL,
        party_ledger_name TEXT,
        customer_master_id TEXT,
        total_amount REAL DEFAULT 0,
        biller_id TEXT,
        address TEXT,
        state TEXT,
        country TEXT,
        company_name TEXT,
        narration TEXT,
        tally_alter_id TEXT NOT NULL,
        voucher_data_json TEXT,
        synced_to_api INTEGER DEFAULT 0,
        api_sync_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_master_id) REFERENCES customers(tally_master_id)
      );

      CREATE INDEX IF NOT EXISTS idx_vouchers_tally_master_id ON vouchers(tally_master_id);
      CREATE INDEX IF NOT EXISTS idx_vouchers_voucher_number ON vouchers(voucher_number);
      CREATE INDEX IF NOT EXISTS idx_vouchers_customer_master_id ON vouchers(customer_master_id);
      CREATE INDEX IF NOT EXISTS idx_vouchers_tally_alter_id ON vouchers(tally_alter_id);
      CREATE INDEX IF NOT EXISTS idx_vouchers_voucher_type ON vouchers(voucher_type);
      CREATE INDEX IF NOT EXISTS idx_vouchers_synced_to_api ON vouchers(synced_to_api);

      CREATE TABLE IF NOT EXISTS voucher_ledgers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        voucher_id INTEGER NOT NULL,
        ledger_name TEXT NOT NULL,
        amount REAL DEFAULT 0,
        is_party_ledger INTEGER DEFAULT 0,
        is_deemed_positive INTEGER DEFAULT 0,
        parent TEXT,
        FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_voucher_ledgers_voucher_id ON voucher_ledgers(voucher_id);

      CREATE TABLE IF NOT EXISTS sync_batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_run_id INTEGER NOT NULL,
        entity_type TEXT NOT NULL,
        batch_number INTEGER NOT NULL,
        batch_size INTEGER NOT NULL,
        from_alter_id TEXT,
        to_alter_id TEXT,
        records_fetched INTEGER DEFAULT 0,
        records_stored INTEGER DEFAULT 0,
        records_sent_to_api INTEGER DEFAULT 0,
        status TEXT NOT NULL,
        error_message TEXT,
        month_identifier TEXT,
        month_from_date TEXT,
        month_to_date TEXT,
        sync_mode TEXT DEFAULT 'incremental',
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        FOREIGN KEY (sync_run_id) REFERENCES sync_history(id)
      );

      CREATE INDEX IF NOT EXISTS idx_sync_batches_sync_run_id ON sync_batches(sync_run_id);
      CREATE INDEX IF NOT EXISTS idx_sync_batches_status ON sync_batches(status);
      CREATE INDEX IF NOT EXISTS idx_sync_batches_month ON sync_batches(month_identifier);

      CREATE TABLE IF NOT EXISTS entity_batch_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity TEXT NOT NULL,
        batch_month TEXT NOT NULL,
        batch_number INTEGER NOT NULL,

        -- Tally fetch tracking
        tally_fetch_started_at DATETIME,
        tally_fetch_completed_at DATETIME,
        tally_fetch_status TEXT DEFAULT 'PENDING',
        tally_records_fetched INTEGER DEFAULT 0,
        tally_error_message TEXT,

        -- API push tracking
        api_push_started_at DATETIME,
        api_push_completed_at DATETIME,
        api_push_status TEXT DEFAULT 'PENDING',
        api_records_sent INTEGER DEFAULT 0,
        api_records_success INTEGER DEFAULT 0,
        api_records_failed INTEGER DEFAULT 0,
        api_error_message TEXT,

        -- Resume tracking
        is_completed INTEGER DEFAULT 0,
        retry_count INTEGER DEFAULT 0,
        last_alter_id TEXT,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        UNIQUE(entity, batch_month, batch_number)
      );

      CREATE INDEX IF NOT EXISTS idx_entity_batch_log_entity ON entity_batch_log(entity);
      CREATE INDEX IF NOT EXISTS idx_entity_batch_log_status ON entity_batch_log(entity, is_completed);

      INSERT OR IGNORE INTO global_sync_status (id) VALUES (1);
      INSERT OR IGNORE INTO sync_settings (id, from_date, to_date) VALUES (1, '', '');

      INSERT OR IGNORE INTO entity_sync_status (entity, last_max_alter_id) VALUES
        ('CUSTOMER', '0'),
        ('INVOICE', '0'),
        ('PAYMENT', '0'),
        ('STOCKITEM', '0'),
        ('JOURNAL', '0'),
        ('ORGANIZATION', '0');

      -- New tables for company management and enhanced sync logging
      CREATE TABLE IF NOT EXISTS companies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        biller_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        tally_id TEXT NOT NULL,
        name TEXT NOT NULL,
        gstin TEXT,
        address TEXT,
        state TEXT,
        country TEXT DEFAULT 'India',
        pin TEXT,
        trn TEXT,
        book_start_from TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(biller_id, organization_id)
      );

      CREATE TABLE IF NOT EXISTS sync_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        sync_type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        status TEXT NOT NULL,
        message TEXT,
        records_count INTEGER DEFAULT 0,
        duration_ms INTEGER,
        error_stack TEXT,
        start_date TEXT,
        end_date TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id)
      );

      CREATE TABLE IF NOT EXISTS last_sync_dates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        entity_type TEXT NOT NULL,
        last_sync_date TEXT NOT NULL,
        last_sync_timestamp DATETIME,
        records_synced INTEGER DEFAULT 0,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        UNIQUE(company_id, entity_type)
      );

      CREATE INDEX IF NOT EXISTS idx_companies_biller_id ON companies(biller_id);
      CREATE INDEX IF NOT EXISTS idx_companies_organization_id ON companies(organization_id);
      CREATE INDEX IF NOT EXISTS idx_companies_is_active ON companies(is_active);
      CREATE INDEX IF NOT EXISTS idx_sync_logs_company_id ON sync_logs(company_id);
      CREATE INDEX IF NOT EXISTS idx_sync_logs_timestamp ON sync_logs(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON sync_logs(status);
      CREATE INDEX IF NOT EXISTS idx_last_sync_dates_company_id ON last_sync_dates(company_id);
      CREATE INDEX IF NOT EXISTS idx_last_sync_dates_entity_type ON last_sync_dates(entity_type);
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

    // Extract and store organization UUID if available
    if (org) {
      const profile: UserProfile = { email, token, biller_id: billerId, apikey, organization: org };
      const orgUuid = this.extractOrganizationUuid(profile);
      if (orgUuid) {
        await this.setOrganizationUuid(orgUuid);
      }
    }
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
    // Only clear profile (session data), keep all sync data intact
    this.db!.exec(`DELETE FROM profiles`);
    // Clear organization UUID from settings
    const stmt = this.db!.prepare(`DELETE FROM app_settings WHERE key = ?`);
    stmt.run('organizationUuid');
    this.log('INFO', 'Logged out - profile cleared, data preserved');
    // Close database connection
    this.closeDatabase();
    this.currentOrganizationUuid = null;
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

  /**
   * Reset entity ALTER_ID to 0 (used when forcing a fresh sync)
   */
  async resetEntityAlterId(entity: string): Promise<void> {
    const stmt = this.db!.prepare(`
      UPDATE entity_sync_status
      SET last_max_alter_id = '0',
          last_sync_at = datetime('now')
      WHERE entity = ?
    `);
    stmt.run(entity.toUpperCase());
  }

  async getAllEntitySyncStatus(): Promise<EntitySyncStatus[]> {
    const stmt = this.db!.prepare(`SELECT entity, last_max_alter_id, last_sync_at FROM entity_sync_status ORDER BY last_sync_at DESC`);
    return stmt.all() as EntitySyncStatus[];
  }

  // === Batch-Level Logging Methods ===

  /**
   * Start a new batch log entry
   */
  async startBatchLog(entity: string, batchMonth: string, batchNumber: number): Promise<number> {
    const stmt = this.db!.prepare(`
      INSERT INTO entity_batch_log (
        entity, batch_month, batch_number,
        tally_fetch_started_at,
        tally_fetch_status,
        api_push_status,
        is_completed
      ) VALUES (?, ?, ?, datetime('now'), 'PENDING', 'PENDING', 0)
      ON CONFLICT(entity, batch_month, batch_number) DO UPDATE SET
        tally_fetch_started_at = datetime('now'),
        retry_count = retry_count + 1,
        updated_at = datetime('now')
    `);
    const result = stmt.run(entity.toUpperCase(), batchMonth, batchNumber);
    return result.lastInsertRowid as number;
  }

  /**
   * Update Tally fetch status for a batch
   */
  async updateBatchTallyFetchStatus(
    entity: string,
    batchMonth: string,
    batchNumber: number,
    status: {
      status: 'SUCCESS' | 'FAILED' | 'PARTIAL';
      recordsFetched: number;
      errorMessage?: string;
      lastAlterId?: string;
    }
  ): Promise<void> {
    const stmt = this.db!.prepare(`
      UPDATE entity_batch_log
      SET tally_fetch_completed_at = datetime('now'),
          tally_fetch_status = ?,
          tally_records_fetched = ?,
          tally_error_message = ?,
          last_alter_id = ?,
          updated_at = datetime('now')
      WHERE entity = ? AND batch_month = ? AND batch_number = ?
    `);
    stmt.run(
      status.status,
      status.recordsFetched,
      status.errorMessage || null,
      status.lastAlterId || null,
      entity.toUpperCase(),
      batchMonth,
      batchNumber
    );
  }

  /**
   * Update API push status for a batch
   */
  async updateBatchApiPushStatus(
    entity: string,
    batchMonth: string,
    batchNumber: number,
    status: {
      status: 'SUCCESS' | 'FAILED' | 'PARTIAL';
      recordsSent: number;
      recordsSuccess: number;
      recordsFailed: number;
      errorMessage?: string;
    }
  ): Promise<void> {
    const stmt = this.db!.prepare(`
      UPDATE entity_batch_log
      SET api_push_started_at = COALESCE(api_push_started_at, datetime('now')),
          api_push_completed_at = datetime('now'),
          api_push_status = ?,
          api_records_sent = ?,
          api_records_success = ?,
          api_records_failed = ?,
          api_error_message = ?,
          updated_at = datetime('now')
      WHERE entity = ? AND batch_month = ? AND batch_number = ?
    `);
    stmt.run(
      status.status,
      status.recordsSent,
      status.recordsSuccess,
      status.recordsFailed,
      status.errorMessage || null,
      entity.toUpperCase(),
      batchMonth,
      batchNumber
    );
  }

  /**
   * Mark a batch as completed (both Tally fetch and API push succeeded)
   */
  async markBatchCompleted(
    entity: string,
    batchMonth: string,
    batchNumber: number
  ): Promise<void> {
    const stmt = this.db!.prepare(`
      UPDATE entity_batch_log
      SET is_completed = 1,
          updated_at = datetime('now')
      WHERE entity = ? AND batch_month = ? AND batch_number = ?
    `);
    stmt.run(entity.toUpperCase(), batchMonth, batchNumber);
  }

  /**
   * Get all failed/incomplete batches for an entity (for retry logic)
   */
  async getIncompleteBatches(entity: string): Promise<Array<{
    batch_month: string;
    batch_number: number;
    tally_fetch_status: string;
    api_push_status: string;
    retry_count: number;
    tally_error_message: string | null;
    api_error_message: string | null;
  }>> {
    const stmt = this.db!.prepare(`
      SELECT batch_month, batch_number, tally_fetch_status, api_push_status,
             retry_count, tally_error_message, api_error_message
      FROM entity_batch_log
      WHERE entity = ? AND is_completed = 0
      ORDER BY batch_month, batch_number
    `);
    return stmt.all(entity.toUpperCase()) as any[];
  }

  /**
   * Get batch log details for UI display
   */
  async getBatchLogDetails(entity: string, batchMonth: string): Promise<Array<{
    batch_number: number;
    tally_records_fetched: number;
    api_records_sent: number;
    api_records_success: number;
    api_records_failed: number;
    is_completed: number;
    tally_error_message: string | null;
    api_error_message: string | null;
  }>> {
    const stmt = this.db!.prepare(`
      SELECT batch_number, tally_records_fetched, api_records_sent,
             api_records_success, api_records_failed, is_completed,
             tally_error_message, api_error_message
      FROM entity_batch_log
      WHERE entity = ? AND batch_month = ?
      ORDER BY batch_number
    `);
    return stmt.all(entity.toUpperCase(), batchMonth) as any[];
  }

  // === Fresh Sync State Management ===

  /**
   * Check if entity has completed its first sync
   */
  async isEntityFirstSyncCompleted(entity: string): Promise<boolean> {
    const stmt = this.db!.prepare(`
      SELECT is_first_sync_completed
      FROM entity_sync_status
      WHERE entity = ?
    `);
    const row = stmt.get(entity.toUpperCase()) as { is_first_sync_completed: number } | undefined;
    return row?.is_first_sync_completed === 1;
  }

  /**
   * Start first sync for entity - initialize batch tracking
   */
  async startEntityFirstSync(entity: string, totalBatches: number): Promise<void> {
    const stmt = this.db!.prepare(`
      UPDATE entity_sync_status
      SET sync_mode = 'first_sync',
          is_first_sync_completed = 0,
          first_sync_started_at = datetime('now'),
          total_batches = ?,
          completed_batches = 0,
          last_completed_batch_month = NULL,
          current_batch_alter_id = '0'
      WHERE entity = ?
    `);
    stmt.run(totalBatches, entity.toUpperCase());
  }

  /**
   * Mark entity first sync as completed
   */
  async completeEntityFirstSync(entity: string): Promise<void> {
    const stmt = this.db!.prepare(`
      UPDATE entity_sync_status
      SET is_first_sync_completed = 1,
          first_sync_completed_at = datetime('now'),
          sync_mode = 'incremental'
      WHERE entity = ?
    `);
    stmt.run(entity.toUpperCase());
  }

  /**
   * Check if entity first sync is complete (alias for consistency)
   */
  async isEntityFirstSyncComplete(entityType: string): Promise<boolean> {
    return this.isEntityFirstSyncCompleted(entityType);
  }

  /**
   * Mark entity first sync as complete (alias for consistency)
   */
  async markEntityFirstSyncComplete(entityType: string): Promise<void> {
    return this.completeEntityFirstSync(entityType);
  }

  /**
   * Get all entities that need first sync
   */
  async getEntitiesNeedingFirstSync(): Promise<string[]> {
    const stmt = this.db!.prepare(`
      SELECT entity
      FROM entity_sync_status
      WHERE is_first_sync_completed = 0
      ORDER BY entity
    `);
    const rows = stmt.all() as { entity: string }[];
    return rows.map(row => row.entity);
  }

  /**
   * Check if all entities have completed first sync
   */
  async areAllEntitiesFirstSyncComplete(): Promise<boolean> {
    const stmt = this.db!.prepare(`
      SELECT COUNT(*) as incomplete_count
      FROM entity_sync_status
      WHERE is_first_sync_completed = 0
    `);
    const row = stmt.get() as { incomplete_count: number } | undefined;
    return (row?.incomplete_count || 0) === 0;
  }

  /**
   * Get batch progress for entity (used to resume interrupted sync)
   */
  async getEntityBatchProgress(entity: string): Promise<{
    lastCompletedMonth: string | null;
    currentAlterId: string;
    completedBatches: number;
    totalBatches: number;
    syncMode: 'first_sync' | 'incremental';
  }> {
    const stmt = this.db!.prepare(`
      SELECT last_completed_batch_month, current_batch_alter_id,
             completed_batches, total_batches, sync_mode
      FROM entity_sync_status
      WHERE entity = ?
    `);
    const row = stmt.get(entity.toUpperCase()) as any;
    return {
      lastCompletedMonth: row?.last_completed_batch_month || null,
      currentAlterId: row?.current_batch_alter_id || '0',
      completedBatches: row?.completed_batches || 0,
      totalBatches: row?.total_batches || 0,
      syncMode: row?.sync_mode || 'incremental'
    };
  }

  /**
   * Update batch progress after completing a monthly batch
   * NOTE: We reset current_batch_alter_id to '0' when moving to next month
   */
  async updateEntityBatchProgress(entity: string, progress: {
    lastCompletedMonth: string;
    completedBatches: number;
  }): Promise<void> {
    const stmt = this.db!.prepare(`
      UPDATE entity_sync_status
      SET last_completed_batch_month = ?,
          completed_batches = ?,
          current_batch_alter_id = '0',
          last_sync_at = datetime('now')
      WHERE entity = ?
    `);
    stmt.run(
      progress.lastCompletedMonth,
      progress.completedBatches,
      entity.toUpperCase()
    );
  }

  /**
   * Get sync mode for entity
   */
  async getEntitySyncMode(entity: string): Promise<'first_sync' | 'incremental'> {
    console.log('entity===>', entity)
    const stmt = this.db!.prepare(`
      SELECT sync_mode FROM entity_sync_status WHERE entity = ?
    `);
    const row = stmt.get(entity.toUpperCase()) as { sync_mode: string } | undefined;
    console.log('row==>', row)
    return 'first_sync';
  }

  /**
   * Set sync mode for entity
   */
  async setEntitySyncMode(entity: string, mode: 'first_sync' | 'incremental'): Promise<void> {
    const stmt = this.db!.prepare(`
      UPDATE entity_sync_status SET sync_mode = ? WHERE entity = ?
    `);
    stmt.run(mode, entity.toUpperCase());
  }

  /**
   * Get complete sync status for entity (for UI display)
   */
  async getEntitySyncStatus(entity: string): Promise<{
    entity: string;
    sync_mode: 'first_sync' | 'incremental';
    is_first_sync_completed: number;
    last_sync_at: string | null;
    last_max_alter_id: string;
    completed_batches: number;
    total_batches: number;
    last_completed_batch_month: string | null;
    total_records_sent: number;
    total_records_success: number;
    total_records_failed: number;
  }> {
    const stmt = this.db!.prepare(`
      SELECT * FROM entity_sync_status WHERE entity = ?
    `);
    return stmt.get(entity.toUpperCase()) as any;
  }

  /**
   * Update record counts after API push (for Invoice/Payment/Journal)
   * Called after each API batch is processed
   */
  async updateEntityRecordCounts(entity: string, counts: {
    sent: number;
    success: number;
    failed: number;
  }): Promise<void> {
    const stmt = this.db!.prepare(`
      UPDATE entity_sync_status
      SET total_records_sent = total_records_sent + ?,
          total_records_success = total_records_success + ?,
          total_records_failed = total_records_failed + ?,
          last_sync_at = datetime('now')
      WHERE entity = ?
    `);
    stmt.run(counts.sent, counts.success, counts.failed, entity.toUpperCase());
  }

  /**
   * Get sync settings (global date range)
   */
  async getSyncSettingsGlobalDates(): Promise<{
    global_from_date: string;
    global_to_date: string;
  }> {
    const settings = await this.getSyncSettings();
    return {
      global_from_date: settings?.from_date || '2023-04-01',
      global_to_date: settings?.to_date || '2026-03-31'
    };
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
    requestHeaders: any,
    requestPayload: any,
    responseHeaders: any,
    responsePayload: any,
    statusCode: number | null,
    status: 'SUCCESS' | 'ERROR',
    errorMessage: string | null,
    errorStack: string | null,
    durationMs: number,
    companyId?: number | null,
    retryCount: number = 0
  ): Promise<number> {
    const requestHeadersJson = requestHeaders ? JSON.stringify(requestHeaders) : null;
    const requestJson = requestPayload ? JSON.stringify(requestPayload) : null;
    const responseHeadersJson = responseHeaders ? JSON.stringify(responseHeaders) : null;
    const responseJson = responsePayload ? JSON.stringify(responsePayload) : null;
    const stmt = this.db!.prepare(`
      INSERT INTO api_logs (company_id, endpoint, method, request_headers, request_payload, response_headers, response_payload, status_code, status, error_message, error_stack, duration_ms, retry_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      companyId || null,
      endpoint,
      method.toUpperCase(),
      requestHeadersJson,
      requestJson,
      responseHeadersJson,
      responseJson,
      statusCode,
      status,
      errorMessage,
      errorStack,
      durationMs,
      retryCount
    );
    return Number(info.lastInsertRowid);
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
      if (row.request_headers) {
        try { row.request_headers = JSON.parse(row.request_headers as any); } catch { }
      }
      if (row.request_payload) {
        try { row.request_payload = JSON.parse(row.request_payload as any); } catch { }
      }
      if (row.response_headers) {
        try { row.response_headers = JSON.parse(row.response_headers as any); } catch { }
      }
      if (row.response_payload) {
        try { row.response_payload = JSON.parse(row.response_payload as any); } catch { }
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

  /**
   * Store organization UUID in app settings
   */
  async setOrganizationUuid(uuid: string): Promise<void> {
    await this.setSetting('organizationUuid', uuid);
    this.currentOrganizationUuid = uuid;
  }

  /**
   * Get stored organization UUID from app settings
   */
  async getOrganizationUuid(): Promise<string | null> {
    return await this.getSetting('organizationUuid');
  }

  /**
   * Extract organization UUID from profile
   */
  extractOrganizationUuid(profile: UserProfile | null): string | null {
    if (!profile) return null;

    // Try profile.organization.response.organization_id first
    if (profile?.organization?.response?.organization_id) {
      return String(profile.organization.response.organization_id).trim();
    }

    // Try profile.organization.organization_data
    if (profile?.organization?.organization_data) {
      let orgData = profile.organization.organization_data;
      if (typeof orgData === 'string') {
        try {
          orgData = JSON.parse(orgData);
        } catch (e) {
          console.warn('Failed to parse organization_data as JSON:', e);
          return null;
        }
      }
      if (orgData?.organization_id) {
        return String(orgData.organization_id).trim();
      }
    }

    return null;
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

  // === Sync Settings Management ===
  async getSyncSettings(): Promise<SyncSettings | null> {
    const stmt = this.db!.prepare(`SELECT * FROM sync_settings WHERE id = 1`);
    return stmt.get() as SyncSettings | null;
  }

  async updateSyncSettings(fromDate: string, toDate: string): Promise<void> {
    const stmt = this.db!.prepare(`
      UPDATE sync_settings
      SET from_date = ?, to_date = ?, updated_at = datetime('now')
      WHERE id = 1
    `);
    stmt.run(fromDate, toDate);
  }

  async markFirstSyncStarted(): Promise<void> {
    const stmt = this.db!.prepare(`
      UPDATE sync_settings
      SET first_sync_started_at = datetime('now'), updated_at = datetime('now')
      WHERE id = 1
    `);
    stmt.run();
  }

  async markFirstSyncCompleted(): Promise<void> {
    const stmt = this.db!.prepare(`
      UPDATE sync_settings
      SET is_first_sync_completed = 1,
          first_sync_completed_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = 1
    `);
    stmt.run();
  }

  async resetFirstSyncFlag(): Promise<void> {
    const stmt = this.db!.prepare(`
      UPDATE sync_settings
      SET is_first_sync_completed = 0,
          first_sync_started_at = NULL,
          first_sync_completed_at = NULL,
          updated_at = datetime('now')
      WHERE id = 1
    `);
    stmt.run();
  }

  async getLastCompletedMonth(entityType: string, runId: number): Promise<string | null> {
    const stmt = this.db!.prepare(`
      SELECT month_identifier
      FROM sync_batches
      WHERE sync_run_id = ? AND entity_type = ? AND status = 'API_SUCCESS'
      ORDER BY month_from_date DESC
      LIMIT 1
    `);
    const row = stmt.get(runId, entityType) as { month_identifier: string } | undefined;
    return row?.month_identifier || null;
  }

  // === Tally Sync Logs ===
  async logTallySyncStart(
    companyId: number | null,
    syncType: string,
    entityType: string,
    syncMode: 'batch' | 'alter_id' | 'incremental',
    batchId?: number | null,
    batchMonth?: string | null,
    batchNumber?: number | null,
    alterId?: string | null,
    fromAlterId?: string | null,
    toAlterId?: string | null
  ): Promise<number> {
    const stmt = this.db!.prepare(`
      INSERT INTO tally_sync_logs (
        company_id, sync_type, entity_type, sync_mode, batch_id, batch_month, batch_number,
        alter_id, from_alter_id, to_alter_id, status, started_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'IN_PROGRESS', datetime('now'))
    `);
    const info = stmt.run(
      companyId,
      syncType,
      entityType,
      syncMode,
      batchId || null,
      batchMonth || null,
      batchNumber || null,
      alterId || null,
      fromAlterId || null,
      toAlterId || null
    );
    return Number(info.lastInsertRowid);
  }

  async logTallySyncRequest(
    logId: number,
    requestPayload: any
  ): Promise<void> {
    const requestJson = requestPayload ? JSON.stringify(requestPayload) : null;
    const stmt = this.db!.prepare(`
      UPDATE tally_sync_logs
      SET request_payload = ?
      WHERE id = ?
    `);
    stmt.run(requestJson, logId);
  }

  async logTallySyncResponse(
    logId: number,
    responsePayload: any,
    recordsFetched: number = 0,
    recordsStored: number = 0
  ): Promise<void> {
    const responseJson = responsePayload ? JSON.stringify(responsePayload) : null;
    const stmt = this.db!.prepare(`
      UPDATE tally_sync_logs
      SET response_payload = ?, records_fetched = ?, records_stored = ?
      WHERE id = ?
    `);
    stmt.run(responseJson, recordsFetched, recordsStored, logId);
  }

  async logTallySyncComplete(
    logId: number,
    status: 'SUCCESS' | 'FAILED',
    recordsSent: number = 0,
    recordsSuccess: number = 0,
    recordsFailed: number = 0,
    errorMessage: string | null = null,
    durationMs: number = 0
  ): Promise<void> {
    const stmt = this.db!.prepare(`
      UPDATE tally_sync_logs
      SET status = ?, records_sent = ?, records_success = ?, records_failed = ?,
          error_message = ?, duration_ms = ?, completed_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run(status, recordsSent, recordsSuccess, recordsFailed, errorMessage, durationMs, logId);
  }

  async getTallySyncLogs(filters?: {
    companyId?: number;
    entityType?: string;
    status?: 'SUCCESS' | 'FAILED' | 'PENDING' | 'IN_PROGRESS';
    syncMode?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
  }): Promise<TallySyncLogRow[]> {
    let query = `SELECT * FROM tally_sync_logs WHERE 1=1`;
    const params: any[] = [];

    if (filters?.companyId) {
      query += ` AND company_id = ?`;
      params.push(filters.companyId);
    }
    if (filters?.entityType) {
      query += ` AND entity_type = ?`;
      params.push(filters.entityType);
    }
    if (filters?.status) {
      query += ` AND status = ?`;
      params.push(filters.status);
    }
    if (filters?.syncMode) {
      query += ` AND sync_mode = ?`;
      params.push(filters.syncMode);
    }
    if (filters?.fromDate) {
      query += ` AND created_at >= ?`;
      params.push(filters.fromDate);
    }
    if (filters?.toDate) {
      query += ` AND created_at <= ?`;
      params.push(filters.toDate);
    }

    query += ` ORDER BY created_at DESC`;
    if (filters?.limit) {
      query += ` LIMIT ?`;
      params.push(filters.limit);
    } else {
      query += ` LIMIT 100`;
    }

    const stmt = this.db!.prepare(query);
    const rows = stmt.all(...params) as TallySyncLogRow[];

    // Parse JSON fields
    rows.forEach(row => {
      if (row.request_payload) {
        try { row.request_payload = JSON.parse(row.request_payload as any); } catch { }
      }
      if (row.response_payload) {
        try { row.response_payload = JSON.parse(row.response_payload as any); } catch { }
      }
    });

    return rows;
  }

  // === Log Management ===
  async clearLogs(logType: 'system' | 'api' | 'tally_sync' | 'voucher'): Promise<void> {
    if (logType === 'system') {
      this.db!.exec('DELETE FROM logs');
    } else if (logType === 'api') {
      this.db!.exec('DELETE FROM api_logs');
    } else if (logType === 'tally_sync') {
      this.db!.exec('DELETE FROM tally_sync_logs');
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

    // console.log('All syncs from database:', allSyncs.length);
    // console.log('All sync entity types:', allSyncs.map(s => ({ type: s.entity_type, id: s.id, status: s.status })));

    // Filter for ORGANIZATION and CUSTOMER (case-insensitive, trim whitespace)
    const filteredSyncs = allSyncs.filter(s => {
      const type = (s.entity_type || '').trim().toUpperCase();
      return type === 'ORGANIZATION' || type === 'CUSTOMER';
    });

    // console.log('Filtered syncs for recent history:', filteredSyncs.length, filteredSyncs.map(s => ({ type: s.entity_type, status: s.status, count: s.entity_count, id: s.id })));

    // Group by entity_type and get latest for each (case-insensitive)
    const latestByType: Map<string, SyncHistoryRow> = new Map();
    for (const sync of filteredSyncs) {
      const key = (sync.entity_type || '').trim().toUpperCase();
      // Only get the latest (first one we encounter since we're ordering DESC)
      if (!latestByType.has(key)) {
        latestByType.set(key, sync);
      }
    }

    // console.log('Latest by type keys:', Array.from(latestByType.keys()));

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

      // console.log('Customer sync data:', {
      //   id: customerSync.id,
      //   entity_count: customerSync.entity_count,
      //   entity_count_parsed: entityCount,
      //   failed_count: customerSync.failed_count,
      //   failed_count_parsed: failedCount,
      //   totalRecords,
      //   successCount,
      //   failedCount,
      //   status: customerSync.status
      // });

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

      // console.log('Customer item to be added:', JSON.stringify(customerItem, null, 2));
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

      // console.log('Voucher stats from tally_voucher_logs:', voucherStats.length, voucherStats);

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
        // console.log('Returning voucher summary from tally_voucher_logs:', result);
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

    // console.log('Final voucher summary result:', result);
    return result;
  }

  // === Customer Operations ===
  async insertCustomer(customer: CustomerData): Promise<void> {
    const stmt = this.db!.prepare(`
      INSERT OR REPLACE INTO customers (
        tally_master_id, ledger_name, ledger_name_lower, contact_person, email, email_cc,
        phone, mobile, company_name, address_json, gstin, gst_registration_type, gst_state,
        bank_details_json, opening_balance, current_balance, current_balance_at, tally_alter_id,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    stmt.run(
      customer.tally_master_id,
      customer.ledger_name,
      customer.ledger_name_lower,
      customer.contact_person || null,
      customer.email || null,
      customer.email_cc || null,
      customer.phone || null,
      customer.mobile || null,
      customer.company_name || null,
      customer.address_json || null,
      customer.gstin || null,
      customer.gst_registration_type || null,
      customer.gst_state || null,
      customer.bank_details_json || null,
      customer.opening_balance || 0,
      customer.current_balance || 0,
      customer.current_balance_at || null,
      customer.tally_alter_id
    );
  }

  async getCustomerByMasterId(masterId: string): Promise<CustomerData | null> {
    const stmt = this.db!.prepare(`SELECT * FROM customers WHERE tally_master_id = ?`);
    const row = stmt.get(masterId) as any;
    return row || null;
  }

  async getCustomerByLedgerName(ledgerName: string): Promise<CustomerData | null> {
    const stmt = this.db!.prepare(`SELECT * FROM customers WHERE ledger_name_lower = ?`);
    const row = stmt.get(ledgerName.toLowerCase()) as any;
    return row || null;
  }

  async getCustomersByAlterIdRange(fromAlterId: string, toAlterId: string): Promise<CustomerData[]> {
    const stmt = this.db!.prepare(`
      SELECT * FROM customers 
      WHERE CAST(tally_alter_id AS INTEGER) >= CAST(? AS INTEGER) 
        AND CAST(tally_alter_id AS INTEGER) <= CAST(? AS INTEGER)
      ORDER BY CAST(tally_alter_id AS INTEGER) ASC
    `);
    return stmt.all(fromAlterId, toAlterId) as CustomerData[];
  }

  async getMaxCustomerAlterId(): Promise<string> {
    const stmt = this.db!.prepare(`SELECT MAX(CAST(tally_alter_id AS INTEGER)) as max_id FROM customers`);
    const row = stmt.get() as { max_id: number | null } | undefined;
    return row?.max_id?.toString() || '0';
  }

  // === Voucher Operations ===
  async insertVoucher(voucher: VoucherData): Promise<number> {
    const stmt = this.db!.prepare(`
      INSERT OR REPLACE INTO vouchers (
        tally_master_id, voucher_number, voucher_type, voucher_date, party_ledger_name,
        customer_master_id, total_amount, biller_id, address, state, country, company_name,
        narration, tally_alter_id, voucher_data_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    const info = stmt.run(
      voucher.tally_master_id,
      voucher.voucher_number,
      voucher.voucher_type,
      voucher.voucher_date,
      voucher.party_ledger_name || null,
      voucher.customer_master_id || null,
      voucher.total_amount || 0,
      voucher.biller_id || null,
      voucher.address || null,
      voucher.state || null,
      voucher.country || null,
      voucher.company_name || null,
      voucher.narration || null,
      voucher.tally_alter_id,
      voucher.voucher_data_json || null
    );

    return Number(info.lastInsertRowid);
  }

  async insertVoucherLedgers(voucherId: number, ledgers: VoucherLedgerData[]): Promise<void> {
    const stmt = this.db!.prepare(`
      INSERT INTO voucher_ledgers (voucher_id, ledger_name, amount, is_party_ledger, is_deemed_positive, parent)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db!.transaction((ledgers: VoucherLedgerData[]) => {
      for (const ledger of ledgers) {
        stmt.run(
          voucherId,
          ledger.ledger_name,
          ledger.amount,
          ledger.is_party_ledger,
          ledger.is_deemed_positive,
          ledger.parent || null
        );
      }
    });

    insertMany(ledgers);
  }

  async getVouchersByAlterIdRange(fromAlterId: string, toAlterId: string): Promise<VoucherData[]> {
    const stmt = this.db!.prepare(`
      SELECT * FROM vouchers 
      WHERE CAST(tally_alter_id AS INTEGER) >= CAST(? AS INTEGER) 
        AND CAST(tally_alter_id AS INTEGER) <= CAST(? AS INTEGER)
      ORDER BY CAST(tally_alter_id AS INTEGER) ASC
    `);
    return stmt.all(fromAlterId, toAlterId) as VoucherData[];
  }

  async getVouchersNotSyncedToApi(limit: number = 100): Promise<VoucherData[]> {
    const stmt = this.db!.prepare(`
      SELECT * FROM vouchers 
      WHERE synced_to_api = 0 
      ORDER BY CAST(tally_alter_id AS INTEGER) ASC 
      LIMIT ?
    `);
    return stmt.all(limit) as VoucherData[];
  }

  async markVoucherSyncedToApi(voucherId: number): Promise<void> {
    const stmt = this.db!.prepare(`
      UPDATE vouchers 
      SET synced_to_api = 1, api_sync_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run(voucherId);
  }

  async getMaxVoucherAlterId(): Promise<string> {
    const stmt = this.db!.prepare(`SELECT MAX(CAST(tally_alter_id AS INTEGER)) as max_id FROM vouchers`);
    const row = stmt.get() as { max_id: number | null } | undefined;
    return row?.max_id?.toString() || '0';
  }

  // === Batch Tracking Operations ===
  async createSyncBatch(
    runId: number,
    entityType: string,
    batchNumber: number,
    batchSize: number,
    fromAlterId: string,
    toAlterId: string,
    monthIdentifier?: string,
    monthFromDate?: string,
    monthToDate?: string,
    syncMode?: string
  ): Promise<number> {
    const stmt = this.db!.prepare(`
      INSERT INTO sync_batches (sync_run_id, entity_type, batch_number, batch_size, from_alter_id, to_alter_id, status, month_identifier, month_from_date, month_to_date, sync_mode)
      VALUES (?, ?, ?, ?, ?, ?, 'FETCHED', ?, ?, ?, ?)
    `);
    const info = stmt.run(
      runId,
      entityType,
      batchNumber,
      batchSize,
      fromAlterId,
      toAlterId,
      monthIdentifier || null,
      monthFromDate || null,
      monthToDate || null,
      syncMode || 'incremental'
    );
    return Number(info.lastInsertRowid);
  }

  async updateSyncBatchStatus(
    batchId: number,
    status: string,
    recordsFetched?: number,
    recordsStored?: number,
    recordsSentToApi?: number,
    errorMessage?: string
  ): Promise<void> {
    let query = `UPDATE sync_batches SET status = ?`;
    const params: any[] = [status];

    if (recordsFetched !== undefined) {
      query += `, records_fetched = ?`;
      params.push(recordsFetched);
    }
    if (recordsStored !== undefined) {
      query += `, records_stored = ?`;
      params.push(recordsStored);
    }
    if (recordsSentToApi !== undefined) {
      query += `, records_sent_to_api = ?`;
      params.push(recordsSentToApi);
    }
    if (errorMessage !== undefined) {
      query += `, error_message = ?`;
      params.push(errorMessage);
    }
    if (status === 'COMPLETED' || status === 'API_SUCCESS' || status === 'API_FAILED') {
      query += `, completed_at = datetime('now')`;
    }

    query += ` WHERE id = ?`;
    params.push(batchId);

    const stmt = this.db!.prepare(query);
    stmt.run(...params);
  }

  async getSyncBatchesByRunId(runId: number): Promise<SyncBatchRow[]> {
    const stmt = this.db!.prepare(`
      SELECT * FROM sync_batches 
      WHERE sync_run_id = ? 
      ORDER BY batch_number ASC
    `);
    return stmt.all(runId) as SyncBatchRow[];
  }

  /**
   * Get incomplete/failed batches from sync_batches table for an entity
   */
  async getIncompleteSyncBatches(entity: string): Promise<SyncBatchRow[]> {
    const stmt = this.db!.prepare(`
      SELECT sb.* 
      FROM sync_batches sb
      INNER JOIN sync_history sh ON sb.sync_run_id = sh.id
      WHERE sb.entity_type = ? 
        AND sb.sync_mode = 'first_sync'
        AND sb.status NOT IN ('COMPLETED', 'API_SUCCESS')
        AND sh.completed_at IS NULL
      ORDER BY sb.month_identifier ASC, sb.batch_number ASC
    `);
    return stmt.all(entity.toUpperCase()) as SyncBatchRow[];
  }

  /**
   * Get incomplete months for an entity (for Invoice/Payment resume)
   */
  async getIncompleteMonths(entity: string): Promise<string[]> {
    const stmt = this.db!.prepare(`
      SELECT DISTINCT month_identifier
      FROM sync_batches
      WHERE entity_type = ? 
        AND sync_mode = 'first_sync'
        AND month_identifier IS NOT NULL
        AND status NOT IN ('COMPLETED', 'API_SUCCESS')
      ORDER BY month_identifier ASC
    `);
    const rows = stmt.all(entity.toUpperCase()) as Array<{ month_identifier: string }>;
    return rows.map(r => r.month_identifier).filter(Boolean);
  }

  // === Dashboard Query Methods ===
  async getDashboardStats(): Promise<{
    totalCustomers: number;
    totalVouchers: number;
    invoiceCount: number;
    receiptCount: number;
    jvCount: number;
    lastSyncTime: string | null;
  }> {
    const customerStmt = this.db!.prepare(`SELECT COUNT(*) as count FROM customers`);
    const customerCount = (customerStmt.get() as { count: number }).count;

    const voucherStmt = this.db!.prepare(`SELECT COUNT(*) as count FROM vouchers`);
    const voucherCount = (voucherStmt.get() as { count: number }).count;

    const invoiceStmt = this.db!.prepare(`SELECT COUNT(*) as count FROM vouchers WHERE voucher_type IN ('sales', 'credit_note')`);
    const invoiceCount = (invoiceStmt.get() as { count: number }).count;

    const receiptStmt = this.db!.prepare(`SELECT COUNT(*) as count FROM vouchers WHERE voucher_type = 'receipt'`);
    const receiptCount = (receiptStmt.get() as { count: number }).count;

    const jvStmt = this.db!.prepare(`SELECT COUNT(*) as count FROM vouchers WHERE voucher_type = 'journal'`);
    const jvCount = (jvStmt.get() as { count: number }).count;

    const lastSyncStmt = this.db!.prepare(`SELECT MAX(completed_at) as last_sync FROM sync_history WHERE status = 'SUCCESS'`);
    const lastSync = (lastSyncStmt.get() as { last_sync: string | null }).last_sync;

    return {
      totalCustomers: customerCount,
      totalVouchers: voucherCount,
      invoiceCount,
      receiptCount,
      jvCount,
      lastSyncTime: lastSync
    };
  }

  async getCustomers(limit: number = 100, offset: number = 0, search?: string): Promise<CustomerData[]> {
    let query = `SELECT * FROM customers WHERE 1=1`;
    const params: any[] = [];

    if (search) {
      query += ` AND (ledger_name LIKE ? OR email LIKE ? OR phone LIKE ? OR mobile LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    query += ` ORDER BY ledger_name ASC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const stmt = this.db!.prepare(query);
    return stmt.all(...params) as CustomerData[];
  }

  /**
   * Get all customers for building in-memory map (no limit)
   * Returns only ledger_name and tally_master_id for efficiency
   */
  async getAllCustomersForMap(): Promise<Array<{ ledger_name: string; tally_master_id: string }>> {
    const stmt = this.db!.prepare(`
      SELECT ledger_name, tally_master_id 
      FROM customers 
      WHERE ledger_name IS NOT NULL AND tally_master_id IS NOT NULL
    `);
    return stmt.all() as Array<{ ledger_name: string; tally_master_id: string }>;
  }

  async getVouchers(limit: number = 100, offset: number = 0, search?: string, voucherType?: string): Promise<VoucherData[]> {
    let query = `SELECT * FROM vouchers WHERE 1=1`;
    const params: any[] = [];

    if (voucherType) {
      if (voucherType === 'invoice') {
        query += ` AND voucher_type IN ('sales', 'credit_note')`;
      } else {
        query += ` AND voucher_type = ?`;
        params.push(voucherType);
      }
    }

    if (search) {
      query += ` AND (voucher_number LIKE ? OR party_ledger_name LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }

    query += ` ORDER BY voucher_date DESC, CAST(tally_alter_id AS INTEGER) DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const stmt = this.db!.prepare(query);
    return stmt.all(...params) as VoucherData[];
  }

  async getSyncHistoryWithBatches(limit: number = 50): Promise<any[]> {
    const stmt = this.db!.prepare(`
      SELECT sh.*, 
             (SELECT COUNT(*) FROM sync_batches WHERE sync_run_id = sh.id) as batch_count
      FROM sync_history sh
      ORDER BY sh.started_at DESC
      LIMIT ?
    `);
    const rows = stmt.all(limit) as any[];

    // Get batches for each sync run
    for (const row of rows) {
      const batches = await this.getSyncBatchesByRunId(row.id);
      row.batches = batches;
      if (row.summary) {
        try {
          row.summary = JSON.parse(row.summary);
        } catch { }
      }
    }

    return rows;
  }

  // === Sync Logs Methods ===

  /**
   * Create a sync log entry
   */
  async createSyncLog(
    companyId: number,
    syncType: string,
    entityType: string,
    status: string,
    message?: string,
    recordsCount: number = 0,
    durationMs?: number,
    errorStack?: string,
    startDate?: string,
    endDate?: string
  ): Promise<number> {
    const stmt = this.db!.prepare(`
      INSERT INTO sync_logs (
        company_id, sync_type, entity_type, status, message,
        records_count, duration_ms, error_stack, start_date, end_date, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    const result = stmt.run(
      companyId,
      syncType,
      entityType,
      status,
      message || null,
      recordsCount,
      durationMs || null,
      errorStack || null,
      startDate || null,
      endDate || null
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Get sync logs for a company
   */
  async getSyncLogs(
    companyId: number,
    limit: number = 50,
    entityType?: string,
    status?: string
  ): Promise<any[]> {
    let query = `
      SELECT * FROM sync_logs 
      WHERE company_id = ?
    `;
    const params: any[] = [companyId];

    if (entityType) {
      query += ` AND entity_type = ?`;
      params.push(entityType);
    }

    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }

    query += ` ORDER BY timestamp DESC LIMIT ?`;
    params.push(limit);

    const stmt = this.db!.prepare(query);
    return stmt.all(...params) as any[];
  }

  /**
   * Get recent sync logs (last N entries)
   * Returns data from sync_history table formatted for RecentLogs component
   */
  async getRecentSyncLogs(limit: number = 20): Promise<any[]> {
    const stmt = this.db!.prepare(`
      SELECT 
        id,
        sync_type,
        entity_type,
        status,
        message,
        entity_count as records_count,
        started_at as timestamp,
        completed_at
      FROM sync_history
      WHERE status IN ('SUCCESS', 'FAILED', 'PARTIAL', 'STARTED')
      ORDER BY started_at DESC
      LIMIT ?
    `);
    const rows = stmt.all(limit) as any[];
    
    // Format the data for the component
    return rows.map(row => ({
      id: row.id,
      sync_type: row.sync_type,
      entity_type: row.entity_type,
      status: row.status,
      message: row.message || (row.completed_at ? 'Completed' : 'In Progress'),
      records_count: row.records_count || 0,
      timestamp: row.completed_at || row.timestamp // Use completed_at if available, otherwise started_at
    }));
  }

  /**
   * Update last sync date for a company and entity
   */
  async updateLastSyncDate(
    companyId: number,
    entityType: string,
    syncDate: string,
    recordsSynced: number = 0
  ): Promise<void> {
    const stmt = this.db!.prepare(`
      INSERT OR REPLACE INTO last_sync_dates 
      (company_id, entity_type, last_sync_date, last_sync_timestamp, records_synced)
      VALUES (?, ?, ?, datetime('now'), ?)
    `);
    stmt.run(companyId, entityType, syncDate, recordsSynced);
  }

  /**
   * Get last sync date for a company and entity
   */
  async getLastSyncDate(companyId: number, entityType: string): Promise<string | null> {
    const stmt = this.db!.prepare(`
      SELECT last_sync_date FROM last_sync_dates 
      WHERE company_id = ? AND entity_type = ?
    `);
    const row = stmt.get(companyId, entityType) as any;
    return row?.last_sync_date || null;
  }

  /**
   * Get all last sync dates for a company
   */
  async getAllLastSyncDates(companyId: number): Promise<any[]> {
    const stmt = this.db!.prepare(`
      SELECT * FROM last_sync_dates 
      WHERE company_id = ?
      ORDER BY entity_type
    `);
    return stmt.all(companyId) as any[];
  }

  // === Database Dump and Restore ===

  /**
   * Dump current database to backend
   */
  async dumpDatabaseToBackend(billerId: string, organizationUuid: string): Promise<boolean> {
    try {
      if (!this.db || !fs.existsSync(this.dbPath)) {
        this.log('ERROR', 'Database file does not exist for dump', { dbPath: this.dbPath });
        return false;
      }

      // Close database connection before copying
      this.closeDatabase();

      // Read database file
      const dbBuffer = fs.readFileSync(this.dbPath);

      // Upload to backend
      const apiUrl = await getApiUrl(this);
      const profile = await this.getProfile();
      const apiKey = profile?.apikey || '7061797A6F72726F74616C6C79';

      const formData = new FormData();
      formData.append('file', dbBuffer, {
        filename: `tally-sync_${organizationUuid}.db`,
        contentType: 'application/x-sqlite3'
      });

      const response = await axios.post(
        `${apiUrl}/billers/tally/upload-database`,
        formData,
        {
          headers: {
            'API-KEY': apiKey,
            'Content-Type': 'multipart/form-data',
            'X-Biller-Id': billerId,
            'X-Organization-Uuid': organizationUuid
          },
          timeout: 60000 // 60 seconds for large files
        }
      );

      // Reopen database connection
      this.init();

      if (response.data?.success) {
        this.log('INFO', 'Database dumped to backend successfully', {
          billerId,
          organizationUuid,
          size: dbBuffer.length
        });
        return true;
      }

      return false;
    } catch (error: any) {
      // Reopen database connection even on error
      if (!this.db) {
        this.init();
      }
      this.log('ERROR', 'Failed to dump database to backend', {
        error: error.message,
        billerId,
        organizationUuid
      });
      return false;
    }
  }

  /**
   * Restore database from backend
   */
  async restoreDatabaseFromBackend(billerId: string, organizationUuid: string): Promise<boolean> {
    try {
      const apiUrl = await getApiUrl(this);
      const profile = await this.getProfile();
      const apiKey = profile?.apikey || '7061797A6F72726F74616C6C79';

      // Download database from backend
      const response = await axios.get(
        `${apiUrl}/billers/tally/download-database`,
        {
          params: {
            biller_id: billerId,
            organization_uuid: organizationUuid
          },
          headers: {
            'API-KEY': apiKey
          },
          responseType: 'arraybuffer',
          timeout: 60000
        }
      );

      if (response.status === 200 && response.data) {
        // Close current database
        this.closeDatabase();

        // Write downloaded database to file
        const dbPath = path.join(app.getPath('userData'), `tally-sync_${organizationUuid}.db`);
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(dbPath, Buffer.from(response.data));

        // Initialize with the restored database
        this.initializeDatabase(organizationUuid);

        this.log('INFO', 'Database restored from backend successfully', {
          billerId,
          organizationUuid,
          size: response.data.byteLength
        });
        return true;
      }

      return false;
    } catch (error: any) {
      if (error.response?.status === 404) {
        // Database doesn't exist in backend - this is OK for first-time sync
        this.log('INFO', 'Database not found in backend (first sync)', {
          billerId,
          organizationUuid
        });
        return false;
      }

      this.log('ERROR', 'Failed to restore database from backend', {
        error: error.message,
        billerId,
        organizationUuid
      });
      return false;
    }
  }

  /**
   * Check if database exists in backend
   */
  async databaseExistsInBackend(billerId: string, organizationUuid: string): Promise<boolean> {
    try {
      const apiUrl = await getApiUrl(this);
      const profile = await this.getProfile();
      const apiKey = profile?.apikey || '7061797A6F72726F74616C6C79';

      const response = await axios.head(
        `${apiUrl}/billers/tally/download-database`,
        {
          params: {
            biller_id: billerId,
            organization_uuid: organizationUuid
          },
          headers: {
            'API-KEY': apiKey
          },
          timeout: 10000
        }
      );

      return response.status === 200;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return false;
      }
      this.log('ERROR', 'Error checking database existence in backend', {
        error: error.message,
        billerId,
        organizationUuid
      });
      return false;
    }
  }

  /**
   * Get active sync processes
   */
  async getActiveSyncProcesses(): Promise<Array<{
    id: number;
    entity_type: string;
    sync_type: string;
    status: string;
    started_at: string;
    current_step?: string;
    progress?: {
      current: number;
      total: number;
    };
  }>> {
    try {
      // Only get sync_history records that are truly in progress
      // Exclude records that have completed_at set (they're done)
      const stmt = this.db!.prepare(`
        SELECT sh.*, 
               (SELECT COUNT(*) FROM sync_batches WHERE sync_run_id = sh.id AND status IN ('COMPLETED', 'API_SUCCESS')) as completed_batches,
               (SELECT COUNT(*) FROM sync_batches WHERE sync_run_id = sh.id) as total_batches
        FROM sync_history sh
        WHERE sh.status IN ('STARTED', 'IN_PROGRESS')
          AND sh.completed_at IS NULL
        ORDER BY sh.started_at DESC
      `);
      const active = stmt.all() as any[];
      
      // Format the results
      return active.map((sync: any) => ({
        id: sync.id,
        entity_type: sync.entity_type,
        sync_type: sync.sync_type,
        status: sync.status,
        started_at: sync.started_at,
        current_step: sync.message || 'Processing...',
        progress: sync.total_batches > 0 ? {
          current: sync.completed_batches || 0,
          total: sync.total_batches || 0
        } : undefined
      }));
    } catch (error: any) {
      this.log('ERROR', 'Error getting active sync processes', { error: error.message });
      return [];
    }
  }

  /**
   * Get entity sync information (last 2 syncs for each entity + total counts)
   */
  async getEntitySyncInfo(): Promise<{
    ledger: {
      lastSyncTime: string | null;
      lastSyncCount: number;
      previousSyncTime: string | null;
      previousSyncCount: number;
      totalCount: number;
    };
    invoice: {
      lastSyncTime: string | null;
      lastSyncCount: number;
      previousSyncTime: string | null;
      previousSyncCount: number;
      totalCount: number;
    };
    payment: {
      lastSyncTime: string | null;
      lastSyncCount: number;
      previousSyncTime: string | null;
      previousSyncCount: number;
      totalCount: number;
    };
  }> {
    // Get last 2 successful syncs for each entity - include PARTIAL status
    const ledgerStmt = this.db!.prepare(`
      SELECT completed_at, entity_count 
      FROM sync_history 
      WHERE entity_type = 'CUSTOMER' 
        AND status IN ('SUCCESS', 'PARTIAL')
        AND completed_at IS NOT NULL
        AND entity_count > 0
      ORDER BY completed_at DESC 
      LIMIT 2
    `);
    const ledgerSyncs = ledgerStmt.all() as Array<{ completed_at: string; entity_count: number }>;

    // Get total count of all synced customers
    const ledgerTotalStmt = this.db!.prepare(`
      SELECT COALESCE(SUM(entity_count), 0) as total
      FROM sync_history 
      WHERE entity_type = 'CUSTOMER' 
        AND status IN ('SUCCESS', 'PARTIAL')
        AND entity_count > 0
    `);
    const ledgerTotal = (ledgerTotalStmt.get() as { total: number })?.total || 0;

    const invoiceStmt = this.db!.prepare(`
      SELECT completed_at, entity_count 
      FROM sync_history 
      WHERE entity_type = 'INVOICE' 
        AND status IN ('SUCCESS', 'PARTIAL')
        AND completed_at IS NOT NULL
        AND entity_count > 0
      ORDER BY completed_at DESC 
      LIMIT 2
    `);
    const invoiceSyncs = invoiceStmt.all() as Array<{ completed_at: string; entity_count: number }>;

    // Get total count of all synced invoices
    const invoiceTotalStmt = this.db!.prepare(`
      SELECT COALESCE(SUM(entity_count), 0) as total
      FROM sync_history 
      WHERE entity_type = 'INVOICE' 
        AND status IN ('SUCCESS', 'PARTIAL')
        AND entity_count > 0
    `);
    const invoiceTotal = (invoiceTotalStmt.get() as { total: number })?.total || 0;

    const paymentStmt = this.db!.prepare(`
      SELECT completed_at, entity_count 
      FROM sync_history 
      WHERE entity_type = 'PAYMENT' 
        AND status IN ('SUCCESS', 'PARTIAL')
        AND completed_at IS NOT NULL
        AND entity_count > 0
      ORDER BY completed_at DESC 
      LIMIT 2
    `);
    const paymentSyncs = paymentStmt.all() as Array<{ completed_at: string; entity_count: number }>;

    // Get total count of all synced payments
    const paymentTotalStmt = this.db!.prepare(`
      SELECT COALESCE(SUM(entity_count), 0) as total
      FROM sync_history 
      WHERE entity_type = 'PAYMENT' 
        AND status IN ('SUCCESS', 'PARTIAL')
        AND entity_count > 0
    `);
    const paymentTotal = (paymentTotalStmt.get() as { total: number })?.total || 0;

    return {
      ledger: {
        lastSyncTime: ledgerSyncs[0]?.completed_at || null,
        lastSyncCount: ledgerSyncs[0]?.entity_count || 0,
        previousSyncTime: ledgerSyncs[1]?.completed_at || null,
        previousSyncCount: ledgerSyncs[1]?.entity_count || 0,
        totalCount: ledgerTotal,
      },
      invoice: {
        lastSyncTime: invoiceSyncs[0]?.completed_at || null,
        lastSyncCount: invoiceSyncs[0]?.entity_count || 0,
        previousSyncTime: invoiceSyncs[1]?.completed_at || null,
        previousSyncCount: invoiceSyncs[1]?.entity_count || 0,
        totalCount: invoiceTotal,
      },
      payment: {
        lastSyncTime: paymentSyncs[0]?.completed_at || null,
        lastSyncCount: paymentSyncs[0]?.entity_count || 0,
        previousSyncTime: paymentSyncs[1]?.completed_at || null,
        previousSyncCount: paymentSyncs[1]?.entity_count || 0,
        totalCount: paymentTotal,
      },
    };
  }

  close(): void {
    this.db?.close();
  }
}