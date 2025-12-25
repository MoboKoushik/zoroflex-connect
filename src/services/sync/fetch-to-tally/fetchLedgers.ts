// src/services/sync/fetch-to-tally/fetchLedgers.ts
// Simplified thin client - only fetches raw data and sends to backend

import axios from 'axios';
import fs from 'fs';
import { DatabaseService, UserProfile } from '../../database/database.service';
import { getApiUrl } from '../../config/api-url-helper';
import { fetchCustomersBatch, extractLedgersFromBatch } from '../../tally/batch-fetcher';

const db = new DatabaseService();

const ENTITY_TYPE = 'CUSTOMER';
const API_KEY = '7061797A6F72726F74616C6C79';
const TALLY_BATCH_SIZE = 100; // Tally fetch batch size

const getText = (obj: any, key: string): string => {
  const value = obj?.[key]?.[0];
  if (!value) return '';
  return (typeof value === 'string' ? value.trim() : value._?.trim() || '');
};

export async function syncCustomers(profile: UserProfile): Promise<void> {
  const runId = await db.logSyncStart('BACKGROUND', ENTITY_TYPE);
  let successCount = 0;
  let failedCount = 0;
  let newMaxAlterId = '0';

  try {
    const baseUrl = await getApiUrl(db);
    const API_URL = `${baseUrl}/tally/customers/raw`;
    
    db.log('INFO', 'Customer sync configuration', {
      api_url: API_URL,
      base_url: baseUrl
    });

    const lastMaxAlterId = await db.getEntityMaxAlterId(ENTITY_TYPE);
    console.log('Last Max AlterID for Customer:', lastMaxAlterId);
    const cleanLastAlterId = lastMaxAlterId.trim();
    let currentAlterId = parseInt(cleanLastAlterId || '0', 10);

    db.log('INFO', 'Customer sync started', { from_alter_id: cleanLastAlterId });

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

      let ledgersXml: any[] = [];
      try {
        // Fetch batch from Tally
        console.log(`\n🔄 [Batch ${batchNumber}] Fetching customers from Tally: AlterID > ${fromAlterId} (max ${TALLY_BATCH_SIZE} records)`);
        db.log('INFO', `Fetching customer batch ${batchNumber} from Tally`, { from_alter_id: fromAlterId });
        
        const parsed = await fetchCustomersBatch(fromAlterId, TALLY_BATCH_SIZE);
        // fs.mkdirSync('./dump/customer', { recursive: true });
        // fs.writeFileSync(`./dump/customer/raw_batch_${batchNumber}.json`, JSON.stringify(parsed, null, 2));

        ledgersXml = extractLedgersFromBatch(parsed);
        console.log(`   📥 Fetched ${ledgersXml.length} raw ledgers from Tally`);

        if (ledgersXml.length === 0) {
          console.log(`   ✅ No more customers to fetch. Sync complete.`);
          hasMoreBatches = false;
          await db.updateSyncBatchStatus(batchId, 'COMPLETED', 0);
          break;
        }

        // Filter and sort by AlterID
        const fromAlterIdNum = parseInt(fromAlterId, 10);
        ledgersXml = ledgersXml
          .filter((ledger: any) => {
            const alterId = parseInt(getText(ledger, 'ALTERID') || '0', 10);
            return alterId > fromAlterIdNum;
          })
          .sort((a: any, b: any) => {
            const idA = parseInt(getText(a, 'ALTERID') || '0', 10);
            const idB = parseInt(getText(b, 'ALTERID') || '0', 10);
            return idA - idB;
          })
          .slice(0, TALLY_BATCH_SIZE);

        if (ledgersXml.length === 0) {
          hasMoreBatches = false;
          await db.updateSyncBatchStatus(batchId, 'COMPLETED', 0);
          break;
        }

        await db.updateSyncBatchStatus(batchId, 'FETCHED', ledgersXml.length);

        // Calculate max AlterID from batch
        let batchHighestAlterId = currentAlterId;
        let toAlterId = fromAlterId;
        for (const ledger of ledgersXml) {
          const alterIdStr = getText(ledger, 'ALTERID');
          const alterId = parseInt(alterIdStr || '0', 10);
          if (alterId > batchHighestAlterId) {
            batchHighestAlterId = alterId;
            toAlterId = alterIdStr;
          }
        }

        // Extract raw data structure from parsed response
        // The COLLECTION contains the LEDGER array
        const rawData = parsed.ENVELOPE?.BODY?.[0]?.DATA?.[0]?.COLLECTION?.[0] || { LEDGER: ledgersXml };

        // Prepare payload for backend
        const payload = {
          entity: 'CUSTOMER',
          from_alter_id: fromAlterId,
          to_alter_id: toAlterId,
          count: ledgersXml.length,
          raw_data: rawData
        };

        // Send raw data to backend
        try {
          db.log('INFO', `Sending customer batch ${batchNumber} to backend`, {
            count: ledgersXml.length,
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
            timeout: 60000 // Increased timeout for large payloads
          });
          const duration = Date.now() - startTime;

          successCount += ledgersXml.length;
          await db.updateSyncBatchStatus(batchId, 'API_SUCCESS', ledgersXml.length, ledgersXml.length, ledgersXml.length);

          // Update current AlterID for next batch
          currentAlterId = batchHighestAlterId;
          newMaxAlterId = currentAlterId.toString();

          db.log('INFO', `Customer batch ${batchNumber} sent successfully`, {
            count: ledgersXml.length,
            response: response.data,
            duration_ms: duration
          });

          console.log(`✅ Batch ${batchNumber}: ${ledgersXml.length} customers sent to backend (${duration}ms)`);

        } catch (err: any) {
          failedCount += ledgersXml.length;
          const errorMsg = err.response?.data || err.message || 'Unknown error';
          const statusCode = err.response?.status || 'N/A';
          
          db.log('ERROR', 'Customer API batch failed', {
            batch_index: batchNumber,
            count: ledgersXml.length,
            error: errorMsg,
            status_code: statusCode,
            api_url: API_URL
          });
          
          console.error(`❌ Batch ${batchNumber} failed:`, errorMsg);
          // fs.writeFileSync(`./dump/customer/failed_batch_${Date.now()}_${batchNumber}.json`, JSON.stringify(payload, null, 2));
          await db.updateSyncBatchStatus(batchId, 'API_FAILED', ledgersXml.length, ledgersXml.length, 0, errorMsg);
        }

        // Check if we should continue
        if (ledgersXml.length < TALLY_BATCH_SIZE) {
          hasMoreBatches = false;
        }

      } catch (error: any) {
        await db.updateSyncBatchStatus(batchId, 'API_FAILED', 0, 0, 0, error.message);
        db.log('ERROR', `Customer batch ${batchNumber} failed`, { error: error.message });
        if (ledgersXml?.length < TALLY_BATCH_SIZE) {
          hasMoreBatches = false;
        }
      }
    }

    const status = failedCount === 0 ? 'SUCCESS' : (successCount > 0 ? 'PARTIAL' : 'FAILED');
    const summary = { success: successCount, failed: failedCount };

    if (successCount > 0 || newMaxAlterId !== '0') {
      await db.updateEntityMaxAlterId(ENTITY_TYPE, newMaxAlterId);
    }

    await db.logSyncEnd(runId, status, successCount, failedCount, newMaxAlterId, `${successCount} customers synced`, summary);
    await db.updateLastSuccessfulSync();

    db.log('INFO', 'Customer sync completed', {
      ...summary,
      total_batches: batchNumber,
      final_alter_id: newMaxAlterId
    });
    
    console.log(`\n📊 Customer Sync Summary:`);
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Failed: ${failedCount}`);
    console.log(`   📦 Total Batches: ${batchNumber}`);
    console.log(`   🔢 Final AlterID: ${newMaxAlterId}`);
    console.log(`   📈 Status: ${status}\n`);

  } catch (error: any) {
    await db.logSyncEnd(runId, 'FAILED', successCount, failedCount, undefined, error.message || 'Unknown error');
    db.log('ERROR', 'Customer sync crashed', { error: error.message });
    throw error;
  }
}
