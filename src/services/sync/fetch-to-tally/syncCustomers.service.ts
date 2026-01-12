// src/services/customer/syncCustomers.service.ts
import axios from 'axios';
import { DatabaseService, UserProfile } from '../../database/database.service';
import { getApiUrl } from '../../config/api-url-helper';
import {
  fetchCustomersFromReportByDateRange,
  fetchCustomersFromReportByAlterId,
  extractCustomersFromReport,
  getReportText
} from '../../tally/batch-fetcher';

const db = new DatabaseService();
const ENTITY_TYPE = 'CUSTOMER';
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

/**
 * Format date from various Tally formats
 */
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

export async function syncCustomers(
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
    const CUSTOMER_API = `${baseUrl}/customer/tally/create`;

    db.log('INFO', 'Customer sync started', {
      sync_mode: syncMode,
      report: 'ZeroFinnCust',
      date_range: dateRangeFrom && dateRangeTo ? `${dateRangeFrom} to ${dateRangeTo}` : 'none'
    });

    if (syncMode === 'first' && dateRangeFrom && dateRangeTo) {
      // FIRST SYNC: Monthly batching using ZeroFinnCust report
      const monthlyBatches = generateMonthlyBatches(dateRangeFrom, dateRangeTo);
      db.log('INFO', `First sync: Processing ${monthlyBatches.length} months for customers`);

      for (const monthBatch of monthlyBatches) {
        const { month, tallyFromDate, tallyToDate } = monthBatch;
        db.log('INFO', `Processing customer month: ${month}`);

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
          const parsed = await fetchCustomersFromReportByDateRange(tallyFromDate, tallyToDate);
          const customers = extractCustomersFromReport(parsed);

          if (customers.length === 0) {
            await db.updateSyncBatchStatus(batchId, 'COMPLETED', 0);
            continue;
          }

          await db.updateSyncBatchStatus(batchId, 'FETCHED', customers.length);

          const customersForApi: any[] = [];
          let monthMaxAlterId = 0;

          for (const customer of customers) {
            // Try to get ALTER_ID if available (may not be in ZeroFinnCust report response)
            const alterIdStr = getReportText(customer, 'ALTER_ID') || getReportText(customer, 'ALTERID') || '0';
            const alterId = parseInt(alterIdStr, 10);
            if (alterId > monthMaxAlterId) monthMaxAlterId = alterId;

            const customerId = getReportText(customer, 'CUSTOMER_ID');
            const name = getReportText(customer, 'NAME');
            const currentBalanceAt = getReportText(customer, 'CURRENT_BALANCE_AT');

            // Get biller_id from XML response first, fall back to profile
            const xmlBillerId = getReportText(customer, 'BILLER_ID');
            const billerId = xmlBillerId || profile?.biller_id || '';

            // Format current_balance_at date
            let formattedBalanceAt = '';
            if (currentBalanceAt) {
              formattedBalanceAt = formatDate(currentBalanceAt);
              if (!formattedBalanceAt) {
                // If formatDate didn't work, try to use as-is or set to current date
                formattedBalanceAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
              }
            } else {
              formattedBalanceAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
            }

            const apiCustomer = {
              name: name || '',
              email: getReportText(customer, 'EMAIL') || '',
              phone: getReportText(customer, 'PHONE') || '',
              mobile: getReportText(customer, 'MOBILE') || '',
              whatsapp: getReportText(customer, 'WHATSAPP') || '',
              company_name: '', // May need to extract from NAME or set empty
              customer_id: customerId || '',
              address: getReportText(customer, 'ADDRESS') || '',
              group: getReportText(customer, 'GROUP') || '',
              gstin: getReportText(customer, 'GSTIN') || '',
              trn: getReportText(customer, 'VAT_TRN_NUMBER') || '',
              city: '', // PINCODE might not be city, leaving empty for now
              state: getReportText(customer, 'STATE') || '',
              country: getReportText(customer, 'COUNTRY') || '',
              bill_by_bill: getReportText(customer, 'BILL_BY_BILL') || 'Yes',
              biller_id: billerId,
              current_balance: parseFloat(getReportText(customer, 'CURRENT_BALANCE')?.replace(/,/g, '') || '0'),
              current_balance_at: formattedBalanceAt,
              opening_balance: parseFloat(getReportText(customer, 'OPENING_BALANCE')?.replace(/,/g, '') || '0'),
              invoice_details: [] // Empty array initially
            };

            customersForApi.push(apiCustomer);
          }

          let apiSuccess = 0;
          let apiFailed = 0;

          for (let i = 0; i < customersForApi.length; i += API_BATCH_SIZE) {
            const chunk = customersForApi.slice(i, i + API_BATCH_SIZE);
            const payload = { "customer": chunk };
            try {
              await axios.post(CUSTOMER_API, payload, {
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
              db.log('ERROR', `Customer API batch failed (Month ${month})`, { error: errorMsg });
            }
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
          }

          newMaxAlterId = String(monthMaxAlterId);

          await db.updateSyncBatchStatus(
            batchId,
            apiFailed === 0 ? 'API_SUCCESS' : 'API_FAILED',
            customers.length,
            0, // No local store
            apiSuccess,
            apiFailed > 0 ? `API failed for ${apiFailed} records` : undefined
          );

        } catch (error: any) {
          await db.updateSyncBatchStatus(batchId, 'API_FAILED', 0, 0, 0, error.message);
          db.log('ERROR', `Customer batch failed for month ${month}`, { error: error.message });
        }
      }
    } else {
      // INCREMENTAL SYNC: Using ALTER_ID only
      const lastAlterId = await db.getEntityMaxAlterId(ENTITY_TYPE);
      db.log('INFO', 'Starting incremental customer sync', { from_alter_id: lastAlterId });

      const batchId = await db.createSyncBatch(runId, ENTITY_TYPE, 1, 0, lastAlterId, '');

      try {
        const parsed = await fetchCustomersFromReportByAlterId(lastAlterId);
        const customers = extractCustomersFromReport(parsed);

        if (customers.length === 0) {
          await db.updateSyncBatchStatus(batchId, 'COMPLETED', 0);
        } else {
          await db.updateSyncBatchStatus(batchId, 'FETCHED', customers.length);

          const customersForApi: any[] = [];
          let maxAlterId = parseInt(lastAlterId || '0', 10);

          for (const customer of customers) {
            // Try to get ALTER_ID if available (may not be in ZeroFinnCust report response)
            const alterIdStr = getReportText(customer, 'ALTER_ID') || getReportText(customer, 'ALTERID') || '0';
            const alterId = parseInt(alterIdStr, 10);
            if (alterId > maxAlterId) maxAlterId = alterId;

            const customerId = getReportText(customer, 'CUSTOMER_ID');
            const name = getReportText(customer, 'NAME');
            const currentBalanceAt = getReportText(customer, 'CURRENT_BALANCE_AT');

            // Get biller_id from XML response first, fall back to profile
            const xmlBillerId = getReportText(customer, 'BILLER_ID');
            const billerId = xmlBillerId || profile?.biller_id || '';

            // Format current_balance_at date
            let formattedBalanceAt = '';
            if (currentBalanceAt) {
              formattedBalanceAt = formatDate(currentBalanceAt);
              if (!formattedBalanceAt) {
                formattedBalanceAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
              }
            } else {
              formattedBalanceAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
            }

            const apiCustomer = {
              name: name || '',
              email: getReportText(customer, 'EMAIL') || '',
              phone: getReportText(customer, 'PHONE') || '',
              mobile: getReportText(customer, 'MOBILE') || '',
              whatsapp: getReportText(customer, 'WHATSAPP') || '',
              company_name: '',
              customer_id: customerId || '',
              address: getReportText(customer, 'ADDRESS') || '',
              group: getReportText(customer, 'GROUP') || '',
              gstin: getReportText(customer, 'GSTIN') || '',
              trn: getReportText(customer, 'VAT_TRN_NUMBER') || '',
              city: '',
              state: getReportText(customer, 'STATE') || '',
              country: getReportText(customer, 'COUNTRY') || '',
              bill_by_bill: getReportText(customer, 'BILL_BY_BILL') || 'Yes',
              biller_id: billerId,
              current_balance: parseFloat(getReportText(customer, 'CURRENT_BALANCE')?.replace(/,/g, '') || '0'),
              current_balance_at: formattedBalanceAt,
              opening_balance: parseFloat(getReportText(customer, 'OPENING_BALANCE')?.replace(/,/g, '') || '0'),
              invoice_details: []
            };

            customersForApi.push(apiCustomer);
          }

          let apiSuccess = 0;
          let apiFailed = 0;

          for (let i = 0; i < customersForApi.length; i += API_BATCH_SIZE) {
            const chunk = customersForApi.slice(i, i + API_BATCH_SIZE);
            const payload = { "customer": chunk };
            try {
              await axios.post(CUSTOMER_API, payload, {
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
              db.log('ERROR', `Customer API batch failed (Incremental)`, { error: errorMsg });
            }
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
          }

          newMaxAlterId = String(maxAlterId);

          await db.updateSyncBatchStatus(
            batchId,
            apiFailed === 0 ? 'API_SUCCESS' : 'API_FAILED',
            customers.length,
            0,
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

    await db.logSyncEnd(runId, status, successCount, failedCount, newMaxAlterId, `${successCount} customers synced`);
    db.log('INFO', 'Customer sync completed', { success: successCount, failed: failedCount });

  } catch (error: any) {
    await db.logSyncEnd(runId, 'FAILED', successCount, failedCount, undefined, error.message);
    db.log('ERROR', 'Customer sync crashed', { error: error.message });
    throw error;
  }
}