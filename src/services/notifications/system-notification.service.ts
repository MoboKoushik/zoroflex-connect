// src/services/notifications/system-notification.service.ts
import { Notification, app } from 'electron';
import { DatabaseService } from '../database/database.service';
import * as path from 'path';

export interface NotificationOptions {
  title: string;
  body: string;
  sound?: boolean;
  persistent?: boolean;
  onClick?: () => void;
}

export class SystemNotificationService {
  private dbService: DatabaseService;
  private notificationsEnabled: boolean = true;

  constructor(dbService: DatabaseService) {
    this.dbService = dbService;
    this.loadSettings();
  }

  /**
   * Load notification settings
   */
  private async loadSettings(): Promise<void> {
    const showNotifications = await this.dbService.getSetting('showNotifications');
    this.notificationsEnabled = showNotifications !== 'false';
  }

  /**
   * Check if notifications are enabled
   */
  async areNotificationsEnabled(): Promise<boolean> {
    await this.loadSettings();
    return this.notificationsEnabled;
  }

  /**
   * Show system notification
   */
  async showNotification(options: NotificationOptions): Promise<void> {
    // Reload settings to get latest value
    await this.loadSettings();

    if (!this.notificationsEnabled) {
      return;
    }

    // Check if system supports notifications
    if (!Notification.isSupported()) {
      console.warn('System notifications are not supported on this platform');
      return;
    }

    try {
      const notification = new Notification({
        title: options.title,
        body: options.body,
        silent: !options.sound,
        icon: app.isPackaged
          ? path.join(process.resourcesPath, 'assets/icon.png')
          : path.join(__dirname, '../../../assets/icon.png')
      });

      if (options.onClick) {
        notification.on('click', () => {
          options.onClick?.();
        });
      }

      notification.show();

      // Log notification
      this.dbService.log('INFO', 'System notification shown', {
        title: options.title,
        body: options.body
      });
    } catch (error: any) {
      console.error('Error showing notification:', error);
      this.dbService.log('ERROR', 'Failed to show notification', {
        error: error.message
      });
    }
  }

  /**
   * Notify when Tally is not running
   */
  async notifyTallyOffline(port: number): Promise<void> {
    await this.showNotification({
      title: 'Tally Not Running',
      body: `Tally is not responding on port ${port}. Please start Tally to enable synchronization.`,
      sound: true,
      persistent: true
    });
  }

  /**
   * Notify when Tally comes back online
   */
  async notifyTallyOnline(port: number): Promise<void> {
    await this.showNotification({
      title: 'Tally Connected',
      body: `Tally is now running on port ${port}. Synchronization can proceed.`,
      sound: true
    });
  }

  /**
   * Notify when API is not available
   */
  async notifyApiOffline(): Promise<void> {
    await this.showNotification({
      title: 'API Not Available',
      body: 'Backend API is not responding. Sync operations will be queued until connection is restored.',
      sound: true,
      persistent: true
    });
  }

  /**
   * Notify when API comes back online
   */
  async notifyApiOnline(): Promise<void> {
    await this.showNotification({
      title: 'API Connected',
      body: 'Backend API is now available. Sync operations will resume.',
      sound: true
    });
  }

  /**
   * Notify sync success
   */
  async notifySyncSuccess(entityCount?: number): Promise<void> {
    const body = entityCount 
      ? `Sync completed successfully. ${entityCount} records processed.`
      : 'Sync completed successfully.';
    
    await this.showNotification({
      title: 'Sync Successful',
      body,
      sound: true
    });
  }

  /**
   * Notify sync failure
   */
  async notifySyncFailed(errorMessage: string): Promise<void> {
    await this.showNotification({
      title: 'Sync Failed',
      body: `Sync operation failed: ${errorMessage}`,
      sound: true,
      persistent: true
    });
  }
}
