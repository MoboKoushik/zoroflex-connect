import { SyncManager } from './sync-manager';
import { ConfigManager } from '../config/config-manager';
import { DataType } from '../../types';

export class RealtimeSyncService {
  private syncManager: SyncManager;
  private configManager: ConfigManager;
  private intervals: Map<DataType, NodeJS.Timeout> = new Map();
  private isRunning: boolean = false;

  constructor(syncManager: SyncManager, configManager: ConfigManager) {
    this.syncManager = syncManager;
    this.configManager = configManager;
  }

  /**
   * Start real-time sync for all data types
   */
  start(): void {
    if (this.isRunning) {
      console.log('Realtime sync is already running');
      return;
    }

    const config = this.configManager.getConfig();
    if (!config.enabledSyncTypes.realtime) {
      console.log('Realtime sync is disabled');
      return;
    }

    const interval = config.syncIntervals.realtime;
    const dataTypes = [DataType.VOUCHERS, DataType.LEDGERS, DataType.INVENTORY];

    console.log(`Starting realtime sync with interval: ${interval}ms`);

    for (const dataType of dataTypes) {
      const timeoutId = setInterval(async () => {
        if (!this.syncManager.isSyncInProgress(dataType)) {
          try {
            await this.syncManager.syncDataType(dataType);
          } catch (error) {
            console.error(`Realtime sync error for ${dataType}:`, error);
          }
        }
      }, interval);

      this.intervals.set(dataType, timeoutId);
    }

    this.isRunning = true;
  }

  /**
   * Stop real-time sync
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    console.log('Stopping realtime sync...');

    for (const [dataType, interval] of this.intervals.entries()) {
      clearInterval(interval);
      this.intervals.delete(dataType);
    }

    this.isRunning = false;
  }

  /**
   * Restart real-time sync (useful when config changes)
   */
  restart(): void {
    this.stop();
    this.start();
  }

  /**
   * Check if real-time sync is running
   */
  isActive(): boolean {
    return this.isRunning;
  }
}

