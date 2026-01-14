// src/services/invoice/syncInvoices.service.ts
import axios from 'axios';
import { DatabaseService, UserProfile } from '../../database/database.service';
import { getApiUrl } from '../../config/api-url-helper';
import {
  fetchVouchersFromReportByDateRange,
  fetchVouchersFromReportByAlterId,
  extractInvoicesFromReport,
  getReportText
} from '../../tally/batch-fetcher';

const ENTITY_TYPE = 'INVOICE';
const API_KEY = '7061797A6F72726F74616C6C79';
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

export async function syncInvoices(
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
    const INVOICE_API = `${baseUrl}/invoice/tally/create`;

    db.log('INFO', 'Invoice sync started', {
      sync_mode: syncMode,
      report: 'ZeroFinnSales',
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
        db.log('INFO', `First sync: Processing ${monthlyBatches.length} months for invoices`);
      }

      for (const monthBatch of monthlyBatches) {
        const { month, tallyFromDate, tallyToDate } = monthBatch;
        db.log('INFO', `Processing invoice month: ${month}`);

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
          const parsed = await fetchVouchersFromReportByDateRange(tallyFromDate, tallyToDate, 'ZeroFinnSales');
          const invoices = extractInvoicesFromReport(parsed);

          if (invoices.length === 0) {
            await db.updateSyncBatchStatus(batchId, 'COMPLETED', 0);
            continue;
          }

          await db.updateSyncBatchStatus(batchId, 'FETCHED', invoices.length);

          const invoicesForApi: any[] = [];
          let monthMaxAlterId = 0;

          for (const invoice of invoices) {
            const alterId = parseInt(getReportText(invoice, 'ALTER_ID') || '0', 10);
            if (alterId > monthMaxAlterId) monthMaxAlterId = alterId;

            const issueDateStr = getReportText(invoice, 'ISSUE_DATE');
            const dueDateStr = getReportText(invoice, 'DUE_DATE');
            const formattedIssueDate = formatDate(issueDateStr);
            const formattedDueDate = calculateDueDate(issueDateStr, dueDateStr);

            const invoiceData = {
              invoice_id: getReportText(invoice, 'INVOICE_ID'),
              invoice_number: getReportText(invoice, 'INVOICE_NUMBER'),
              voucher_type: getReportText(invoice, 'VOUCHER_TYPE'),
              issue_date: formattedIssueDate,
              due_date: formattedDueDate,
              customer_id: getReportText(invoice, 'CUSTOMER_ID'),
              status: getReportText(invoice, 'STATUS'),
              type: getReportText(invoice, 'TYPE'),
              total: parseFloat(getReportText(invoice, 'TOTAL') || '0'),
              balance: parseFloat(getReportText(invoice, 'BALANCE') || '0'),
              biller_id: profile?.biller_id || '',
              address: getReportText(invoice, 'ADDRESS'),
              state: getReportText(invoice, 'STATE'),
              country: getReportText(invoice, 'COUNTRY'),
              company_name: getReportText(invoice, 'COMPANY_NAME'),
              Ewaybill_Num: getReportText(invoice, 'EWAYBILL_NUM'),
              Date: formatDate(getReportText(invoice, 'DATE')),
              DispatchFrom: getReportText(invoice, 'DISPATCHFROM'),
              Dispatchto: getReportText(invoice, 'DISPATCHTO'),
              TransporatName: getReportText(invoice, 'TRANSPORATNAME'),
              TransporatId: getReportText(invoice, 'TRANSPORATID'),
              Mode: getReportText(invoice, 'MODE'),
              LadingNo: getReportText(invoice, 'LADINGNO'),
              LadingDate: getReportText(invoice, 'LADINGDATE'),
              Vehicle_number: getReportText(invoice, 'VEHICLE_NUMBER'),
              Vehicle_type: getReportText(invoice, 'VEHICLE_TYPE'),
              Acknowledge_No: getReportText(invoice, 'ACKNOWLEDGE_NO'),
              Ack_Date: getReportText(invoice, 'ACK_DATE'),
              IRN: getReportText(invoice, 'IRN'),
              BilltoPlace: getReportText(invoice, 'BILLTOPLACE'),
              ShiptoPlace: getReportText(invoice, 'SHIPTOPLACE'),
              Inventory_Entries: getReportText(invoice, 'INVENTORY_ENTRIES') === 'Yes',
              Delivery_note_no: getReportText(invoice, 'DELIVERY_NOTE_NO')
            };

            invoicesForApi.push(invoiceData);
          }

          // Send to API in batches
          let apiSuccess = 0;
          let apiFailed = 0;

          for (let i = 0; i < invoicesForApi.length; i += API_BATCH_SIZE) {
            const chunk = invoicesForApi.slice(i, i + API_BATCH_SIZE);
            const payload = { "invoice": chunk };
            try {
              await axios.post(INVOICE_API, payload, {
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
              db.log('ERROR', `Invoice API batch failed (Month ${month})`, { error: errorMsg });
            }
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
          }

          newMaxAlterId = String(monthMaxAlterId);

          await db.updateSyncBatchStatus(
            batchId,
            apiFailed === 0 ? 'API_SUCCESS' : 'API_FAILED',
            invoices.length,
            invoices.length,
            apiSuccess,
            apiFailed > 0 ? `API failed for ${apiFailed} records` : undefined
          );

        } catch (error: any) {
          await db.updateSyncBatchStatus(batchId, 'API_FAILED', 0, 0, 0, error.message);
          db.log('ERROR', `Invoice batch failed for month ${month}`, { error: error.message });
        }
      }
    } else {
      // INCREMENTAL SYNC: Using ALTER_ID only
      const lastAlterId = await db.getEntityMaxAlterId(ENTITY_TYPE);
      db.log('INFO', 'Starting incremental invoice sync', { from_alter_id: lastAlterId });

      const batchId = await db.createSyncBatch(runId, ENTITY_TYPE, 1, 0, lastAlterId, '');

      try {
        const parsed = await fetchVouchersFromReportByAlterId(lastAlterId);
        const invoices = extractInvoicesFromReport(parsed);

        if (invoices.length === 0) {
          await db.updateSyncBatchStatus(batchId, 'COMPLETED', 0);
        } else {
          await db.updateSyncBatchStatus(batchId, 'FETCHED', invoices.length);

          const invoicesForApi: any[] = [];
          let maxAlterId = parseInt(lastAlterId || '0', 10);

          for (const invoice of invoices) {
            const alterId = parseInt(getReportText(invoice, 'ALTER_ID') || '0', 10);
            if (alterId > maxAlterId) maxAlterId = alterId;

            const issueDateStr = getReportText(invoice, 'ISSUE_DATE');
            const dueDateStr = getReportText(invoice, 'DUE_DATE');
            const formattedIssueDate = formatDate(issueDateStr);
            const formattedDueDate = calculateDueDate(issueDateStr, dueDateStr);

            const invoiceData = {
              invoice_id: getReportText(invoice, 'INVOICE_ID'),
              invoice_number: getReportText(invoice, 'INVOICE_NUMBER'),
              voucher_type: getReportText(invoice, 'VOUCHER_TYPE'),
              issue_date: formattedIssueDate,
              due_date: formattedDueDate,
              customer_id: getReportText(invoice, 'CUSTOMER_ID'),
              status: getReportText(invoice, 'STATUS'),
              type: getReportText(invoice, 'TYPE'),
              total: parseFloat(getReportText(invoice, 'TOTAL') || '0'),
              balance: parseFloat(getReportText(invoice, 'BALANCE') || '0'),
              biller_id: profile?.biller_id || '',
              address: getReportText(invoice, 'ADDRESS'),
              state: getReportText(invoice, 'STATE'),
              country: getReportText(invoice, 'COUNTRY'),
              company_name: getReportText(invoice, 'COMPANY_NAME'),
              Ewaybill_Num: getReportText(invoice, 'EWAYBILL_NUM'),
              Date: formatDate(getReportText(invoice, 'DATE')),
              DispatchFrom: getReportText(invoice, 'DISPATCHFROM'),
              Dispatchto: getReportText(invoice, 'DISPATCHTO'),
              TransporatName: getReportText(invoice, 'TRANSPORATNAME'),
              TransporatId: getReportText(invoice, 'TRANSPORATID'),
              Mode: getReportText(invoice, 'MODE'),
              LadingNo: getReportText(invoice, 'LADINGNO'),
              LadingDate: getReportText(invoice, 'LADINGDATE'),
              Vehicle_number: getReportText(invoice, 'VEHICLE_NUMBER'),
              Vehicle_type: getReportText(invoice, 'VEHICLE_TYPE'),
              Acknowledge_No: getReportText(invoice, 'ACKNOWLEDGE_NO'),
              Ack_Date: getReportText(invoice, 'ACK_DATE'),
              IRN: getReportText(invoice, 'IRN'),
              BilltoPlace: getReportText(invoice, 'BILLTOPLACE'),
              ShiptoPlace: getReportText(invoice, 'SHIPTOPLACE'),
              Inventory_Entries: getReportText(invoice, 'INVENTORY_ENTRIES') === 'Yes',
              Delivery_note_no: getReportText(invoice, 'DELIVERY_NOTE_NO')
            };

            invoicesForApi.push(invoiceData);
          }

          let apiSuccess = 0;
          let apiFailed = 0;

          for (let i = 0; i < invoicesForApi.length; i += API_BATCH_SIZE) {
            const chunk = invoicesForApi.slice(i, i + API_BATCH_SIZE);
            try {
              await axios.post(INVOICE_API, chunk, {
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
            invoices.length,
            invoices.length,
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
        db.log('INFO', `INVOICE first sync completed successfully, marked as complete`);
      }
    }

    await db.logSyncEnd(runId, status, successCount, failedCount, newMaxAlterId, `${successCount} invoices synced`);
    db.log('INFO', 'Invoice sync completed', { success: successCount, failed: failedCount });

  } catch (error: any) {
    await db.logSyncEnd(runId, 'FAILED', successCount, failedCount, undefined, error.message);
    db.log('ERROR', 'Invoice sync crashed', { error: error.message });
    throw error;
  }
}