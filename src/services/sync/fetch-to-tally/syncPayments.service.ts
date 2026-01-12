// src/services/payment/syncPayments.service.ts
import axios from 'axios';
import { DatabaseService, UserProfile } from '../../database/database.service';
import { getApiUrl } from '../../config/api-url-helper';
import {
  fetchVouchersFromReportByDateRange,
  fetchVouchersFromReportByAlterId,
  extractReceiptsFromReport,
  getReportText
} from '../../tally/batch-fetcher';

const db = new DatabaseService();
const ENTITY_TYPE = 'PAYMENT';
const API_KEY = '7061797A6F72726F74616C6C79';
const API_BATCH_SIZE = 20;
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

function formatDate(dateStr: string): string {
  if (!dateStr || dateStr.trim() === '') return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [day, month, year] = parts;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const monthMap: { [key: string]: string } = {
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
    'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
    'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
  };

  const match = dateStr.match(/(\d{1,2})-([a-zA-Z]{3})-(\d{2})/);
  if (match) {
    const [, day, monthAbbr, year] = match;
    const month = monthMap[monthAbbr.toLowerCase()];
    const fullYear = parseInt(year) >= 50 ? `19${year}` : `20${year}`;
    return `${fullYear}-${month}-${day.padStart(2, '0')}`;
  }

  return dateStr;
}

export async function syncPayments(
  profile: UserProfile,
  syncMode: 'first' | 'incremental' = 'incremental',
  dateRangeFrom?: string,
  dateRangeTo?: string
): Promise<void> {
  const runId = await db.logSyncStart('BACKGROUND', ENTITY_TYPE);
  let successCount = 0;
  let failedCount = 0;
  let newMaxAlterId = '0';

  try {
    const baseUrl = await getApiUrl(db);
    const PAYMENT_API = `${baseUrl}/billers/tally/payment`;

    db.log('INFO', 'Payment sync started', {
      sync_mode: syncMode,
      report: 'ZeroFinnReceipt',
      date_range: dateRangeFrom && dateRangeTo ? `${dateRangeFrom} to ${dateRangeTo}` : 'none'
    });

    if (syncMode === 'first' && dateRangeFrom && dateRangeTo) {
      const monthlyBatches = generateMonthlyBatches(dateRangeFrom, dateRangeTo);
      db.log('INFO', `First sync: Processing ${monthlyBatches.length} months for payments`);

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
          const parsed = await fetchVouchersFromReportByDateRange(tallyFromDate, tallyToDate, 'ZeroFinnReceipt');
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
            let bill_details = receipt?.BILL_DETAILS?.map((v: any) => {
              return {
                bill_id: getReportText(v, 'BILL_ID'),
                bill_amount: getReportText(v, 'BILL_AMOUNT')
              }
            }) || []


            const paymentData = {
              receipt_id: getReportText(receipt, 'RECEIPT_ID'),
              receipt_number: getReportText(receipt, 'RECEIPT_NUMBER'),
              customer_id: getReportText(receipt, 'CUSTOMER_ID') || getReportText(receipt, 'CUSTOMER_NAME'),
              receipt_date: formatDate(getReportText(receipt, 'RECEIPT_DATE')),
              amount: parseFloat(getReportText(receipt, 'RECEIPT_AMOUNT') || '0'),
              transaction_type: getReportText(receipt, 'TRANSACTION_TYPE'),
              biller_id: profile?.biller_id || '',
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
                  'API-KEY': API_KEY,
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
        const parsed = await fetchVouchersFromReportByAlterId(lastAlterId);
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
            let bill_details = receipt?.BILL_DETAILS?.map((v: any) => {
              return {
                bill_id: getReportText(v, 'BILL_ID'),
                bill_amount: getReportText(v, 'BILL_AMOUNT')
              }
            }) || []

            const paymentData = {
              receipt_id: getReportText(receipt, 'RECEIPT_ID'),
              receipt_number: getReportText(receipt, 'RECEIPT_NUMBER'),
              customer_id: getReportText(receipt, 'CUSTOMER_ID'),
              receipt_date: formatDate(getReportText(receipt, 'RECEIPT_DATE')),
              amount: parseFloat(getReportText(receipt, 'RECEIPT_AMOUNT') || '0'),
              transaction_type: getReportText(receipt, 'TRANSACTION_TYPE'),
              biller_id: profile?.biller_id || '',
              bill_details
            };

            paymentsForApi.push(paymentData);
          }

          let apiSuccess = 0;
          let apiFailed = 0;

          for (let i = 0; i < paymentsForApi.length; i += API_BATCH_SIZE) {
            const chunk = paymentsForApi.slice(i, i + API_BATCH_SIZE);
            try {
              await axios.post(PAYMENT_API, chunk, {
                headers: {
                  'API-KEY': API_KEY,
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

    await db.logSyncEnd(runId, status, successCount, failedCount, newMaxAlterId, `${successCount} payments synced`);
    db.log('INFO', 'Payment sync completed', { success: successCount, failed: failedCount });

  } catch (error: any) {
    await db.logSyncEnd(runId, 'FAILED', successCount, failedCount, undefined, error.message);
    db.log('ERROR', 'Payment sync crashed', { error: error.message });
    throw error;
  }
}