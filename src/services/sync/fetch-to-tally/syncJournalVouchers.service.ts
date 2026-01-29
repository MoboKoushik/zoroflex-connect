// src/services/sync/fetch-to-tally/syncJournalVouchers.service.ts
import axios from 'axios';
import { DatabaseService, UserProfile } from '../../database/database.service';
import { getApiUrl } from '../../config/api-url-helper';
import { getApiKey } from '../../config/api-key-helper';
import {
  fetchJournalVouchersFromReportByDateRange,
  fetchJournalVouchersFromReportByAlterId,
  extractJournalVouchersFromReport,
  getReportText
} from '../../tally/batch-fetcher';

const ENTITY_TYPE = 'JOURNAL';
const API_BATCH_SIZE = 100; // Max 100 records per API call
const BATCH_DELAY_MS = 1000; // 1 second delay between API batches

/**
 * Generate monthly batches from date range
 */
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

  // If in DD-MMM-YY format (e.g., 10-Apr-25)
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

  // Return as is if no pattern matches
  return dateStr;
}

/**
 * Extract LEDGER_ENTRIES from JV_ENTRY
 */
function extractLedgerEntries(jvEntry: any): any[] {
  if (!jvEntry) return [];
  
  const ledgerEntries = jvEntry.LEDGER_ENTRIES;
  if (!ledgerEntries) return [];
  
  if (Array.isArray(ledgerEntries)) {
    return ledgerEntries;
  }
  
  return [ledgerEntries];
}

/**
 * Extract INVOICE_DETAILS from LEDGER_ENTRY
 */
function extractInvoiceDetails(ledgerEntry: any): any[] {
  if (!ledgerEntry || !ledgerEntry.INVOICE_DETAILS) return [];
  
  const invoiceDetails = ledgerEntry.INVOICE_DETAILS;
  if (Array.isArray(invoiceDetails)) {
    return invoiceDetails;
  }
  
  return [invoiceDetails];
}

