// src/services/sync/fetch-to-tally/syncDeletedVouchers.service.ts
import axios from 'axios';
import { DatabaseService, UserProfile, DeletedVoucherData } from '../../database/database.service';
import { getApiUrl } from '../../config/api-url-helper';
import { getApiKey } from '../../config/api-key-helper';
import {
  fetchDeletedVouchersFromReport,
  fetchDeletedVouchersByAlterId,
  extractDeletedVouchersFromReport,
  parseDeletedVoucher,
  TallyDeletedVoucherRaw
} from '../../tally/batch-fetcher';

const ENTITY_TYPE = 'DELETED_VOUCHER';
const API_BATCH_SIZE = 100; // Max records per API call

/**
 * Sync deleted/cancelled vouchers from Tally
 *
 * Flow:
 * 1. Fetch deleted vouchers from Tally (ZorrofinDeletedVch report)
 * 2. Store in local deleted_vouchers_log table
 * 3. Send to backend API (staging table)
 * 4. Mark as synced
 *
 * @param profile User profile with API credentials
 * @param mode 'first' for initial sync, 'incremental' for delta sync
 * @param fromDate Start date (YYYY-MM-DD format) - used for first sync
 * @param toDate End date (YYYY-MM-DD format) - used for first sync
 * @param dbService Database service instance
 */
export async function syncDeletedVouchers(
  profile: UserProfile,
  mode: 'first' | 'incremental',
  fromDate: string,
  toDate: string,
  dbService?: DatabaseService
): Promise<{
  success: boolean;
  totalFetched: number;
  totalSynced: number;
  deleted: number;
  cancelled: number;
  byType: Record<string, { deleted: number; cancelled: number }>;
  error?: string;
}> {
  const db = dbService || new DatabaseService();

  try {
    db.log('INFO', `Starting deleted vouchers sync (mode: ${mode})`, {
      fromDate,
      toDate
    });

    // Log sync start
    const syncHistoryId = await db.logSyncStart('BACKGROUND', ENTITY_TYPE);

    let deletedVouchersRaw: TallyDeletedVoucherRaw[] = [];
    console.log('mode, fromDate, toDate===>', mode, fromDate, toDate)

    if (mode === 'first') {
      // First sync: fetch all deleted vouchers in date range
      const tallyFromDate = fromDate.replace(/-/g, '');
      const tallyToDate = toDate.replace(/-/g, '');

      db.log('INFO', `Fetching deleted vouchers from Tally (${tallyFromDate} to ${tallyToDate})`);

      const response = await fetchDeletedVouchersFromReport(tallyFromDate, tallyToDate, '0');
      deletedVouchersRaw = extractDeletedVouchersFromReport(response);

    } else {
      // Incremental sync: fetch only new deleted vouchers since last sync
      const lastAlterId = await db.getDeleteSyncAlterId();
      console.log('lastAlterId===>', lastAlterId)
      const tallyFromDate = fromDate?.replace(/-/g, '');
      const tallyToDate = toDate?.replace(/-/g, '');

      db.log('INFO', `Fetching deleted vouchers from Tally (${tallyFromDate} to ${tallyToDate})`);

      const response = await fetchDeletedVouchersFromReport(tallyFromDate, tallyToDate, '0');
      deletedVouchersRaw = extractDeletedVouchersFromReport(response);
      console.log('deletedVouchersRaw==>', deletedVouchersRaw)
    }

    db.log('INFO', `Fetched ${deletedVouchersRaw.length} deleted/cancelled vouchers from Tally`);

    if (deletedVouchersRaw.length === 0) {
      db.log('INFO', 'No new deleted vouchers to sync');
      await db.logSyncEnd(syncHistoryId, 'SUCCESS', 0, 0, 'No new deleted vouchers');
      return {
        success: true,
        totalFetched: 0,
        totalSynced: 0,
        deleted: 0,
        cancelled: 0,
        byType: {}
      };
    }

    // Parse and prepare data
    const parsedVouchers: DeletedVoucherData[] = deletedVouchersRaw.map(raw => {
      const parsed = parseDeletedVoucher(raw);
      return {
        company_guid: parsed.company_guid,
        company_name: parsed.company_name,
        voucher_guid: parsed.voucher_guid,
        tally_master_id: parsed.tally_master_id,
        voucher_type: parsed.voucher_type,
        deletion_action: parsed.deletion_action
      };
    });

    // Store in local database
    db.log('INFO', `Storing ${parsedVouchers.length} deleted vouchers in local database`);
    const storeResult = await db.saveDeletedVouchersBatch(parsedVouchers);
    db.log('INFO', `Stored deleted vouchers: ${storeResult.inserted} new, ${storeResult.updated} updated`);

    // Update local voucher flags (soft delete)
    for (const voucher of parsedVouchers) {
      await db.updateVoucherDeleteFlags(voucher.voucher_guid, voucher.deletion_action);
    }

    // Calculate statistics
    let deleted = 0;
    let cancelled = 0;
    const byType: Record<string, { deleted: number; cancelled: number }> = {};

    for (const v of parsedVouchers) {
      if (v.deletion_action === 'Delete') deleted++;
      else cancelled++;

      if (!byType[v.voucher_type]) {
        byType[v.voucher_type] = { deleted: 0, cancelled: 0 };
      }
      if (v.deletion_action === 'Delete') {
        byType[v.voucher_type].deleted++;
      } else {
        byType[v.voucher_type].cancelled++;
      }
    }

    // Send to backend API in batches
    const unsyncedVouchers = await db.getUnsyncedDeletedVouchers(1000);
    let totalSynced = 0;

    if (unsyncedVouchers.length > 0) {
      db.log('INFO', `Sending ${unsyncedVouchers.length} deleted vouchers to backend API`);

      const apiResult = await sendDeletedVouchersToApi(unsyncedVouchers, profile, db);
      totalSynced = apiResult.synced;

      if (apiResult.error) {
        db.log('WARN', `API sync partially failed: ${apiResult.error}`);
      }
    }

    // Update ALTER_ID for incremental sync tracking
    // Find max master_id from the batch as a pseudo ALTER_ID
    const maxMasterId = parsedVouchers.reduce((max, v) => {
      const id = parseInt(v.tally_master_id || '0');
      return id > max ? id : max;
    }, 0);

    if (maxMasterId > 0) {
      await db.updateDeleteSyncAlterId(maxMasterId.toString());
    }

    // Log success
    await db.logSyncEnd(
      syncHistoryId,
      'SUCCESS',
      parsedVouchers.length,
      maxMasterId,
      JSON.stringify({
        totalFetched: parsedVouchers.length,
        totalSynced,
        deleted,
        cancelled,
        byType
      })
    );

    db.log('INFO', `Deleted vouchers sync completed`, {
      totalFetched: parsedVouchers.length,
      totalSynced,
      deleted,
      cancelled,
      byType
    });

    return {
      success: true,
      totalFetched: parsedVouchers.length,
      totalSynced,
      deleted,
      cancelled,
      byType
    };

  } catch (error: any) {
    db.log('ERROR', `Deleted vouchers sync failed: ${error.message}`, {
      stack: error.stack
    });

    return {
      success: false,
      totalFetched: 0,
      totalSynced: 0,
      deleted: 0,
      cancelled: 0,
      byType: {},
      error: error.message
    };
  }
}

