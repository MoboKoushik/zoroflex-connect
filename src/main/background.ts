import { TallyClient } from '../services/tally/tally-client';
import { TallyDataFetcher } from '../services/tally/data-fetchers';
import { NestApiClient } from '../services/api/api-client';
import { getDatabaseManager } from '../services/database/db';
import { HistoryService } from '../services/database/history';
import { SyncLogService } from '../services/database/sync-log';
import { DataChangeService } from '../services/database/data-change';
import { ConfigManager } from '../services/config/config-manager';
import { SyncManager } from '../services/sync/sync-manager';
import { RealtimeSyncService } from '../services/sync/realtime-sync';
import { ScheduledSyncService } from '../services/sync/scheduled-sync';

let syncManager: SyncManager | null = null;
let realtimeSync: RealtimeSyncService | null = null;
let scheduledSync: ScheduledSyncService | null = null;
let configManager: ConfigManager | null = null;

export function initializeBackgroundServices(): void {
  try {
    console.log('Initializing background services...');

    // Initialize database
    const dbManager = getDatabaseManager();
    const historyService = new HistoryService(dbManager);
    const syncLogService = new SyncLogService(dbManager);
    const dataChangeService = new DataChangeService(dbManager);

    // Initialize configuration
    configManager = new ConfigManager();
    const config = configManager.getConfig();

    // Initialize Tally client
    const tallyClient = new TallyClient(config.tallyUrl);
    const tallyFetcher = new TallyDataFetcher(tallyClient);

    // Initialize Nest API client
    const apiClient = new NestApiClient(config.nestBackendUrl, config.apiKey);

    // Initialize sync manager
    syncManager = new SyncManager(
      tallyFetcher,
      apiClient,
      historyService,
      syncLogService,
      dataChangeService,
      configManager
    );

    // Initialize sync services
    realtimeSync = new RealtimeSyncService(syncManager, configManager);
    scheduledSync = new ScheduledSyncService(syncManager, configManager);

    // Start sync services if enabled
    if (config.enabledSyncTypes.realtime) {
      realtimeSync.start();
    }

    if (config.enabledSyncTypes.scheduled) {
      scheduledSync.start();
    }

    console.log('Background services initialized successfully');
  } catch (error) {
    console.error('Failed to initialize background services:', error);
  }
}

export function getSyncManager(): SyncManager | null {
  return syncManager;
}

export function getRealtimeSync(): RealtimeSyncService | null {
  return realtimeSync;
}

export function getScheduledSync(): ScheduledSyncService | null {
  return scheduledSync;
}

export function getConfigManager(): ConfigManager | null {
  return configManager;
}

export function restartSyncServices(): void {
  if (realtimeSync) {
    realtimeSync.restart();
  }
  if (scheduledSync) {
    scheduledSync.restart();
  }
}

export function stopSyncServices(): void {
  if (realtimeSync) {
    realtimeSync.stop();
  }
  if (scheduledSync) {
    scheduledSync.stop();
  }
}

