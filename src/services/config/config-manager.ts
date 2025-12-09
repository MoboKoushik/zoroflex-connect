import Store from 'electron-store';
import { SyncConfig } from '../../types';

const defaultConfig: SyncConfig = {
  nestBackendUrl: '',
  apiKey: '',
  tallyUrl: 'http://localhost:9000',
  syncIntervals: {
    realtime: 60000, // 1 minute
    scheduled: '*/15 * * * *', // Every 15 minutes
  },
  enabledSyncTypes: {
    realtime: true,
    scheduled: true,
    manual: true,
  },
};

export class ConfigManager {
  private store: Store<SyncConfig>;

  constructor() {
    this.store = new Store<SyncConfig>({
      name: 'tally-sync-config',
      defaults: defaultConfig,
    });
  }

  /**
   * Get full configuration
   */
  getConfig(): SyncConfig {
    return this.store.store;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SyncConfig>): void {
    this.store.set(config);
  }

  /**
   * Get Nest backend URL
   */
  getNestBackendUrl(): string {
    return this.store.get('nestBackendUrl', '');
  }

  /**
   * Set Nest backend URL
   */
  setNestBackendUrl(url: string): void {
    this.store.set('nestBackendUrl', url);
  }

  /**
   * Get API key
   */
  getApiKey(): string {
    return this.store.get('apiKey', '');
  }

  /**
   * Set API key
   */
  setApiKey(apiKey: string): void {
    this.store.set('apiKey', apiKey);
  }

  /**
   * Get Tally URL
   */
  getTallyUrl(): string {
    return this.store.get('tallyUrl', 'http://localhost:9000');
  }

  /**
   * Set Tally URL
   */
  setTallyUrl(url: string): void {
    this.store.set('tallyUrl', url);
  }

  /**
   * Get sync intervals
   */
  getSyncIntervals(): SyncConfig['syncIntervals'] {
    return this.store.get('syncIntervals', defaultConfig.syncIntervals);
  }

  /**
   * Set sync intervals
   */
  setSyncIntervals(intervals: SyncConfig['syncIntervals']): void {
    this.store.set('syncIntervals', intervals);
  }

  /**
   * Get enabled sync types
   */
  getEnabledSyncTypes(): SyncConfig['enabledSyncTypes'] {
    return this.store.get('enabledSyncTypes', defaultConfig.enabledSyncTypes);
  }

  /**
   * Set enabled sync types
   */
  setEnabledSyncTypes(types: SyncConfig['enabledSyncTypes']): void {
    this.store.set('enabledSyncTypes', types);
  }

  /**
   * Reset to default configuration
   */
  reset(): void {
    this.store.clear();
    this.store.set(defaultConfig);
  }
}

