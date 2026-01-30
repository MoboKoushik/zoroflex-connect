// src/services/sync/fetch-to-tally/syncDebitNotes.service.ts
import axios from 'axios';
import { DatabaseService, UserProfile } from '../../database/database.service';
import { getApiUrl } from '../../config/api-url-helper';
import { getApiKey } from '../../config/api-key-helper';
import {
  fetchVouchersFromReportByDateRange,
  fetchVouchersFromReportByAlterId,
  getReportText,
  getReportArray
} from '../../tally/batch-fetcher';

const ENTITY_TYPE = 'DEBITNOTE';
const API_BATCH_SIZE = 100; // Max 100 records per API call
const BATCH_DELAY_MS = 1000; // 1 second delay between API batches

/**
 * Extract DEBITNOTE array from ZorrofinDebitNote report response
 */
function extractDebitNotesFromReport(parsed: any): any[] {
  return parsed.VOUCHERS?.DEBITNOTE || [];
}

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

/**
 * Extract bill details from debit note (all fields lowercase)
 */
function extractBillDetails(debitNote: any): Array<{
  bill_id: string;
  bill_type: string;
  bill_creditperiod: string;
  bill_amount: string;
}> {
  const billDetails = getReportArray(debitNote, 'BILL_DETAILS');
  if (!billDetails || billDetails.length === 0) return [];

  return billDetails.map((bill: any) => ({
    bill_id: getReportText(bill, 'BILL_ID') || '',
    bill_type: getReportText(bill, 'BILL_TYPE') || '',
    bill_creditperiod: getReportText(bill, 'BILL_CREDITPERIOD') || '',
    bill_amount: getReportText(bill, 'BILL_AMOUNT') || '0'
  }));
}

/**
 * Extract ledger entries for API (all fields from Tally, lowercase keys)
 */
function extractLedgerEntries(debitNote: any): Array<{
  customer_id: string;
  ledgername: string;
  parent: string;
  ledgergroup: string;
  amount: string;
  conversation_rate: string;
  currencysymbol: string;
  currency: string;
  is_debit: string;
}> {
  const ledgerEntries = getReportArray(debitNote, 'LEDGER_ENTRIES');
  if (!ledgerEntries || ledgerEntries.length === 0) return [];

  return ledgerEntries.map((entry: any) => ({
    customer_id: getReportText(entry, 'CUSTOMER_ID') || '',
    ledgername: getReportText(entry, 'LEDGERNAME') || '',
    parent: getReportText(entry, 'PARENT') || '',
    ledgergroup: getReportText(entry, 'LEDGERGROUP') || '',
    amount: getReportText(entry, 'AMOUNT') || '0',
    conversation_rate: getReportText(entry, 'CONVERSATION_RATE') || '1',
    currencysymbol: getReportText(entry, 'CURRENCYSYMBOL') || '',
    currency: getReportText(entry, 'CURRENCY') || '',
    is_debit: getReportText(entry, 'IS_DEBIT') || ''
  }));
}

/**
 * Calculate due date from issue date (add 2 days if due date is not provided)
 */
function calculateDueDate(issueDateStr: string, dueDateStr?: string): string {
  if (dueDateStr && dueDateStr.trim() !== '') {
    return formatDate(dueDateStr);
  }

  if (!issueDateStr || issueDateStr.trim() === '') {
    return '';
  }

  // Parse issue date and add 2 days
  const formattedIssueDate = formatDate(issueDateStr);
  const parts = formattedIssueDate.split('-');
  if (parts.length === 3) {
    const [day, month, year] = parts;
    const issueDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    issueDate.setDate(issueDate.getDate() + 2);

    const dueDay = String(issueDate.getDate()).padStart(2, '0');
    const dueMonth = String(issueDate.getMonth() + 1).padStart(2, '0');
    const dueYear = issueDate.getFullYear();

    return `${dueDay}-${dueMonth}-${dueYear}`;
  }

  return formattedIssueDate; // Fallback to issue date if parsing fails
}

