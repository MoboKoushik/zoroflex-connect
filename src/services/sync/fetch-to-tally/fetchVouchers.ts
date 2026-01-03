// src/services/sync/fetch-to-tally/fetchVouchers.ts
// Simplified thin client - only fetches raw data and sends to backend

import axios from 'axios';
import fs from 'fs';
import { DatabaseService, UserProfile } from '../../database/database.service';
import { getApiUrl } from '../../config/api-url-helper';
import { fetchVouchersBatch, extractVouchersFromBatch } from '../../tally/batch-fetcher';

const db = new DatabaseService();

const ENTITY_TYPE = 'VOUCHER';
const TALLY_BATCH_SIZE = 20;
const BATCH_DELAY_MS = 2000;
const API_KEY = '7061797A6F72726F74616C6C79';

const getText = (obj: any, key: string): string => {
  const value = obj?.[key]?.[0];
  if (!value) return '';
  return (typeof value === 'string' ? value.trim() : value._?.trim() || '');
};

export async function syncVouchers(profile: UserProfile): Promise<void> {
  const runId = await db.logSyncStart('BACKGROUND', ENTITY_TYPE);
  let successCount = 0;
  let failedCount = 0;
  let newMaxAlterId = '0';

  try {
    const baseUrl = await getApiUrl(db);
    const API_URL = `${baseUrl}/tally/vouchers/raw`;
    
    db.log('INFO', 'Voucher sync configuration', {
      api_url: API_URL,
      base_url: baseUrl
    });

    const lastAlterId = await db.getEntityMaxAlterId(ENTITY_TYPE);
    db.log('INFO', 'Voucher sync started', { from_alter_id: lastAlterId });

    console.log(`Starting batch voucher sync from AlterID > ${lastAlterId}`);

    let currentAlterId = parseInt(lastAlterId || '0', 10);
    let batchNumber = 0;
    let hasMoreBatches = true;

    // Process in batches from Tally
    while (hasMoreBatches) {
      batchNumber++;
      const fromAlterId = currentAlterId.toString();

      // Create batch tracking record
      const batchId = await db.createSyncBatch(
        runId,
        ENTITY_TYPE,
        batchNumber,
        TALLY_BATCH_SIZE,
        fromAlterId,
        '' // No upper bound
      );

      let vouchersXml: any[] = [];
      try {
        // Fetch batch from Tally
        console.log(`\n🔄 [Batch ${batchNumber}] Fetching vouchers from Tally: AlterID > ${fromAlterId} (max ${TALLY_BATCH_SIZE} records)`);
        db.log('INFO', `Fetching voucher batch ${batchNumber} from Tally`, { from_alter_id: fromAlterId });
        
        const parsed = await fetchVouchersBatch(fromAlterId, TALLY_BATCH_SIZE);
        fs.mkdirSync('./dump/voucher', { recursive: true });
        fs.writeFileSync(`./dump/voucher/raw_batch_data_${batchNumber}.json`, JSON.stringify(parsed, null, 2));

        vouchersXml = extractVouchersFromBatch(parsed);
        console.log(`   📥 Fetched ${vouchersXml.length} raw vouchers from Tally`);

        if (vouchersXml.length === 0) {
          console.log(`   ✅ No more vouchers to fetch. Sync complete.`);
          hasMoreBatches = false;
          await db.updateSyncBatchStatus(batchId, 'COMPLETED', 0);
          break;
        }

        // Filter and sort by AlterID
        const fromAlterIdNum = parseInt(fromAlterId, 10);
        vouchersXml = vouchersXml
          .filter((voucher: any) => {
            const alterId = parseInt(getText(voucher, 'ALTERID') || '0', 10);
            return alterId > fromAlterIdNum;
          })
          .sort((a: any, b: any) => {
            const idA = parseInt(getText(a, 'ALTERID') || '0', 10);
            const idB = parseInt(getText(b, 'ALTERID') || '0', 10);
            return idA - idB;
          })
          .slice(0, TALLY_BATCH_SIZE);

        if (vouchersXml.length === 0) {
          hasMoreBatches = false;
          await db.updateSyncBatchStatus(batchId, 'COMPLETED', 0);
          break;
        }

        await db.updateSyncBatchStatus(batchId, 'FETCHED', vouchersXml.length);

        // Calculate max AlterID from ALL vouchers (not just AR)
        let batchHighestAlterId = currentAlterId;
        let toAlterId = fromAlterId;
        for (const voucher of vouchersXml) {
          const alterIdStr = getText(voucher, 'ALTERID').replace(/\s+/g, '');
          const alterId = parseInt(alterIdStr || '0', 10);
          if (!isNaN(alterId) && alterId > batchHighestAlterId) {
            batchHighestAlterId = alterId;
            toAlterId = alterIdStr;
          }
        }

        // Extract raw data structure from parsed response
        // The COLLECTION contains the VOUCHER array
        const rawData = parsed.ENVELOPE?.BODY?.[0]?.DATA?.[0]?.COLLECTION?.[0] || { VOUCHER: vouchersXml };

        // Prepare payload for backend
        const payload = {
          entity: 'VOUCHER',
          from_alter_id: fromAlterId,
          to_alter_id: toAlterId,
          count: vouchersXml.length,
          raw_data: rawData
        };

        // Send raw data to backend
        try {
          db.log('INFO', `Sending voucher batch ${batchNumber} to backend`, {
            count: vouchersXml.length,
            from_alter_id: fromAlterId,
            to_alter_id: toAlterId,
            api_url: API_URL
          });

          const startTime = Date.now();
          const response = await axios.post(API_URL, payload, {
            headers: {
              'API-KEY': API_KEY,
              'Content-Type': 'application/json',
              'Authorization': profile?.token ? `Bearer ${profile.token}` : undefined
            },
            timeout: 120000 // Increased timeout for large payloads
          });
          const duration = Date.now() - startTime;

          successCount += vouchersXml.length;
          await db.updateSyncBatchStatus(batchId, 'API_SUCCESS', vouchersXml.length, vouchersXml.length, vouchersXml.length);

          // Update current AlterID for next batch
          currentAlterId = batchHighestAlterId;
          newMaxAlterId = currentAlterId.toString();

          db.log('INFO', `Voucher batch ${batchNumber} sent successfully`, {
            count: vouchersXml.length,
            response: response.data,
            duration_ms: duration
          });

          console.log(`✅ Batch ${batchNumber}: ${vouchersXml.length} vouchers sent to backend (${duration}ms)`);

        } catch (err: any) {
          failedCount += vouchersXml.length;
          const errorMsg = err.response?.data || err.message || 'Unknown error';
          const statusCode = err.response?.status || 'N/A';
          
          db.log('ERROR', 'Voucher API batch failed', {
            batch_index: batchNumber,
            count: vouchersXml.length,
            error: errorMsg,
            status_code: statusCode,
            api_url: API_URL
          });
          
          console.error(`❌ Batch ${batchNumber} failed:`, errorMsg);
          // fs.writeFileSync(`./dump/voucher/failed_batch_${Date.now()}_${batchNumber}.json`, JSON.stringify(payload, null, 2));
          await db.updateSyncBatchStatus(batchId, 'API_FAILED', vouchersXml.length, vouchersXml.length, 0, errorMsg);
        }

        // Check if we should continue
        if (vouchersXml.length < TALLY_BATCH_SIZE) {
          hasMoreBatches = false;
        }

        // Add a small delay between batches to avoid overwhelming Tally
        if (hasMoreBatches) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
        }

      } catch (error: any) {
        await db.updateSyncBatchStatus(batchId, 'API_FAILED', 0, 0, 0, error.message);
        db.log('ERROR', `Voucher batch ${batchNumber} failed`, { error: error.message });
        if (vouchersXml?.length < TALLY_BATCH_SIZE) {
          hasMoreBatches = false;
        }
      }
    }

    const status = failedCount === 0 ? 'SUCCESS' : (successCount > 0 ? 'PARTIAL' : 'FAILED');

    if (successCount > 0 || newMaxAlterId !== '0') {
      await db.updateEntityMaxAlterId(ENTITY_TYPE, newMaxAlterId);
    }

    await db.logSyncEnd(runId, status, successCount, failedCount, newMaxAlterId, `${successCount} vouchers synced`, {
      success: successCount,
      failed: failedCount
    });
    await db.updateLastSuccessfulSync();

    db.log('INFO', 'Voucher sync completed', {
      success: successCount,
      failed: failedCount,
      highest_alter_id: newMaxAlterId,
      total_batches: batchNumber
    });
    
    console.log(`\n📊 Voucher Sync Summary:`);
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Failed: ${failedCount}`);
    console.log(`   📦 Total Batches: ${batchNumber}`);
    console.log(`   🔢 Final AlterID: ${newMaxAlterId}`);
    console.log(`   📈 Status: ${status}\n`);

  } catch (error: any) {
    await db.logSyncEnd(runId, 'FAILED', 0, 0, undefined, error.message);
    db.log('ERROR', 'Voucher sync crashed', { error: error.message });
    throw error;
  }
}
