import * as cron from 'node-cron';
import { SyncManager } from './sync-manager';
import { ConfigManager } from '../config/config-manager';
import { DataType } from '../../types';

export class ScheduledSyncService {
  private syncManager: SyncManager;
  private configManager: ConfigManager;
  private cronJob: cron.ScheduledTask | null = null;
  private isRunning: boolean = false;

  constructor(syncManager: SyncManager, configManager: ConfigManager) {
    this.syncManager = syncManager;
    this.configManager = configManager;
  }

  /**
   * Start scheduled sync
   */
  start(): void {
    if (this.isRunning) {
      console.log('Scheduled sync is already running');
      return;
    }

    const config = this.configManager.getConfig();
    if (!config.enabledSyncTypes.scheduled) {
      console.log('Scheduled sync is disabled');
      return;
    }

    const cronExpression = config.syncIntervals.scheduled;
    
    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      console.error(`Invalid cron expression: ${cronExpression}`);
      return;
    }

    console.log(`Starting scheduled sync with cron: ${cronExpression}`);

    this.cronJob = cron.schedule(cronExpression, async () => {
      try {
        console.log('Running scheduled sync...');
        await this.syncManager.syncAll();
      } catch (error) {
        console.error('Scheduled sync error:', error);
      }
    }, {
      scheduled: true,
      timezone: 'Asia/Dhaka', // Adjust timezone as needed
    });

    this.isRunning = true;
  }

  /**
   * Stop scheduled sync
   */
  stop(): void {
    if (!this.isRunning || !this.cronJob) {
      return;
    }

    console.log('Stopping scheduled sync...');
    this.cronJob.stop();
    this.cronJob = null;
    this.isRunning = false;
  }

  /**
   * Restart scheduled sync (useful when config changes)
   */
  restart(): void {
    this.stop();
    this.start();
  }

  /**
   * Check if scheduled sync is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Trigger manual sync
   */
  async triggerManual(): Promise<void> {
    const config = this.configManager.getConfig();
    if (!config.enabledSyncTypes.manual) {
      throw new Error('Manual sync is disabled');
    }

    console.log('Triggering manual sync...');
    await this.syncManager.syncAll();
  }
}