export async function syncDebitNotes(
  profile: UserProfile,
  syncMode: 'first' | 'incremental' = 'incremental',
  dateRangeFrom?: string,
  dateRangeTo?: string,
  dbService?: DatabaseService
): Promise<any> {
  // Use provided dbService or create default (for backward compatibility)
  const db = dbService || new DatabaseService();
  const runId = await db.logSyncStart('BACKGROUND', ENTITY_TYPE);
  let successCount = 0;
  let failedCount = 0;
  let newMaxAlterId = '0';

  try {
    const baseUrl = await getApiUrl(db);
    const apiKey = await getApiKey(db);
    const DEBITNOTE_API = `${baseUrl}/invoice/tally/debit-note/create`;

    if (!apiKey) {
      throw new Error('API key not found. Please login again.');
    }

    db.log('INFO', 'Debit Note sync started', {
      sync_mode: syncMode,
      report: 'ZorrofinDebitNote',
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
        db.log('INFO', `First sync: Processing ${monthlyBatches.length} months for debit notes`);
      }

      for (const monthBatch of monthlyBatches) {
        const { month, tallyFromDate, tallyToDate } = monthBatch;
        db.log('INFO', `Processing debit note month: ${month}`);

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
          const parsed = await fetchVouchersFromReportByDateRange(tallyFromDate, tallyToDate, 'ZorrofinDebitNote');
          const debitNotes = extractDebitNotesFromReport(parsed);

          if (debitNotes.length === 0) {
            await db.updateSyncBatchStatus(batchId, 'COMPLETED', 0);
            continue;
          }

          await db.updateSyncBatchStatus(batchId, 'FETCHED', debitNotes.length);

          const debitNotesForApi: any[] = [];
          let monthMaxAlterId = 0;

          for (const debitNote of debitNotes) {
            const alterId = parseInt(getReportText(debitNote, 'ALTER_ID') || '0', 10);
            if (alterId > monthMaxAlterId) monthMaxAlterId = alterId;

            const issueDateStr = getReportText(debitNote, 'ISSUE_DATE');
            const dueDateStr = getReportText(debitNote, 'DUE_DATE');
            const formattedIssueDate = formatDate(issueDateStr);
            const formattedDueDate = calculateDueDate(issueDateStr, dueDateStr);

            const debitNoteData: any = {
              invoice_id: getReportText(debitNote, 'INVOICE_ID'),
              invoice_number: getReportText(debitNote, 'INVOICE_NUMBER'),
              voucher_type: getReportText(debitNote, 'VOUCHER_TYPE') || 'credit_note', // Default to credit_note as per XML
              issue_date: formattedIssueDate,
              due_date: formattedDueDate,
              customer_id: getReportText(debitNote, 'CUSTOMER_ID') === "0" ? '' : getReportText(debitNote, 'CUSTOMER_ID'),
              status: getReportText(debitNote, 'STATUS'),
              type: getReportText(debitNote, 'TYPE') || 'simple',
              total: parseFloat(getReportText(debitNote, 'TOTAL') || '0'),
              balance: parseFloat(getReportText(debitNote, 'BALANCE') || '0'),
              biller_id: profile?.biller_id || '',
              address: getReportText(debitNote, 'ADDRESS'),
              state: getReportText(debitNote, 'STATE'),
              country: getReportText(debitNote, 'COUNTRY'),
              company_name: getReportText(debitNote, 'COMPANY_NAME'),
              date: formatDate(getReportText(debitNote, 'DATE') || issueDateStr),
              // Bill details
              bill_details: extractBillDetails(debitNote),
              // Ledger entries (all entries from Tally)
              Ledger_Entries: extractLedgerEntries(debitNote),
              // Inventory entries flag
              Inventory_Entries: getReportText(debitNote, 'INVENTORY_ENTRIES') === 'Yes',
              delivery_note_no: getReportText(debitNote, 'DELIVERY_NOTE_NO')
            };

            debitNotesForApi.push(debitNoteData);
          }

          // Send to API in batches
          let apiSuccess = 0;
          let apiFailed = 0;

          for (let i = 0; i < debitNotesForApi.length; i += API_BATCH_SIZE) {
            const chunk = debitNotesForApi.slice(i, i + API_BATCH_SIZE);
            const payload = { "debit_note": chunk };
            try {
              await axios.post(DEBITNOTE_API, payload, {
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
              db.log('ERROR', `Debit Note API batch failed (Month ${month})`, { error: errorMsg });
            }
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
          }

          newMaxAlterId = String(monthMaxAlterId);

          await db.updateSyncBatchStatus(
            batchId,
            apiFailed === 0 ? 'API_SUCCESS' : 'API_FAILED',
            debitNotes.length,
            debitNotes.length,
            apiSuccess,
            apiFailed > 0 ? `API failed for ${apiFailed} records` : undefined
          );

        } catch (error: any) {
          await db.updateSyncBatchStatus(batchId, 'API_FAILED', 0, 0, 0, error.message);
          db.log('ERROR', `Debit Note batch failed for month ${month}`, { error: error.message });
        }
      }
    } else {
      // INCREMENTAL SYNC: Using ALTER_ID only
      const lastAlterId = await db.getEntityMaxAlterId(ENTITY_TYPE);
      db.log('INFO', 'Starting incremental debit note sync', { from_alter_id: lastAlterId });

      const batchId = await db.createSyncBatch(runId, ENTITY_TYPE, 1, 0, lastAlterId, '');

      try {
        const parsed = await fetchVouchersFromReportByAlterId(lastAlterId, 'ZorrofinDebitNote');
        const debitNotes = extractDebitNotesFromReport(parsed);

        if (debitNotes.length === 0) {
          await db.updateSyncBatchStatus(batchId, 'COMPLETED', 0);
        } else {
          await db.updateSyncBatchStatus(batchId, 'FETCHED', debitNotes.length);

          const debitNotesForApi: any[] = [];
          let maxAlterId = parseInt(lastAlterId || '0', 10);

          for (const debitNote of debitNotes) {
            const alterId = parseInt(getReportText(debitNote, 'ALTER_ID') || '0', 10);
            if (alterId > maxAlterId) maxAlterId = alterId;

            const issueDateStr = getReportText(debitNote, 'ISSUE_DATE');
            const dueDateStr = getReportText(debitNote, 'DUE_DATE');
            const formattedIssueDate = formatDate(issueDateStr);
            const formattedDueDate = calculateDueDate(issueDateStr, dueDateStr);

            const debitNoteData: any = {
              invoice_id: getReportText(debitNote, 'INVOICE_ID'),
              invoice_number: getReportText(debitNote, 'INVOICE_NUMBER'),
              voucher_type: getReportText(debitNote, 'VOUCHER_TYPE') || 'credit_note',
              issue_date: formattedIssueDate,
              due_date: formattedDueDate,
              customer_id: getReportText(debitNote, 'CUSTOMER_ID'),
              status: getReportText(debitNote, 'STATUS'),
              type: getReportText(debitNote, 'TYPE') || 'simple',
              total: parseFloat(getReportText(debitNote, 'TOTAL') || '0'),
              balance: parseFloat(getReportText(debitNote, 'BALANCE') || '0'),
              biller_id: profile?.biller_id || '',
              address: getReportText(debitNote, 'ADDRESS'),
              state: getReportText(debitNote, 'STATE'),
              country: getReportText(debitNote, 'COUNTRY'),
              company_name: getReportText(debitNote, 'COMPANY_NAME'),
              date: formatDate(getReportText(debitNote, 'DATE') || issueDateStr),
              // Bill details
              bill_details: extractBillDetails(debitNote),
              // Ledger entries (all entries from Tally)
              Ledger_Entries: extractLedgerEntries(debitNote),
              // Inventory entries flag
              Inventory_Entries: getReportText(debitNote, 'INVENTORY_ENTRIES') === 'Yes',
              delivery_note_no: getReportText(debitNote, 'DELIVERY_NOTE_NO')
            };

            debitNotesForApi.push(debitNoteData);
          }

          let apiSuccess = 0;
          let apiFailed = 0;

          for (let i = 0; i < debitNotesForApi.length; i += API_BATCH_SIZE) {
            const chunk = debitNotesForApi.slice(i, i + API_BATCH_SIZE);
            const payload = { "debit_note": chunk };
            try {
              await axios.post(DEBITNOTE_API, payload, {
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
            debitNotes.length,
            debitNotes.length,
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
        db.log('INFO', `DEBITNOTE first sync completed successfully, marked as complete`);
      }
    }

    await db.logSyncEnd(runId, status, successCount, failedCount, newMaxAlterId, `${successCount} debit notes synced`);
    db.log('INFO', 'Debit Note sync completed', { success: successCount, failed: failedCount });

    return {
      successCount,
      failedCount,
      status,  // 'SUCCESS' | 'PARTIAL' | 'FAILED'
      maxAlterId: newMaxAlterId || '0'
    };

  } catch (error: any) {
    await db.logSyncEnd(runId, 'FAILED', successCount, failedCount, undefined, error.message);
    db.log('ERROR', 'Debit Note sync crashed', { error: error.message });
    const errorMessage = error?.message ||
      error?.response?.data?.message ||
      error?.stack?.split('\n')[0] ||  // first line of stack
      'Unknown sync error';
    return {
      successCount,
      failedCount,
      status: 'FAILED',  // 'SUCCESS' | 'PARTIAL' | 'FAILED'
      message: errorMessage,
      maxAlterId: newMaxAlterId || '0'
    };
  }
}