export async function syncJournalVouchers(
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
    const JV_API = `${baseUrl}/ledgers/tally/jv-entries`;

    if (!apiKey) {
      throw new Error('API key not found. Please login again.');
    }

    db.log('INFO', 'Journal Voucher sync started', {
      sync_mode: syncMode,
      report: 'ZorrofinJV',
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
        db.log('INFO', `First sync: Processing ${monthlyBatches.length} months for Journal Vouchers`);
      }

      for (const monthBatch of monthlyBatches) {
        const { month, tallyFromDate, tallyToDate } = monthBatch;
        db.log('INFO', `Processing Journal Voucher month: ${month}`);

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
          const parsed = await fetchJournalVouchersFromReportByDateRange(tallyFromDate, tallyToDate);
          const jvEntries = extractJournalVouchersFromReport(parsed);

          if (jvEntries.length === 0) {
            await db.updateSyncBatchStatus(batchId, 'COMPLETED', 0);
            continue;
          }

          await db.updateSyncBatchStatus(batchId, 'FETCHED', jvEntries.length);

          const jvEntriesForApi: any[] = [];
          let monthMaxAlterId = 0;

          for (const jvEntry of jvEntries) {
            const alterId = parseInt(getReportText(jvEntry, 'ALTER_ID') || '0', 10);
            if (alterId > monthMaxAlterId) monthMaxAlterId = alterId;

            const master_id = getReportText(jvEntry, 'MASTER_ID');
            const voucherNumber = getReportText(jvEntry, 'VOUCHER_NUMBER');
            const refNumber = getReportText(jvEntry, 'REF_NUMBER') || '';
            const dateStr = getReportText(jvEntry, 'DATE');
            const refDateStr = getReportText(jvEntry, 'REF_DATE') || '';
            const narration = getReportText(jvEntry, 'NARRATION') || '';
            const entryType = getReportText(jvEntry, 'ENTRY_TYPE') || 'JVENTRY';

            // Extract and format ledger entries
            const ledgerEntriesArray = extractLedgerEntries(jvEntry);
            const formattedLedgerEntries: any[] = [];

            for (const ledgerEntry of ledgerEntriesArray) {
              // Extract invoice details if present
              const invoiceDetailsArray = extractInvoiceDetails(ledgerEntry);
              const formattedInvoiceDetails: any[] = [];

              for (const invoiceDetail of invoiceDetailsArray) {
                formattedInvoiceDetails.push({
                  invoice_number: getReportText(invoiceDetail, 'INVOICE_NUMBER') || '',
                  invoice_date: formatDate(getReportText(invoiceDetail, 'INVOICE_DATE') || ''),
                  amount: parseFloat(getReportText(invoiceDetail, 'AMOUNT') || '0')
                });
              }

              // All fields from XML with lowercase keys
              const formattedLedgerEntry: any = {
                customer_id: getReportText(ledgerEntry, 'CUSTOMER_ID') || '',
                ledgername: getReportText(ledgerEntry, 'LEDGERNAME') || '',
                parent: getReportText(ledgerEntry, 'PARENT') || '',
                ledgergroup: getReportText(ledgerEntry, 'LEDGERGROUP') || '',
                amount: parseFloat(getReportText(ledgerEntry, 'AMOUNT') || '0'),
                conversion_rate: parseFloat(getReportText(ledgerEntry, 'CONVERSATION_RATE') || '1'),
                currencysymbol: getReportText(ledgerEntry, 'CURRENCYSYMBOL') || '',
                currency: getReportText(ledgerEntry, 'CURRENCY') || 'INR',
                is_debit: getReportText(ledgerEntry, 'IS_DEBIT') === 'Yes',
                company_name: getReportText(ledgerEntry, 'LEDGERNAME') || ''
              };

              // Only add invoice_details if present
              if (formattedInvoiceDetails.length > 0) {
                formattedLedgerEntry.invoice_details = formattedInvoiceDetails;
              }

              formattedLedgerEntries.push(formattedLedgerEntry);
            }

            const jvData = {
              entry_type: entryType,
              transation_id: master_id,
              biller_id: profile?.biller_id || '',
              voucher_number: voucherNumber,
              ref_number: refNumber,
              date: formatDate(dateStr),
              ref_date: refDateStr ? formatDate(refDateStr) : '',
              narration: narration,
              ledger_entries: formattedLedgerEntries
            };

            jvEntriesForApi.push(jvData);
          }

          // Send to API in batches
          let apiSuccess = 0;
          let apiFailed = 0;

          for (let i = 0; i < jvEntriesForApi.length; i += API_BATCH_SIZE) {
            const chunk = jvEntriesForApi.slice(i, i + API_BATCH_SIZE);
            const payload = { "jv_entry": chunk };
            try {
              await axios.post(JV_API, payload, {
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
              db.log('ERROR', `Journal Voucher API batch failed (Month ${month})`, { error: errorMsg });
            }
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
          }

          newMaxAlterId = String(monthMaxAlterId);

          await db.updateSyncBatchStatus(
            batchId,
            apiFailed === 0 ? 'API_SUCCESS' : 'API_FAILED',
            jvEntries.length,
            jvEntries.length,
            apiSuccess,
            apiFailed > 0 ? `API failed for ${apiFailed} records` : undefined
          );

        } catch (error: any) {
          await db.updateSyncBatchStatus(batchId, 'API_FAILED', 0, 0, 0, error.message);
          db.log('ERROR', `Journal Voucher batch failed for month ${month}`, { error: error.message });
        }
      }
    } else {
      // INCREMENTAL SYNC: Using ALTER_ID only
      const lastAlterId = await db.getEntityMaxAlterId(ENTITY_TYPE);
      db.log('INFO', 'Starting incremental Journal Voucher sync', { from_alter_id: lastAlterId });

      const batchId = await db.createSyncBatch(runId, ENTITY_TYPE, 1, 0, lastAlterId, '');

      try {
        const parsed = await fetchJournalVouchersFromReportByAlterId(lastAlterId);
        const jvEntries = extractJournalVouchersFromReport(parsed);

        if (jvEntries.length === 0) {
          await db.updateSyncBatchStatus(batchId, 'COMPLETED', 0);
        } else {
          await db.updateSyncBatchStatus(batchId, 'FETCHED', jvEntries.length);

          const jvEntriesForApi: any[] = [];
          let maxAlterId = parseInt(lastAlterId || '0', 10);

          for (const jvEntry of jvEntries) {
            const alterId = parseInt(getReportText(jvEntry, 'ALTER_ID') || '0', 10);
            if (alterId > maxAlterId) maxAlterId = alterId;

            const master_id = getReportText(jvEntry, 'MASTER_ID');
            const voucherNumber = getReportText(jvEntry, 'VOUCHER_NUMBER');
            const refNumber = getReportText(jvEntry, 'REF_NUMBER') || '';
            const dateStr = getReportText(jvEntry, 'DATE');
            const refDateStr = getReportText(jvEntry, 'REF_DATE') || '';
            const narration = getReportText(jvEntry, 'NARRATION') || '';
            const entryType = getReportText(jvEntry, 'ENTRY_TYPE') || 'JVENTRY';

            // Extract and format ledger entries
            const ledgerEntriesArray = extractLedgerEntries(jvEntry);
            const formattedLedgerEntries: any[] = [];

            for (const ledgerEntry of ledgerEntriesArray) {
              // Extract invoice details if present
              const invoiceDetailsArray = extractInvoiceDetails(ledgerEntry);
              const formattedInvoiceDetails: any[] = [];

              for (const invoiceDetail of invoiceDetailsArray) {
                formattedInvoiceDetails.push({
                  invoice_number: getReportText(invoiceDetail, 'INVOICE_NUMBER') || '',
                  invoice_date: formatDate(getReportText(invoiceDetail, 'INVOICE_DATE') || ''),
                  amount: parseFloat(getReportText(invoiceDetail, 'AMOUNT') || '0')
                });
              }

              // All fields from XML with lowercase keys
              const formattedLedgerEntry: any = {
                customer_id: getReportText(ledgerEntry, 'CUSTOMER_ID') || '',
                ledgername: getReportText(ledgerEntry, 'LEDGERNAME') || '',
                parent: getReportText(ledgerEntry, 'PARENT') || '',
                ledgergroup: getReportText(ledgerEntry, 'LEDGERGROUP') || '',
                amount: parseFloat(getReportText(ledgerEntry, 'AMOUNT') || '0'),
                conversation_rate: parseFloat(getReportText(ledgerEntry, 'CONVERSATION_RATE') || '1'),
                currencysymbol: getReportText(ledgerEntry, 'CURRENCYSYMBOL') || '',
                currency: getReportText(ledgerEntry, 'CURRENCY') || 'INR',
                is_debit: getReportText(ledgerEntry, 'IS_DEBIT') === 'Yes',
                company_name: getReportText(ledgerEntry, 'LEDGERNAME') || ''
              };

              // Only add invoice_details if present
              if (formattedInvoiceDetails.length > 0) {
                formattedLedgerEntry.invoice_details = formattedInvoiceDetails;
              }

              formattedLedgerEntries.push(formattedLedgerEntry);
            }

            const jvData = {
              entry_type: entryType,
              transation_id: master_id,
              biller_id: profile?.biller_id || '',
              voucher_number: voucherNumber,
              ref_number: refNumber,
              date: formatDate(dateStr),
              ref_date: refDateStr ? formatDate(refDateStr) : '',
              narration: narration,
              ledger_entries: formattedLedgerEntries
            };

            jvEntriesForApi.push(jvData);
          }

          let apiSuccess = 0;
          let apiFailed = 0;

          for (let i = 0; i < jvEntriesForApi.length; i += API_BATCH_SIZE) {
            const chunk = jvEntriesForApi.slice(i, i + API_BATCH_SIZE);
            const payload = { "jv_entry": chunk };
            try {
              await axios.post(JV_API, payload, {
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
              db.log('ERROR', 'Journal Voucher API batch failed (incremental)', { error: errorMsg });
            }
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
          }

          newMaxAlterId = String(maxAlterId);

          await db.updateSyncBatchStatus(
            batchId,
            apiFailed === 0 ? 'API_SUCCESS' : 'API_FAILED',
            jvEntries.length,
            jvEntries.length,
            apiSuccess,
            apiFailed > 0 ? `API failed for ${apiFailed} records` : undefined
          );
        }
      } catch (error: any) {
        await db.updateSyncBatchStatus(batchId, 'API_FAILED', 0, 0, 0, error.message);
        db.log('ERROR', 'Journal Voucher incremental sync batch failed', { error: error.message });
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
        db.log('INFO', `JOURNAL first sync completed successfully, marked as complete`);
      }
    }

    await db.logSyncEnd(runId, status, successCount, failedCount, newMaxAlterId, `${successCount} Journal Vouchers synced`);
    db.log('INFO', 'Journal Voucher sync completed', { success: successCount, failed: failedCount });

  } catch (error: any) {
    await db.logSyncEnd(runId, 'FAILED', successCount, failedCount, undefined, error.message);
    db.log('ERROR', 'Journal Voucher sync crashed', { error: error.message });
    throw error;
  }
}