/**
 * Send deleted vouchers to backend API
 * The backend will store them in staging table for background processing
 */
async function sendDeletedVouchersToApi(
  vouchers: DeletedVoucherData[],
  profile: UserProfile,
  db: DatabaseService
): Promise<{ synced: number; error?: string }> {
  const apiUrl = await getApiUrl(db);
  const apiKey = await getApiKey(db);

  // Prepare payload for backend API
  // Format: array of deleted voucher records
  const payload = vouchers.map(v => ({
    company_guid: v.company_guid,
    company_name: v.company_name,
    voucher_guid: v.voucher_guid,
    master_id: v.tally_master_id,
    voucher_type: v.voucher_type,
    delete_or_cancel: v.deletion_action
  }));

  try {
    // Send in batches
    let synced = 0;

    for (let i = 0; i < payload.length; i += API_BATCH_SIZE) {
      const batch = payload.slice(i, i + API_BATCH_SIZE);
      const batchGuids = vouchers.slice(i, i + API_BATCH_SIZE).map(v => v.voucher_guid);

      db.log('INFO', `Sending batch ${Math.floor(i / API_BATCH_SIZE) + 1} with ${batch.length} records`);

      const response = await axios.post(
        `${apiUrl}/billers/tally/deleted-vouchers`,
        {
          biller_id: profile.biller_id,
          deleted_vouchers: batch
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'API-KEY': apiKey,
            'Authorization': `Bearer ${profile.token}`
          },
          timeout: 60000
        }
      );

      if (response.status === 200 || response.status === 201) {
        // Mark as synced
        await db.markDeletedVouchersSynced(batchGuids, JSON.stringify(response.data));
        synced += batch.length;
        db.log('INFO', `Batch synced successfully: ${batch.length} records`);
      } else {
        db.log('WARN', `Batch sync returned status ${response.status}`, {
          response: response.data
        });
      }

      // Small delay between batches
      if (i + API_BATCH_SIZE < payload.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return { synced };

  } catch (error: any) {
    db.log('ERROR', `Failed to send deleted vouchers to API: ${error.message}`, {
      status: error.response?.status,
      data: error.response?.data
    });

    return {
      synced: 0,
      error: error.message
    };
  }
}

/**
 * Get pending deleted vouchers count (not yet synced to API)
 */
export async function getPendingDeletedVouchersCount(dbService: DatabaseService): Promise<number> {
  const vouchers = await dbService.getUnsyncedDeletedVouchers(1);
  const summary = await dbService.getDeleteSyncSummary();
  return summary.pendingSync;
}

/**
 * Retry sending failed deleted vouchers to API
 */
export async function retryDeletedVouchersSync(
  profile: UserProfile,
  dbService: DatabaseService
): Promise<{ synced: number; remaining: number; error?: string }> {
  const unsyncedVouchers = await dbService.getUnsyncedDeletedVouchers(500);

  if (unsyncedVouchers.length === 0) {
    return { synced: 0, remaining: 0 };
  }

  dbService.log('INFO', `Retrying sync for ${unsyncedVouchers.length} deleted vouchers`);

  const result = await sendDeletedVouchersToApi(unsyncedVouchers, profile, dbService);
  const summary = await dbService.getDeleteSyncSummary();

  return {
    synced: result.synced,
    remaining: summary.pendingSync,
    error: result.error
  };
}
