// src/services/payment/syncPayments.service.ts
import axios from 'axios';
import { DatabaseService, UserProfile } from '../../database/database.service';
import { getApiUrl } from '../../config/api-url-helper';
import { getApiKey } from '../../config/api-key-helper';
import {
  fetchVouchersFromReportByDateRange,
  fetchVouchersFromReportByAlterId,
  extractReceiptsFromReport,
  getReportText
} from '../../tally/batch-fetcher';

const ENTITY_TYPE = 'PAYMENT';
const API_BATCH_SIZE = 100; // Max 100 records per API call
const BATCH_DELAY_MS = 1000;

function generateMonthlyBatches(fromDate: string, toDate: string): Array<{
  month: string;
  fromDate: string;
  toDate: string;
  tallyFromDate: string;
  tallyToDate: string;
}> {
  const batches: Array<{
    month: string;
    fromDate: string;
    toDate: string;
    tallyFromDate: string;
    tallyToDate: string;
  }> = [];

  const start = new Date(fromDate);
  const end = new Date(toDate);
  let current = new Date(start.getFullYear(), start.getMonth(), 1);

  while (current <= end) {
    const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
    const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
    const actualStart = monthStart < start ? start : monthStart;
    const actualEnd = monthEnd > end ? end : monthEnd;

    const displayFrom = actualStart.toISOString().split('T')[0];
    const displayTo = actualEnd.toISOString().split('T')[0];
    const tallyFrom = displayFrom.replace(/-/g, '');
    const tallyTo = displayTo.replace(/-/g, '');

    batches.push({
      month: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`,
      fromDate: displayFrom,
      toDate: displayTo,
      tallyFromDate: tallyFrom,
      tallyToDate: tallyTo
    });

    current.setMonth(current.getMonth() + 1);
  }

  return batches;
}

/**
 * Format date from various Tally formats to DD-MM-YYYY
 */
function formatDate(dateStr: string): string {
  if (!dateStr || dateStr.trim() === '') return '';
  
  // If already in DD-MM-YYYY format, return as is
  const ddMMyyyyMatch = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddMMyyyyMatch) {
    const [, day, month, year] = ddMMyyyyMatch;
    return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
  }
  
  // If in YYYY-MM-DD format, convert to DD-MM-YYYY
  const yyyyMMddMatch = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (yyyyMMddMatch) {
    const [, year, month, day] = yyyyMMddMatch;
    return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
  }
  
  // If in DD-MM-YY format (2 digit year), convert to DD-MM-YYYY
  const ddMMyyMatch = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{2})$/);
  if (ddMMyyMatch) {
    const [, day, month, year] = ddMMyyMatch;
    const fullYear = parseInt(year) >= 50 ? `19${year}` : `20${year}`;
    return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${fullYear}`;
  }

  const monthMap: { [key: string]: string } = {
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
    'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
    'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
  };

  // If in DD-MMM-YY format (e.g., 15-Jan-24)
  const match = dateStr.match(/(\d{1,2})-([a-zA-Z]{3})-(\d{2})/);
  if (match) {
    const [, day, monthAbbr, year] = match;
    const month = monthMap[monthAbbr.toLowerCase()];
    if (month) {
      const fullYear = parseInt(year) >= 50 ? `19${year}` : `20${year}`;
      return `${day.padStart(2, '0')}-${month}-${fullYear}`;
    }
  }
  
  // If in YYYYMMDD format (8 digits)
  const yyyyMMdd8Match = dateStr.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (yyyyMMdd8Match) {
    const [, year, month, day] = yyyyMMdd8Match;
    return `${day}-${month}-${year}`;
  }

  // Return as is if no pattern matches (might already be in correct format)
  return dateStr;
}

export async function syncPayments(
  profile: UserProfile,
  syncMode: 'first' | 'incremental' = 'incremental',
  dateRangeFrom?: string,
  dateRangeTo?: string,
  dbService?: DatabaseService
): Promise<void> {
  // Use provided dbService or create default (for backward compatibility)
  const db = dbService || new DatabaseService();
  const runId = await db.logSyncStart('BACKGROUND', ENTITY_TYPE);
  let successCount = 0;
  let failedCount = 0;
  let newMaxAlterId = '0';

  try {
    const baseUrl = await getApiUrl(db);
    const apiKey = await getApiKey(db);
    const PAYMENT_API = `${baseUrl}/billers/tally/payment`;

    if (!apiKey) {
      throw new Error('API key not found. Please login again.');
    }

    db.log('INFO', 'Payment sync started', {
      sync_mode: syncMode,
      report: 'ZorrofinReceipt',
      date_range: dateRangeFrom && dateRangeTo ? `${dateRangeFrom} to ${dateRangeTo}` : 'none'
    });

    if (syncMode === 'first' && dateRangeFrom && dateRangeTo) {
      // FIRST SYNC: Check for incomplete months first
      const incompleteMonths = await db.getIncompleteMonths(ENTITY_TYPE);
      
      let monthlyBatches: Array<{
        month: string;
        fromDate: string;
        toDate: string;
        tallyFromDate: string;
        tallyToDate: string;
      }>;
      
      if (incompleteMonths.length > 0) {
        // Resume incomplete months only
        db.log('INFO', `Resuming first sync: ${incompleteMonths.length} incomplete months found: ${incompleteMonths.join(', ')}`);
        
        const allMonthlyBatches = generateMonthlyBatches(dateRangeFrom, dateRangeTo);
        monthlyBatches = allMonthlyBatches.filter(batch => 
          incompleteMonths.includes(batch.month)
        );
        
        db.log('INFO', `Resuming ${monthlyBatches.length} incomplete months`);
      } else {
        // Normal first sync - process all months
        monthlyBatches = generateMonthlyBatches(dateRangeFrom, dateRangeTo);
        db.log('INFO', `First sync: Processing ${monthlyBatches.length} months for payments`);
      }

      for (const monthBatch of monthlyBatches) {
        const { month, tallyFromDate, tallyToDate } = monthBatch;
        db.log('INFO', `Processing payment month: ${month}`);

        const batchId = await db.createSyncBatch(
          runId,
          ENTITY_TYPE,
          1,
          0,
          '0',
          '',
          month,
          monthBatch.fromDate,
          monthBatch.toDate,
          'first_sync'
        );

        try {
          const parsed = await fetchVouchersFromReportByDateRange(tallyFromDate, tallyToDate, 'ZorrofinReceipt');
          const receipts = extractReceiptsFromReport(parsed);

          if (receipts.length === 0) {
            await db.updateSyncBatchStatus(batchId, 'COMPLETED', 0);
            continue;
          }

          await db.updateSyncBatchStatus(batchId, 'FETCHED', receipts.length);

          const paymentsForApi: any[] = [];
          let monthMaxAlterId = 0;

          for (const receipt of receipts) {
            const alterId = parseInt(getReportText(receipt, 'ALTER_ID') || '0', 10);
            if (alterId > monthMaxAlterId) monthMaxAlterId = alterId;

            // Get LEDGER_ENTRIES array
            const ledgerEntriesRaw = Array.isArray(receipt?.LEDGER_ENTRIES)
              ? receipt.LEDGER_ENTRIES
              : (receipt?.LEDGER_ENTRIES ? [receipt.LEDGER_ENTRIES] : []);

            // Collect all bill_details for receipt level (from all ledger entries)
            let bill_details: any[] = [];

            // Process all ledger entries with lowercase inner fields including nested bill_details
            const ledger_entries = ledgerEntriesRaw.map((entry: any) => {
              // Get bill_details for this ledger entry
              const billDetailsRaw = Array.isArray(entry?.BILL_DETAILS)
                ? entry.BILL_DETAILS
                : (entry?.BILL_DETAILS ? [entry.BILL_DETAILS] : []);

              const entryBillDetails = billDetailsRaw.map((v: any) => ({
                bill_id: getReportText(v, 'BILL_ID'),
                bill_amount: getReportText(v, 'BILL_AMOUNT'),
                is_debit: getReportText(v, 'IS_DEBIT') === 'Yes'
              }));

              // Add to receipt level bill_details
              bill_details = bill_details.concat(entryBillDetails);

              return {
                customer_id: getReportText(entry, 'CUSTOMER_ID'),
                ledgername: getReportText(entry, 'LEDGERNAME'),
                parent: getReportText(entry, 'PARENT'),
                ledgergroup: getReportText(entry, 'LEDGERGROUP'),
                amount: getReportText(entry, 'AMOUNT'),
                conversation_rate: getReportText(entry, 'CONVERSATION_RATE'),
                currencysymbol: getReportText(entry, 'CURRENCYSYMBOL'),
                currency: getReportText(entry, 'CURRENCY'),
                is_debit: getReportText(entry, 'IS_DEBIT') === 'Yes',
                bill_details: entryBillDetails
              };
            });

            const paymentData = {
              receipt_id: getReportText(receipt, 'RECEIPT_ID'),
              receipt_number: getReportText(receipt, 'RECEIPT_NUMBER'),
              customer_id: getReportText(receipt, 'CUSTOMER_ID'),
              customer_name: getReportText(receipt, 'CUSTOMER_NAME'),
              receipt_date: formatDate(getReportText(receipt, 'RECEIPT_DATE')),
              receipt_amount: getReportText(receipt, 'RECEIPT_AMOUNT'),
              transaction_type: getReportText(receipt, 'TRANSACTION_TYPE'),
              biller_id: profile?.biller_id || '',
              ledger_entries: ledger_entries,
              bill_details: bill_details
            };

            paymentsForApi.push(paymentData);
          }

          let apiSuccess = 0;
          let apiFailed = 0;

          for (let i = 0; i < paymentsForApi.length; i += API_BATCH_SIZE) {
            const chunk = paymentsForApi.slice(i, i + API_BATCH_SIZE);
            const payload = { "receipt": chunk };
            try {
              await axios.post(PAYMENT_API, payload, {
                headers: {
                  'API-KEY': apiKey,
                  'Content-Type': 'application/json'
                },
                timeout: 30000
              });
              apiSuccess += chunk.length;
              successCount += chunk.length;
            } catch (err: any) {
              apiFailed += chunk.length;
              failedCount += chunk.length;
              const errorMsg = err.response?.data || err.message || 'Unknown error';
              db.log('ERROR', `Payment API batch failed (Month ${month})`, { error: errorMsg });
            }
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
          }

          newMaxAlterId = String(monthMaxAlterId);

          await db.updateSyncBatchStatus(
            batchId,
            apiFailed === 0 ? 'API_SUCCESS' : 'API_FAILED',
            receipts.length,
            receipts.length,
            apiSuccess
          );

        } catch (error: any) {
          await db.updateSyncBatchStatus(batchId, 'API_FAILED', 0, 0, 0, error.message);
          db.log('ERROR', `Payment batch failed for month ${month}`, { error: error.message });
        }
      }
    } else {
      // INCREMENTAL SYNC
      const lastAlterId = await db.getEntityMaxAlterId(ENTITY_TYPE);
      db.log('INFO', 'Starting incremental payment sync', { from_alter_id: lastAlterId });

      const batchId = await db.createSyncBatch(runId, ENTITY_TYPE, 1, 0, lastAlterId, '');

      try {
        const parsed = await fetchVouchersFromReportByAlterId(lastAlterId, 'ZorrofinReceipt');
        const receipts = extractReceiptsFromReport(parsed);

        if (receipts.length === 0) {
          await db.updateSyncBatchStatus(batchId, 'COMPLETED', 0);
        } else {
          await db.updateSyncBatchStatus(batchId, 'FETCHED', receipts.length);

          const paymentsForApi: any[] = [];
          let maxAlterId = parseInt(lastAlterId || '0', 10);

          for (const receipt of receipts) {
            const alterId = parseInt(getReportText(receipt, 'ALTER_ID') || '0', 10);
            if (alterId > maxAlterId) maxAlterId = alterId;

            // Get LEDGER_ENTRIES array
            const ledgerEntriesRaw = Array.isArray(receipt?.LEDGER_ENTRIES)
              ? receipt.LEDGER_ENTRIES
              : (receipt?.LEDGER_ENTRIES ? [receipt.LEDGER_ENTRIES] : []);

            // Collect all bill_details for receipt level (from all ledger entries)
            let bill_details: any[] = [];

            // Process all ledger entries with lowercase inner fields including nested bill_details
            const ledger_entries = ledgerEntriesRaw.map((entry: any) => {
              // Get bill_details for this ledger entry
              const billDetailsRaw = Array.isArray(entry?.BILL_DETAILS)
                ? entry.BILL_DETAILS
                : (entry?.BILL_DETAILS ? [entry.BILL_DETAILS] : []);

              const entryBillDetails = billDetailsRaw.map((v: any) => ({
                bill_id: getReportText(v, 'BILL_ID'),
                bill_amount: getReportText(v, 'BILL_AMOUNT'),
                is_debit: getReportText(v, 'IS_DEBIT') === 'Yes'
              }));

              // Add to receipt level bill_details
              bill_details = bill_details.concat(entryBillDetails);

              return {
                customer_id: getReportText(entry, 'CUSTOMER_ID'),
                ledgername: getReportText(entry, 'LEDGERNAME'),
                parent: getReportText(entry, 'PARENT'),
                ledgergroup: getReportText(entry, 'LEDGERGROUP'),
                amount: getReportText(entry, 'AMOUNT'),
                conversation_rate: getReportText(entry, 'CONVERSATION_RATE'),
                currencysymbol: getReportText(entry, 'CURRENCYSYMBOL'),
                currency: getReportText(entry, 'CURRENCY'),
                is_debit: getReportText(entry, 'IS_DEBIT') === 'Yes',
                bill_details: entryBillDetails
              };
            });

            const paymentData = {
              receipt_id: getReportText(receipt, 'RECEIPT_ID'),
              receipt_number: getReportText(receipt, 'RECEIPT_NUMBER'),
              customer_id: getReportText(receipt, 'CUSTOMER_ID'),
              customer_name: getReportText(receipt, 'CUSTOMER_NAME'),
              receipt_date: formatDate(getReportText(receipt, 'RECEIPT_DATE')),
              receipt_amount: getReportText(receipt, 'RECEIPT_AMOUNT'),
              transaction_type: getReportText(receipt, 'TRANSACTION_TYPE'),
              biller_id: profile?.biller_id || '',
              ledger_entries: ledger_entries,
              bill_details: bill_details
            };

            paymentsForApi.push(paymentData);
          }

          let apiSuccess = 0;
          let apiFailed = 0;

          for (let i = 0; i < paymentsForApi.length; i += API_BATCH_SIZE) {
            const chunk = paymentsForApi.slice(i, i + API_BATCH_SIZE);
            const payload = { "receipt": chunk };
            try {
              await axios.post(PAYMENT_API, payload, {
                headers: {
                  'API-KEY': apiKey,
                  'Content-Type': 'application/json'
                }
              });
              apiSuccess += chunk.length;
              successCount += chunk.length;
            } catch (err: any) {
              apiFailed += chunk.length;
              failedCount += chunk.length;
            }
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
          }

          newMaxAlterId = String(maxAlterId);

          await db.updateSyncBatchStatus(
            batchId,
            apiFailed === 0 ? 'API_SUCCESS' : 'API_FAILED',
            receipts.length,
            receipts.length,
            apiSuccess
          );
        }
      } catch (error: any) {
        await db.updateSyncBatchStatus(batchId, 'API_FAILED', 0, 0, 0, error.message);
      }
    }

    const status = failedCount === 0 ? 'SUCCESS' : (successCount > 0 ? 'PARTIAL' : 'FAILED');
    if (successCount > 0 || newMaxAlterId !== '0') {
      await db.updateEntityMaxAlterId(ENTITY_TYPE, newMaxAlterId);
    }

    // After successful first sync, check if entity should be marked as complete
    if (syncMode === 'first' && successCount > 0) {
      const incompleteMonths = await db.getIncompleteMonths(ENTITY_TYPE);
      if (incompleteMonths.length === 0) {
        await db.completeEntityFirstSync(ENTITY_TYPE);
        db.log('INFO', `PAYMENT first sync completed successfully, marked as complete`);
      }
    }

    await db.logSyncEnd(runId, status, successCount, failedCount, newMaxAlterId, `${successCount} payments synced`);
    db.log('INFO', 'Payment sync completed', { success: successCount, failed: failedCount });

  } catch (error: any) {
    await db.logSyncEnd(runId, 'FAILED', successCount, failedCount, undefined, error.message);
    db.log('ERROR', 'Payment sync crashed', { error: error.message });
    throw error;
  }
}