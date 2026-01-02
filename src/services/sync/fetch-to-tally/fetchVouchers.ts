import axios from 'axios';
import { DatabaseService, UserProfile, VoucherData } from '../../database/database.service';
import { getApiUrl } from '../../config/api-url-helper';
import {
  fetchVouchersFromReportByDateRange,
  fetchVouchersFromReportByAlterId,
  extractInvoicesFromReport,
  extractReceiptsFromReport,
  getReportText
} from '../../tally/batch-fetcher';

const db = new DatabaseService();

const ENTITY_TYPE = 'VOUCHER';
const API_BATCH_SIZE = 20; // API batch size (for sending to API)
const BATCH_DELAY_MS = 2000; // Delay between batches


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
 * Format date from DD-MM-YYYY to YYYY-MM-DD
 */
function formatDate(dateStr: string): string {
  if (!dateStr || dateStr.trim() === '') return '';

  // Handle DD-MM-YYYY format (01-04-2023)
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [day, month, year] = parts;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Handle DD-Mon-YY format (14-Nov-25)
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

/**
 * Sync vouchers using ZeroFinnReceipt report (monthly batching for first sync)
 */
export async function syncVouchers(
  profile: UserProfile,
  syncMode: 'first' | 'incremental' = 'incremental',
  dateRangeFrom?: string,
  dateRangeTo?: string
): Promise<void> {
  const runId = await db.logSyncStart('BACKGROUND', ENTITY_TYPE);
  let successCount = { invoice: 0, receipt: 0 };
  let failedCount = { invoice: 0, receipt: 0 };
  let newMaxAlterId = '0';

  try {
    const baseUrl = await getApiUrl(db);
    const INVOICE_API = `${baseUrl}/invoice/tally/create`;
    const RECEIPT_API = `${baseUrl}/billers/tally/payment`;
    const apiToken = profile?.token || '';

    if (syncMode === 'first' && dateRangeFrom && dateRangeTo) {
      // ========== FIRST SYNC: Date Range with Monthly Batching ==========
      db.log('INFO', 'Starting FIRST voucher sync using ZeroFinnReceipt report', {
        from_date: dateRangeFrom,
        to_date: dateRangeTo
      });
      console.log(`Starting FIRST voucher sync with date range: ${dateRangeFrom} to ${dateRangeTo}`);

      const monthlyBatches = generateMonthlyBatches(dateRangeFrom, dateRangeTo);
      console.log(`Generated ${monthlyBatches.length} monthly batches for voucher sync`);

      for (const monthBatch of monthlyBatches) {
        console.log(`\n--- Processing Month: ${monthBatch.month} (${monthBatch.fromDate} to ${monthBatch.toDate}) ---`);

        const batchId = await db.createSyncBatch(
          runId,
          ENTITY_TYPE,
          1,
          0,
          '0',
          '',
          monthBatch.month,
          monthBatch.fromDate,
          monthBatch.toDate,
          'first_sync'
        );

        try {
          console.log(`Fetching vouchers from ZeroFinnReceipt report for ${monthBatch.month}`);

          const parsed = await fetchVouchersFromReportByDateRange(
            monthBatch.tallyFromDate,
            monthBatch.tallyToDate,
            'ZeroFinnReceipt'
          );

          const parsed_invoice = await fetchVouchersFromReportByDateRange(
            monthBatch.tallyFromDate,
            monthBatch.tallyToDate,
            'ZeroFinnSales'
          );

          const invoices = extractInvoicesFromReport(parsed_invoice);
          const receipts = extractReceiptsFromReport(parsed);

          console.log(`Fetched ${invoices.length} invoices and ${receipts.length} receipts for month ${monthBatch.month}`);

          if (invoices.length === 0 && receipts.length === 0) {
            await db.updateSyncBatchStatus(batchId, 'COMPLETED', 0);
            console.log(`No vouchers found for month ${monthBatch.month}`);
            continue;
          }

          await db.updateSyncBatchStatus(batchId, 'FETCHED', invoices.length + receipts.length);

          // Process and store invoices
          const invoicesForApi: any[] = [];
          let monthMaxAlterId = 0;

          for (const invoice of invoices) {
            const alterId = parseInt(getReportText(invoice, 'ALTER_ID') || '0', 10);
            if (alterId > monthMaxAlterId) monthMaxAlterId = alterId;

            const invoiceId = getReportText(invoice, 'INVOICE_ID');
            const customerId = getReportText(invoice, 'CUSTOMER_ID');
            const voucherNumber = getReportText(invoice, 'INVOICE_NUMBER');
            const voucherType = getReportText(invoice, 'VOUCHER_TYPE');
            const issueDate = formatDate(getReportText(invoice, 'ISSUE_DATE'));
            const total = parseFloat(getReportText(invoice, 'TOTAL') || '0');
            const billerId = profile?.biller_id || '';

            // Store in SQLite
            const voucherData: VoucherData = {
              tally_master_id: invoiceId,
              voucher_number: voucherNumber,
              voucher_type: voucherType,
              voucher_date: issueDate,
              party_ledger_name: '',
              customer_master_id: customerId || undefined,
              total_amount: total,
              biller_id: billerId,
              address: getReportText(invoice, 'ADDRESS') || undefined,
              state: getReportText(invoice, 'STATE') || undefined,
              country: getReportText(invoice, 'COUNTRY') || 'India',
              company_name: getReportText(invoice, 'COMPANY_NAME') || undefined,
              narration: undefined,
              tally_alter_id: String(alterId),
              voucher_data_json: JSON.stringify(invoice),
              synced_to_api: 0
            };

            await db.insertVoucher(voucherData);

            // Prepare for API (convert XML structure to API format)
            const apiInvoice = {
              invoice_id: invoiceId,
              invoice_number: voucherNumber,
              voucher_type: voucherType,
              issue_date: issueDate,
              due_date: formatDate(getReportText(invoice, 'DUE_DATE')),
              customer_id: customerId,
              status: getReportText(invoice, 'STATUS'),
              type: getReportText(invoice, 'TYPE'),
              total: total,
              balance: parseFloat(getReportText(invoice, 'BALANCE') || '0'),
              biller_id: billerId,
              address: getReportText(invoice, 'ADDRESS'),
              state: getReportText(invoice, 'STATE'),
              country: getReportText(invoice, 'COUNTRY'),
              company_name: getReportText(invoice, 'COMPANY_NAME'),
              Ewaybill_Num: getReportText(invoice, 'EWAYBILL_NUM'),
              Date: formatDate(getReportText(invoice, 'DATE')),
              "DispatchFrom ": getReportText(invoice, 'DISPATCHFROM'),
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
              "Ship to Place": getReportText(invoice, 'SHIPTOPLACE'),
              bill_details: parseBillDetails(invoice['BILL_DETAILS']),
              Ledger_Entries: parseLedgerEntries(invoice['LEDGER_ENTRIES']),
              Inventory_Entries: getReportText(invoice, 'INVENTORY_ENTRIES') === 'Yes',
              Order_NUmber: '',
              Delivery_note_no: getReportText(invoice, 'DELIVERY_NOTE_NO'),
              Inventory_Details: parseInventoryDetails(invoice['INVENTORY'])
            };

            invoicesForApi.push(apiInvoice);
          }

          // Process and store receipts
          const receiptsForApi: any[] = [];

          for (const receipt of receipts) {
            const alterId = parseInt(getReportText(receipt, 'ALTER_ID') || '0', 10);
            if (alterId > monthMaxAlterId) monthMaxAlterId = alterId;

            const receiptId = getReportText(receipt, 'RECEIPT_ID');
            const customerId = getReportText(receipt, 'CUSTOMER_ID');
            const receiptNumber = getReportText(receipt, 'RECEIPT_NUMBER');
            const receiptDate = formatDate(getReportText(receipt, 'RECEIPT_DATE'));
            const amount = parseFloat(getReportText(receipt, 'RECEIPT_AMOUNT') || '0');
            const billerId = profile?.biller_id || '';

            // Store in SQLite
            const voucherData: VoucherData = {
              tally_master_id: receiptId,
              voucher_number: receiptNumber,
              voucher_type: 'receipt',
              voucher_date: receiptDate,
              party_ledger_name: getReportText(receipt, 'CUSTOMER_NAME'),
              customer_master_id: customerId || undefined,
              total_amount: amount,
              biller_id: billerId,
              narration: undefined,
              tally_alter_id: String(alterId),
              voucher_data_json: JSON.stringify(receipt),
              synced_to_api: 0
            };

            await db.insertVoucher(voucherData);

            // Prepare for API
            const apiReceipt = {
              invoice_id: receiptId,
              receipt_number: receiptNumber,
              customer_id: customerId,
              receipt_date: receiptDate,
              amount: amount,
              payment_mode: getReportText(receipt, 'TRANSACTION_TYPE'),
              bills: parseBillDetails(receipt['BILL_DETAILS']),
              notes: '',
              biller_id: billerId
            };

            receiptsForApi.push(apiReceipt);
          }

          // Send invoices to API in batches
          let invoiceSuccess = 0;
          let invoiceFailed = 0;

          if (invoicesForApi.length > 0) {
            const invoiceChunks = [];
            for (let i = 0; i < invoicesForApi.length; i += API_BATCH_SIZE) {
              invoiceChunks.push(invoicesForApi.slice(i, i + API_BATCH_SIZE));
            }

            for (const chunk of invoiceChunks) {
              try {
                await axios.post(INVOICE_API, chunk, {
                  headers: { Authorization: `Bearer ${apiToken}` }
                });
                invoiceSuccess += chunk.length;
              } catch (error: any) {
                invoiceFailed += chunk.length;
                db.log('ERROR', 'Invoice API failed', { error: error.message });
              }
              await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
            }
          }

          // Send receipts to API in batches
          let receiptSuccess = 0;
          let receiptFailed = 0;

          if (receiptsForApi.length > 0) {
            const receiptChunks = [];
            for (let i = 0; i < receiptsForApi.length; i += API_BATCH_SIZE) {
              receiptChunks.push(receiptsForApi.slice(i, i + API_BATCH_SIZE));
            }

            for (const chunk of receiptChunks) {
              try {
                await axios.post(RECEIPT_API, chunk, {
                  headers: { Authorization: `Bearer ${apiToken}` }
                });
                receiptSuccess += chunk.length;
              } catch (error: any) {
                receiptFailed += chunk.length;
                db.log('ERROR', 'Receipt API failed', { error: error.message });
              }
              await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
            }
          }

          successCount.invoice += invoiceSuccess;
          successCount.receipt += receiptSuccess;
          failedCount.invoice += invoiceFailed;
          failedCount.receipt += receiptFailed;

          newMaxAlterId = String(monthMaxAlterId);

          await db.updateSyncBatchStatus(
            batchId,
            'COMPLETED',
            invoices.length + receipts.length,
            invoiceSuccess + receiptSuccess,
            invoiceFailed + receiptFailed
          );

          console.log(`Completed month ${monthBatch.month}: ${invoiceSuccess + receiptSuccess} synced, ${invoiceFailed + receiptFailed} failed`);

        } catch (error: any) {
          await db.updateSyncBatchStatus(batchId, 'API_FAILED', 0, 0, 0, error.message);
          db.log('ERROR', `Voucher batch ${monthBatch.month} failed`, { error: error.message });
        }
      }

      console.log('\n--- First voucher sync completed ---');

    } else {
      // ========== INCREMENTAL SYNC: ALTER_ID Only ==========
      const lastAlterId = await db.getEntityMaxAlterId(ENTITY_TYPE);
      db.log('INFO', 'Starting incremental voucher sync using ZeroFinnReceipt report', {
        from_alter_id: lastAlterId
      });
      console.log(`Starting incremental voucher sync from ALTER_ID > ${lastAlterId}`);

      const batchId = await db.createSyncBatch(
        runId,
        ENTITY_TYPE,
        1,
        0,
        lastAlterId,
        '',
        undefined,
        undefined,
        undefined,
        'incremental'
      );

      try {
        console.log(`Fetching vouchers from ZeroFinnReceipt report with ALTER_ID > ${lastAlterId}`);

        const parsed = await fetchVouchersFromReportByAlterId(lastAlterId);

        const invoices = extractInvoicesFromReport(parsed);
        const receipts = extractReceiptsFromReport(parsed);

        console.log(`Fetched ${invoices.length} invoices and ${receipts.length} receipts`);

        if (invoices.length === 0 && receipts.length === 0) {
          await db.updateSyncBatchStatus(batchId, 'COMPLETED', 0);
          console.log('No new vouchers found');
        } else {
          await db.updateSyncBatchStatus(batchId, 'FETCHED', invoices.length + receipts.length);

          // Process and store invoices
          const invoicesForApi: any[] = [];
          let maxAlterId = parseInt(lastAlterId || '0', 10);

          for (const invoice of invoices) {
            const alterId = parseInt(getReportText(invoice, 'ALTER_ID') || '0', 10);
            if (alterId > maxAlterId) maxAlterId = alterId;

            const invoiceId = getReportText(invoice, 'INVOICE_ID');
            const customerId = getReportText(invoice, 'CUSTOMER_ID');
            const voucherNumber = getReportText(invoice, 'INVOICE_NUMBER');
            const voucherType = getReportText(invoice, 'VOUCHER_TYPE');
            const issueDate = formatDate(getReportText(invoice, 'ISSUE_DATE'));
            const total = parseFloat(getReportText(invoice, 'TOTAL') || '0');
            const billerId = profile?.biller_id || '';

            // Store in SQLite
            const voucherData: VoucherData = {
              tally_master_id: invoiceId,
              voucher_number: voucherNumber,
              voucher_type: voucherType,
              voucher_date: issueDate,
              party_ledger_name: '',
              customer_master_id: customerId || undefined,
              total_amount: total,
              biller_id: billerId,
              address: getReportText(invoice, 'ADDRESS') || undefined,
              state: getReportText(invoice, 'STATE') || undefined,
              country: getReportText(invoice, 'COUNTRY') || 'India',
              company_name: getReportText(invoice, 'COMPANY_NAME') || undefined,
              narration: undefined,
              tally_alter_id: String(alterId),
              voucher_data_json: JSON.stringify(invoice),
              synced_to_api: 0
            };

            await db.insertVoucher(voucherData);

            // Prepare for API
            const apiInvoice = {
              invoice_id: invoiceId,
              invoice_number: voucherNumber,
              voucher_type: voucherType,
              issue_date: issueDate,
              due_date: formatDate(getReportText(invoice, 'DUE_DATE')),
              customer_id: customerId,
              status: getReportText(invoice, 'STATUS'),
              type: getReportText(invoice, 'TYPE'),
              total: total,
              balance: parseFloat(getReportText(invoice, 'BALANCE') || '0'),
              biller_id: billerId,
              address: getReportText(invoice, 'ADDRESS'),
              state: getReportText(invoice, 'STATE'),
              country: getReportText(invoice, 'COUNTRY'),
              company_name: getReportText(invoice, 'COMPANY_NAME'),
              Ewaybill_Num: getReportText(invoice, 'EWAYBILL_NUM'),
              Date: formatDate(getReportText(invoice, 'DATE')),
              "DispatchFrom ": getReportText(invoice, 'DISPATCHFROM'),
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
              "Ship to Place": getReportText(invoice, 'SHIPTOPLACE'),
              bill_details: parseBillDetails(invoice['BILL_DETAILS']),
              Ledger_Entries: parseLedgerEntries(invoice['LEDGER_ENTRIES']),
              Inventory_Entries: getReportText(invoice, 'INVENTORY_ENTRIES') === 'Yes',
              Order_NUmber: '',
              Delivery_note_no: getReportText(invoice, 'DELIVERY_NOTE_NO'),
              Inventory_Details: parseInventoryDetails(invoice['INVENTORY'])
            };

            invoicesForApi.push(apiInvoice);
          }

          // Process and store receipts
          const receiptsForApi: any[] = [];

          for (const receipt of receipts) {
            const alterId = parseInt(getReportText(receipt, 'ALTER_ID') || '0', 10);
            if (alterId > maxAlterId) maxAlterId = alterId;

            const receiptId = getReportText(receipt, 'RECEIPT_ID');
            const customerId = getReportText(receipt, 'CUSTOMER_ID');
            const receiptNumber = getReportText(receipt, 'RECEIPT_NUMBER');
            const receiptDate = formatDate(getReportText(receipt, 'RECEIPT_DATE'));
            const amount = parseFloat(getReportText(receipt, 'RECEIPT_AMOUNT') || '0');
            const billerId = profile?.biller_id || '';

            // Store in SQLite
            const voucherData: VoucherData = {
              tally_master_id: receiptId,
              voucher_number: receiptNumber,
              voucher_type: 'receipt',
              voucher_date: receiptDate,
              party_ledger_name: getReportText(receipt, 'CUSTOMER_NAME'),
              customer_master_id: customerId || undefined,
              total_amount: amount,
              biller_id: billerId,
              narration: undefined,
              tally_alter_id: String(alterId),
              voucher_data_json: JSON.stringify(receipt),
              synced_to_api: 0
            };

            await db.insertVoucher(voucherData);

            // Prepare for API
            const apiReceipt = {
              invoice_id: receiptId,
              receipt_number: receiptNumber,
              customer_id: customerId,
              receipt_date: receiptDate,
              amount: amount,
              payment_mode: getReportText(receipt, 'TRANSACTION_TYPE'),
              bills: parseBillDetails(receipt['BILL_DETAILS']),
              notes: '',
              biller_id: billerId
            };

            receiptsForApi.push(apiReceipt);
          }

          // Send invoices to API in batches
          let invoiceSuccess = 0;
          let invoiceFailed = 0;

          if (invoicesForApi.length > 0) {
            const invoiceChunks = [];
            for (let i = 0; i < invoicesForApi.length; i += API_BATCH_SIZE) {
              invoiceChunks.push(invoicesForApi.slice(i, i + API_BATCH_SIZE));
            }

            for (const chunk of invoiceChunks) {
              try {
                await axios.post(INVOICE_API, chunk, {
                  headers: { Authorization: `Bearer ${apiToken}` }
                });
                invoiceSuccess += chunk.length;
              } catch (error: any) {
                invoiceFailed += chunk.length;
                db.log('ERROR', 'Invoice API failed (incremental)', { error: error.message });
              }
              await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
            }
          }

          // Send receipts to API in batches
          let receiptSuccess = 0;
          let receiptFailed = 0;

          if (receiptsForApi.length > 0) {
            const receiptChunks = [];
            for (let i = 0; i < receiptsForApi.length; i += API_BATCH_SIZE) {
              receiptChunks.push(receiptsForApi.slice(i, i + API_BATCH_SIZE));
            }

            for (const chunk of receiptChunks) {
              try {
                await axios.post(RECEIPT_API, chunk, {
                  headers: { Authorization: `Bearer ${apiToken}` }
                });
                receiptSuccess += chunk.length;
              } catch (error: any) {
                receiptFailed += chunk.length;
                db.log('ERROR', 'Receipt API failed (incremental)', { error: error.message });
              }
              await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
            }
          }

          successCount.invoice += invoiceSuccess;
          successCount.receipt += receiptSuccess;
          failedCount.invoice += invoiceFailed;
          failedCount.receipt += receiptFailed;

          newMaxAlterId = String(maxAlterId);

          await db.updateSyncBatchStatus(
            batchId,
            'COMPLETED',
            invoices.length + receipts.length,
            invoiceSuccess + receiptSuccess,
            invoiceFailed + receiptFailed
          );

          console.log(`Incremental sync completed: ${invoiceSuccess + receiptSuccess} synced, ${invoiceFailed + receiptFailed} failed`);
        }

      } catch (error: any) {
        await db.updateSyncBatchStatus(batchId, 'API_FAILED', 0, 0, 0, error.message);
        db.log('ERROR', 'Incremental voucher sync failed', { error: error.message });
      }

      console.log('\n--- Incremental voucher sync completed ---');
    }

    const totalSuccess = successCount.invoice + successCount.receipt;
    const totalFailed = failedCount.invoice + failedCount.receipt;
    const status = totalFailed === 0 ? 'SUCCESS' : (totalSuccess > 0 ? 'PARTIAL' : 'FAILED');

    if (totalSuccess > 0 || newMaxAlterId !== '0') {
      await db.updateEntityMaxAlterId(ENTITY_TYPE, newMaxAlterId);
    }

    await db.logSyncEnd(runId, status, totalSuccess, totalFailed, newMaxAlterId, `${totalSuccess} synced`, {
      invoice: { success: successCount.invoice, failed: failedCount.invoice },
      receipt: { success: successCount.receipt, failed: failedCount.receipt }
    });
    await db.updateLastSuccessfulSync();

    db.log('INFO', 'Voucher sync completed', {
      totalSuccess,
      totalFailed,
      highest_alter_id: newMaxAlterId
    });

  } catch (error: any) {
    await db.logSyncEnd(runId, 'FAILED', 0, 0, undefined, error.message);
    db.log('ERROR', 'Voucher sync crashed', { error: error.message });
    throw error;
  }
}

// Helper methods to parse report XML structures
function parseBillDetails(billDetails: any): any[] {
  if (!billDetails || !Array.isArray(billDetails)) return [];

  return billDetails.map((bill: any) => ({
    bill_id: getReportText(bill, 'BILL_ID'),
    bill_type: getReportText(bill, 'BILL_TYPE'),
    bill_creditperiod: getReportText(bill, 'BILL_CREDITPERIOD'),
    bill_amount: parseFloat(getReportText(bill, 'BILL_AMOUNT') || '0')
  }));
}

function parseLedgerEntries(ledgerEntries: any): any[] {
  if (!ledgerEntries || !Array.isArray(ledgerEntries)) return [];

  return ledgerEntries.map((entry: any) => ({
    Ledger_Name: getReportText(entry, 'LEDGERNAME'),
    Parent: getReportText(entry, 'PARENT'),
    IsPartyLedger: getReportText(entry, 'ISPARTYLEDGER'),
    Amount: parseFloat(getReportText(entry, 'AMOUNT') || '0'),
    AmountDrCr: getReportText(entry, 'AMOUNTDRCR')
  }));
}

function parseInventoryDetails(inventory: any): any[] {
  if (!inventory || !Array.isArray(inventory)) return [];

  return inventory.map((item: any) => {
    const batchAlloc = item['BATCH_ALLOCATION'];
    return {
      StockItem_Name: getReportText(item, 'STOCKITEM_NAME'),
      Quantity: parseFloat(getReportText(item, 'QUANTITY') || '0'),
      AltQuantity: parseFloat(getReportText(item, 'ACTUALQUANTITY') || '0'),
      Rate: parseFloat(getReportText(item, 'RATE') || '0'),
      UOM: getReportText(item, 'UOM'),
      AlterbativeUnit: getReportText(item, 'ALTERBATIVEUNIT'),
      Amount: parseFloat(getReportText(item, 'AMOUNT') || '0'),
      GST_perc: getReportText(item, 'GST_PERC'),
      Discount: getReportText(item, 'DISCOUNT'),
      Batch_Allocation: batchAlloc ? [{
        Godown_Name: getReportText(batchAlloc, 'GODOWN_NAME'),
        Batch_Name: getReportText(batchAlloc, 'BATCH_NAME'),
        MfgDate: getReportText(batchAlloc, 'MFGDATE'),
        Quantity: parseFloat(getReportText(batchAlloc, 'QUANTITY') || '0'),
        ActualQuantity: parseFloat(getReportText(batchAlloc, 'ACTUALQUANTITY') || '0'),
        DueDate: getReportText(batchAlloc, 'DUEDATE'),
        Order_Number: getReportText(batchAlloc, 'ORDER_NUMBER'),
        Tracking_Number: getReportText(batchAlloc, 'TRACKING_NUMBER')
      }] : []
    };
  });
}
