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

export interface VoucherSummaryItem {
  totalAttempted: number;
  successCount: number;
  failedCount: number;
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
  started_at: string;
  completed_at: string | null;
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

      -- tally_voucher_logs table removed - logging handled by backend

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- sync_record_details table removed - detailed logging handled by backend

      CREATE INDEX IF NOT EXISTS idx_api_logs_created_at ON api_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_api_logs_status ON api_logs(status);
      -- Indexes for removed tables removed

      -- Customer and voucher tables removed - data now stored in backend

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
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        FOREIGN KEY (sync_run_id) REFERENCES sync_history(id)
      );

      CREATE INDEX IF NOT EXISTS idx_sync_batches_sync_run_id ON sync_batches(sync_run_id);
      CREATE INDEX IF NOT EXISTS idx_sync_batches_status ON sync_batches(status);

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
  // Updated for thin client: tally_voucher_logs table removed - logging handled by backend
  // Return empty array as voucher logs are now stored in backend
  async getTallyVoucherLogs(filters?: {
    voucherType?: string;
    status?: 'SUCCESS' | 'FAILED';
    fromDate?: string;
    toDate?: string;
    search?: string;
    limit?: number;
  }): Promise<TallyVoucherLogRow[]> {
    // tally_voucher_logs table removed in thin client architecture
    // Voucher logs are now stored and managed by backend
    // Return empty array - UI should fetch from backend API if needed
    console.log('getTallyVoucherLogs: Voucher logs now handled by backend (tally_voucher_logs table removed)');
    return [];
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
  async clearLogs(logType: 'system' | 'api'): Promise<void> {
    if (logType === 'system') {
      this.db!.exec('DELETE FROM logs');
    } else if (logType === 'api') {
      this.db!.exec('DELETE FROM api_logs');
    }
  }

  // === Sync Record Details ===
  // Removed - detailed logging now handled by backend

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
  // Updated for thin client: Only use sync_history table (tally_voucher_logs removed)
  async getVoucherSyncSummary(): Promise<Record<string, VoucherSummaryItem>> {
    // Get all syncs and find VOUCHER (case-insensitive)
    const stmt = this.db!.prepare(`
      SELECT * FROM sync_history
      ORDER BY started_at DESC
    `);
    const allSyncs = stmt.all() as SyncHistoryRow[];

    // Find latest VOUCHER sync (case-insensitive)
    const latestVoucherSync = allSyncs.find(s => s.entity_type.toUpperCase() === 'VOUCHER');

    console.log('Latest voucher sync:', latestVoucherSync ? { id: latestVoucherSync.id, status: latestVoucherSync.status, count: latestVoucherSync.entity_count } : 'none');

    const result: Record<string, VoucherSummaryItem> = {};

    // Use sync_history summary data only (tally_voucher_logs table removed in thin client architecture)
    if (latestVoucherSync) {
      // Fallback to summary JSON from sync_history
      if (latestVoucherSync.summary) {
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
      } else {
        // No summary JSON, but we have counts - show aggregate
        const failedCountFallback = latestVoucherSync.failed_count || 0;
        if (latestVoucherSync.entity_count > 0 || failedCountFallback > 0) {
          result['All Vouchers'] = {
            totalAttempted: (latestVoucherSync.entity_count || 0) + failedCountFallback,
            successCount: latestVoucherSync.entity_count || 0,
            failedCount: failedCountFallback
          };
        }
      }
    }

    // console.log('Final voucher summary result:', result);
    return result;
  }

  // === Customer Operations ===
  // Removed - customer data now stored in backend

  // === Voucher Operations ===
  // Removed - voucher data now stored in backend

  // === Batch Tracking Operations ===
  async createSyncBatch(
    runId: number,
    entityType: string,
    batchNumber: number,
    batchSize: number,
    fromAlterId: string,
    toAlterId: string
  ): Promise<number> {
    const stmt = this.db!.prepare(`
      INSERT INTO sync_batches (sync_run_id, entity_type, batch_number, batch_size, from_alter_id, to_alter_id, status)
      VALUES (?, ?, ?, ?, ?, ?, 'FETCHED')
    `);
    const info = stmt.run(runId, entityType, batchNumber, batchSize, fromAlterId, toAlterId);
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

  // === Dashboard Query Methods ===
  // Removed - customer/voucher queries now handled by backend APIs
  // Use backend pagination APIs: GET /customers and GET /vouchers

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

  close(): void {
    this.db?.close();
  }
}