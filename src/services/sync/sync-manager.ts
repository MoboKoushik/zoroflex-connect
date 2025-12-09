import { TallyDataFetcher } from '../tally/data-fetchers';
import { NestApiClient } from '../api/api-client';
import { HistoryService } from '../database/history';
import { SyncLogService } from '../database/sync-log';
import { DataChangeService } from '../database/data-change';
import { ConfigManager } from '../config/config-manager';
import { DataType, SyncStatus, ChangeType } from '../../types';
import { v4 as uuidv4 } from 'uuid';

export class SyncManager {
  private tallyFetcher: TallyDataFetcher;
  private apiClient: NestApiClient;
  private historyService: HistoryService;
  private syncLogService: SyncLogService;
  private dataChangeService: DataChangeService;
  private configManager: ConfigManager;
  private isSyncing: Map<DataType, boolean> = new Map();

  constructor(
    tallyFetcher: TallyDataFetcher,
    apiClient: NestApiClient,
    historyService: HistoryService,
    syncLogService: SyncLogService,
    dataChangeService: DataChangeService,
    configManager: ConfigManager
  ) {
    this.tallyFetcher = tallyFetcher;
    this.apiClient = apiClient;
    this.historyService = historyService;
    this.syncLogService = syncLogService;
    this.dataChangeService = dataChangeService;
    this.configManager = configManager;
  }

  /**
   * Sync a specific data type
   */
  async syncDataType(dataType: DataType, syncId?: string): Promise<void> {
    // Prevent concurrent syncs of the same data type
    if (this.isSyncing.get(dataType)) {
      console.log(`Sync already in progress for ${dataType}`);
      return;
    }

    const syncIdToUse = syncId || uuidv4();
    const startTime = Date.now();
    this.isSyncing.set(dataType, true);

    try {
      console.log(`Starting sync for ${dataType}...`);

      // Get last sync timestamp
      const lastSync = this.historyService.getLastSyncTimestamp(dataType);
      const fromDate = lastSync || undefined;

      // Fetch data from Tally
      const data = await this.tallyFetcher.fetchData(dataType, fromDate);

      if (data.length === 0) {
        console.log(`No new data to sync for ${dataType}`);
        this.historyService.updateSyncHistory(dataType, 0, SyncStatus.SUCCESS);
        this.syncLogService.createLog(
          syncIdToUse,
          dataType,
          SyncStatus.SUCCESS,
          Date.now() - startTime
        );
        return;
      }

      // Record changes before syncing
      for (const record of data) {
        const recordId = this.getRecordId(record, dataType);
        this.dataChangeService.recordChange(
          dataType,
          recordId,
          ChangeType.INSERT,
          undefined,
          record
        );
      }

      // Sync to Nest backend
      await this.apiClient.syncData(dataType, data);

      // Update history
      this.historyService.updateSyncHistory(dataType, data.length, SyncStatus.SUCCESS);
      
      // Log success
      this.syncLogService.createLog(
        syncIdToUse,
        dataType,
        SyncStatus.SUCCESS,
        Date.now() - startTime
      );

      console.log(`Successfully synced ${data.length} records for ${dataType}`);
    } catch (error: any) {
      console.error(`Sync failed for ${dataType}:`, error);
      
      // Log failure
      this.syncLogService.createLog(
        syncIdToUse,
        dataType,
        SyncStatus.FAILED,
        Date.now() - startTime,
        error.message
      );

      // Update history with failure status
      this.historyService.updateSyncHistory(dataType, 0, SyncStatus.FAILED);
      
      throw error;
    } finally {
      this.isSyncing.set(dataType, false);
    }
  }

  /**
   * Sync all data types
   */
  async syncAll(syncId?: string): Promise<void> {
    const syncIdToUse = syncId || uuidv4();
    const dataTypes = [DataType.VOUCHERS, DataType.LEDGERS, DataType.INVENTORY];

    for (const dataType of dataTypes) {
      try {
        await this.syncDataType(dataType, syncIdToUse);
      } catch (error) {
        console.error(`Failed to sync ${dataType}:`, error);
        // Continue with other data types even if one fails
      }
    }
  }

  /**
   * Get record ID from record based on data type
   */
  private getRecordId(record: any, dataType: DataType): string {
    switch (dataType) {
      case DataType.VOUCHERS:
        return record.VOUCHERNUMBER || record.VOUCHERDATE || JSON.stringify(record);
      case DataType.LEDGERS:
        return record.NAME || JSON.stringify(record);
      case DataType.INVENTORY:
        return record.STOCKITEMNAME || JSON.stringify(record);
      default:
        return JSON.stringify(record);
    }
  }

  /**
   * Check if sync is in progress for a data type
   */
  isSyncInProgress(dataType: DataType): boolean {
    return this.isSyncing.get(dataType) || false;
  }

  /**
   * Get sync status for all data types
   */
  getSyncStatus(): Map<DataType, boolean> {
    return new Map(this.isSyncing);
  }
}

