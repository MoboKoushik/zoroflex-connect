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

const ENTITY_TYPE = 'CUSTOMER';
const API_KEY = '7061797A6F72726F74616C6C79';
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
    const CUSTOMER_API = `${baseUrl}/customer/tally/create`;

    db.log('INFO', 'Customer sync started', {
      sync_mode: syncMode,
      report: 'ZorrofinCust',
      date_range: dateRangeFrom && dateRangeTo ? `${dateRangeFrom} to ${dateRangeTo}` : 'none'
    });

    if (syncMode === 'first' && dateRangeFrom && dateRangeTo) {
      // FIRST/FRESH SYNC: Fetch all data from date range in one batch
      db.log('INFO', `Fresh sync: Fetching all customers from ${dateRangeFrom} to ${dateRangeTo}`);

      // Convert dates to Tally format (YYYYMMDD)
      const tallyFromDate = dateRangeFrom.replace(/-/g, '');
      const tallyToDate = dateRangeTo.replace(/-/g, '');

      const batchId = await db.createSyncBatch(
        runId,
        ENTITY_TYPE,
        1,
        0,
        '0',
        '',
        `${dateRangeFrom}_to_${dateRangeTo}`,
        dateRangeFrom,
        dateRangeTo,
        'first_sync'
      );

      try {
        // Fetch all customers in one go
        const parsed = await fetchCustomersFromReportByDateRange(tallyFromDate, tallyToDate);
        const customers = extractCustomersFromReport(parsed);

        if (customers.length === 0) {
          await db.updateSyncBatchStatus(batchId, 'COMPLETED', 0);
          db.log('INFO', 'No customers found in date range');
        } else {
          await db.updateSyncBatchStatus(batchId, 'FETCHED', customers.length);
          db.log('INFO', `Fetched ${customers.length} customers, preparing for batch API sync`);

          const customersForApi: any[] = [];
          let maxAlterId = 0;
          let alterIdFound = false;

          // Process all customers and prepare for API
          for (const customer of customers) {
            const alterIdStr = getReportText(customer, 'ALTER_ID') || getReportText(customer, 'ALTERID') || '0';
            const alterId = parseInt(alterIdStr, 10);
            if (alterId > 0) {
              alterIdFound = true;
              if (alterId > maxAlterId) maxAlterId = alterId;
            }

            const customerId = getReportText(customer, 'CUSTOMER_ID');
            const name = getReportText(customer, 'NAME');
            // const currentBalanceAt = getReportText(customer, 'CURRENT_BALANCE_AT');

            const xmlBillerId = getReportText(customer, 'BILLER_ID');
            const billerId = xmlBillerId || profile?.biller_id || '';

            const invoiceDetails: Array<{ invoice_number: string; invoice_date: string; amount: number }> = [];

            const invoiceNodes = customer.INVOICE_DETAILS || [];
            const invoices = Array.isArray(invoiceNodes) ? invoiceNodes : [invoiceNodes];

            for (const inv of invoices) {
              if (!inv || typeof inv !== 'object') {
                continue;
              }

              const invoiceNumber = getReportText(inv, 'INVOICE_NUMBER') || '';
              if (!invoiceNumber.trim()) {
                continue;
              }

              const dateRaw = getReportText(inv, 'INVOICE_DATE') || '';
              let invoiceDate = formatDate(dateRaw);

              const amountRaw = getReportText(inv, 'AMOUNT') || '0';
              const amount = parseFloat(amountRaw.replace(/,/g, '')) || 0;

              invoiceDetails.push({
                invoice_number: invoiceNumber,
                invoice_date: invoiceDate,
                amount: amount
              });
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
              current_balance: parseFloat(getReportText(customer, 'CURRENT_BALANCE') || '0'),
              current_balance_at: getReportText(customer, 'CURRENT_BALANCE_AT'),
              opening_balance: parseFloat(getReportText(customer, 'OPENING_BALANCE') || '0'),
              invoice_details: invoiceDetails
            };

            customersForApi.push(apiCustomer);
          }

          newMaxAlterId = String(maxAlterId);

          // Log warning if ALTER_ID not found in any customer
          if (!alterIdFound && customers.length > 0) {
            db.log('WARN', `ALTER_ID not found in Tally response for any customer. This may cause issues with incremental sync.`);
            db.log('WARN', `Sample customer keys: ${Object.keys(customers[0] || {}).join(', ')}`);
          }

          // Send all customers to API in batches
          let apiSuccess = 0;
          let apiFailed = 0;

          db.log('INFO', `Sending ${customersForApi.length} customers to API in batches of ${API_BATCH_SIZE}`);

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
              db.log('INFO', `Sent batch ${Math.floor(i / API_BATCH_SIZE) + 1}: ${chunk.length} customers`);
            } catch (err: any) {
              apiFailed += chunk.length;
              failedCount += chunk.length;
              const errorMsg = err.response?.data || err.message || 'Unknown error';
              db.log('ERROR', `Customer API batch failed`, {
                batch: Math.floor(i / API_BATCH_SIZE) + 1,
                error: errorMsg
              });
            }
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
          }

          await db.updateSyncBatchStatus(
            batchId,
            apiFailed === 0 ? 'API_SUCCESS' : 'API_FAILED',
            customers.length,
            0,
            apiSuccess,
            apiFailed > 0 ? `API failed for ${apiFailed} records` : undefined
          );

          db.log('INFO', `Fresh sync completed: ${apiSuccess} succeeded, ${apiFailed} failed`);
        }
      } catch (error: any) {
        await db.updateSyncBatchStatus(batchId, 'API_FAILED', 0, 0, 0, error.message);
        db.log('ERROR', `Customer fresh sync failed`, { error: error.message });
      }
    } else {
      // INCREMENTAL SYNC: Using ALTER_ID only
      const lastAlterId = await db.getEntityMaxAlterId(ENTITY_TYPE);

      // If max alter id is 0 or empty, it means first sync didn't properly store alter ids
      // In this case, we should not do incremental sync - it would fetch all data
      if (!lastAlterId || lastAlterId === '0') {
        db.log('WARN', 'Cannot do incremental sync: max alter id is 0. First sync may not have stored alter ids properly.');
        await db.logSyncEnd(runId, 'FAILED', 0, 0, '0', 'Cannot do incremental sync: max alter id is 0. Please run first sync again.');
        return;
      }

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
            // Try to get ALTER_ID if available (may not be in ZorrofinCust report response)
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

    // Update max alter id if we have records synced
    // For first sync, we MUST update max alter id even if it's 0 (to mark first sync as attempted)
    // For incremental sync, only update if we have a valid alter id
    if (syncMode === 'first') {
      // Always update for first sync, even if alter id is 0
      // This ensures we can track that first sync was attempted
      await db.updateEntityMaxAlterId(ENTITY_TYPE, newMaxAlterId);
      if (newMaxAlterId !== '0') {
        db.log('INFO', `Updated max alter id for ${ENTITY_TYPE} after first sync: ${newMaxAlterId}`);
      } else {
        db.log('WARN', `Max alter id is 0 after first sync. ALTER_ID may not be available in Tally ZorrofinCust report.`);
        db.log('WARN', `This will prevent incremental sync. Please check if ALTER_ID field is available in Tally response.`);
      }
    } else {
      // For incremental sync, only update if we have records synced OR if we have a valid alter id
      if (successCount > 0 || newMaxAlterId !== '0') {
        await db.updateEntityMaxAlterId(ENTITY_TYPE, newMaxAlterId);
        if (newMaxAlterId !== '0') {
          db.log('INFO', `Updated max alter id for ${ENTITY_TYPE}: ${newMaxAlterId}`);
        } else {
          db.log('WARN', `Max alter id is 0. ALTER_ID may not be available in Tally response.`);
        }
      }
    }

    // After successful first sync, check if entity should be marked as complete
    if (syncMode === 'first' && successCount > 0) {
      const incompleteBatches = await db.getIncompleteSyncBatches(ENTITY_TYPE);
      if (incompleteBatches.length === 0) {
        await db.completeEntityFirstSync(ENTITY_TYPE);
        db.log('INFO', `CUSTOMER first sync completed successfully, marked as complete`);
      }
    }

    await db.logSyncEnd(runId, status, successCount, failedCount, newMaxAlterId, `${successCount} customers synced`);
    db.log('INFO', 'Customer sync completed', { success: successCount, failed: failedCount });

  } catch (error: any) {
    await db.logSyncEnd(runId, 'FAILED', successCount, failedCount, undefined, error.message);
    db.log('ERROR', 'Customer sync crashed', { error: error.message });
    throw error;
  }
}