export enum DataType {
  VOUCHERS = 'vouchers',
  LEDGERS = 'ledgers',
  INVENTORY = 'inventory'
}

export enum SyncStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  IN_PROGRESS = 'in_progress'
}

export enum ChangeType {
  INSERT = 'INSERT',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE'
}

export interface SyncConfig {
  nestBackendUrl: string;
  apiKey: string;
  tallyUrl: string;
  syncIntervals: {
    realtime: number; // milliseconds
    scheduled: string; // cron expression
  };
  enabledSyncTypes: {
    realtime: boolean;
    scheduled: boolean;
    manual: boolean;
  };
}

export interface SyncHistory {
  id?: number;
  data_type: DataType;
  last_sync_timestamp: Date | string;
  record_count: number;
  status: SyncStatus;
}

export interface SyncLog {
  id?: number;
  sync_id: string;
  data_type: DataType;
  timestamp: Date | string;
  status: SyncStatus;
  error_message?: string;
  duration_ms: number;
}

export interface DataChange {
  id?: number;
  data_type: DataType;
  record_id: string;
  change_type: ChangeType;
  before_data?: string; // JSON string
  after_data?: string; // JSON string
  timestamp: Date | string;
}

