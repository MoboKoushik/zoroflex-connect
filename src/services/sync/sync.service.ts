// src/services/sync.service.ts

import * as odbc from 'odbc';
import axios from 'axios';
import { DatabaseService, UserProfile } from '../database/database.service';
import { fetchFullInvoices } from './invoiceFullService';
import { fetchFromTally, XML_COMPANY_LIST } from "./tallyClient";
// import { fetchAllLedgers } from './fetchLedgers';
import { fetchAllVouchers } from './fetchAllVouchers';
import { fetchAllVouchersODBC } from './fetchVouchersODBC';
import { fetchReceipts } from './fetchReceiptsXML';
import { fetchAllLedgers } from './fetchLedgers';
import { fetchAllLedgersOpening } from './fetchLedegerOpeningAndCurrentBalence';
import { fetchAllCompanies } from './fetchAllCompanies';

const BASE_URL = 'http://localhost:3000';
const API_KEY = '7061797A6F72726F74616C6C79';
const BATCH_SIZE = 20;

export class SyncService {
  private dbService: DatabaseService;
  private isRunning = false;
  private connectionString = 'DSN=TallyODBC64_9000;UID=;PWD=;';

  constructor(dbService: DatabaseService) {
    this.dbService = dbService;
  }

  // ORGANIZATION SYNC
  private async syncOrganization(profile: UserProfile): Promise<void> {
    const runId = await this.dbService.logSyncStart('BACKGROUND', 'ORGANIZATION');
    let conn: odbc.Connection | null = null;
    try {
      conn = await odbc.connect(this.connectionString);
      const result = await conn.query(`
        SELECT 
          $Name, $MailingName, $Address, $StateName, $CountryName,
          $GSTIN, $TRN, $Phone, $EMail, $PINCode, $MasterId, $AlterId
        FROM Company
      `);
      const company: any = Array.isArray(result) && result.length > 0 ? result[0] : null;

      if (!company) throw new Error('No company in Tally');

      const tallyId = (company.$MailingName || company.$Name || 'TALLY_CO').trim();
      const payload = {
        biller: [{
          biller_id: profile.biller_id,
          organization_id: '',  // Optional per Postman
          tally_id: tallyId,
          state: company.$StateName || 'West Bengal',
          country: company.$CountryName || 'India',
          trn: company.$TRN || '23406713697'
        }]
      };


      const response = await axios.post(`${BASE_URL}/billers/tally/set-organization`, payload, { headers: { 'API-KEY': API_KEY } });

      await this.dbService.updateOrganization(profile.email, { name: tallyId, synced_at: new Date().toISOString() });
      await this.dbService.logSyncEnd(runId, 'SUCCESS', 1);
      this.dbService.log('INFO', 'Organization synced', { tallyId, status: response.data.status });
    } catch (e: any) {
      await this.dbService.logSyncEnd(runId, 'FAILED', 0, undefined, e.message);
      this.dbService.log('ERROR', 'Organization sync failed', e);
    } finally {
      if (conn) await conn.close().catch(() => { });
    }
  }


  // Helper: Format Tally date strings to DD-MM-YYYY as required by Postman payloads
  private formatTallyDate(dateStr: string): string {
    if (!dateStr || dateStr.length !== 8) return '01-12-2024';  // Fallback to Postman example
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    return `${day}-${month}-${year}`;
  }

  // Enhanced executeSync with async builder for nested queries and batching
  private async executeSync(
    conn: odbc.Connection,
    runId: number,
    entity: string,
    query: string,
    builder: (rows: any[], conn: odbc.Connection, profile: UserProfile) => Promise<{ url: string; payload: any; batchMaxAlter: string }>,
    profile: UserProfile
  ): Promise<void> {
    try {
      const result = await conn.query(query);
      const rows = Array.isArray(result) ? result : [];
      if (rows.length === 0) {
        await this.dbService.logSyncEnd(runId, 'SUCCESS', 0);
        return;
      }
      console.log(`Fetched ${rows.length} ${entity}(s) from Tally`, JSON.stringify(rows.slice(0, 2), null, 2));  // Log sample for brevity

      // Process in batches for efficiency
      let totalSynced = 0;
      let overallMaxAlter = '0';
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batchRows = rows.slice(i, i + BATCH_SIZE);
        const { url, payload, batchMaxAlter } = await builder(batchRows, conn, profile);
        console.log(`Syncing batch of ${batchRows.length} ${entity}(s) to ${url}`);
        const response = await axios.post(url, payload, { headers: { 'API-KEY': API_KEY }, timeout: 90000 });
        console.log(`${entity} batch response:`, response.data);
        totalSynced += batchRows.length;
        overallMaxAlter = Math.max(parseInt(overallMaxAlter), parseInt(batchMaxAlter)).toString();
      }

      await this.dbService.logSyncEnd(runId, 'SUCCESS', totalSynced, overallMaxAlter);
      await this.dbService.updateGlobalMaxAlterId(overallMaxAlter);
      this.dbService.log('INFO', `${entity} sync completed`, { totalSynced, overallMaxAlter });
    } catch (e: any) {
      await this.dbService.logSyncEnd(runId, 'FAILED', 0, undefined, e.message);
      this.dbService.log('ERROR', `${entity} sync failed`, e);
    }
  }

  // CUSTOMERS 
  private async syncCustomers(conn: odbc.Connection, profile: UserProfile, type: 'MANUAL' | 'BACKGROUND'): Promise<void> {
    const runId = await this.dbService.logSyncStart(type, 'CUSTOMER');
    const filter = parseInt(await this.dbService.getGlobalMaxAlterId()) || 0;

    const query = `
      SELECT $Name, $MailingName, $EMail AS email, $Phone, $MobileNo, $GSTIN AS gstin,
             $ClosingBalance, $OpeningBalance, $MasterId, $AlterId
      FROM Ledger
      WHERE $$IsLedOfGrp:$Name:$$GroupSundryDebtors AND $AlterId > ${filter}
      ORDER BY $AlterId ASC
    `;

    await this.executeSync(conn, runId, 'CUSTOMER', query, async (rows, conn, profile) => {
      const customers = rows.map(r => ({
        name: (r.$Name || 'Aman').trim(),
        email: r.email || 'aman@gmail.com',
        phone: r.$Phone || '1234567890',
        mobile: r.$MobileNo || '1234567890',
        company_name: (r.$MailingName || r.$Name || 'ABC').trim(),
        customer_id: r.$MasterId?.toString() || `32373_${r.$AlterId}`,  // Ensure uniqueness
        biller_id: profile.biller_id!,
        current_balance: Number(r.$ClosingBalance) || 3500.00,
        current_balance_at: '2025-11-17 16:48:30',
        opening_balance: Number(r.$OpeningBalance) || 3500.00,
        invoice_details: []  // Can extend with Voucher sub-query for historical invoices
      }));
      const batchMaxAlter = Math.max(...rows.map(r => parseInt(r.$AlterId || '0', 10))).toString();
      return {
        url: `${BASE_URL}/customer/tally/create`,
        payload: { customer: customers },
        batchMaxAlter
      };
    }, profile);
  }

  // INVOICES 
  private async syncInvoices(conn: odbc.Connection, profile: UserProfile, type: 'MANUAL' | 'BACKGROUND'): Promise<void> {
    const runId = await this.dbService.logSyncStart(type, 'INVOICE');
    const filter = parseInt(await this.dbService.getGlobalMaxAlterId()) || 0;
    console.log('Current invoice filter AlterId:', filter);

    const query = `
      SELECT $Date AS issue_date, 
             $DueDate AS due_date, 
             $VoucherNumber AS invoice_number,
             $Reference AS ref_number, 
             $PartyLedgerName AS customer_name, 
             $BasicLedgerName AS party_ledger,
             $VoucherTypeName AS voucher_type, 
             $Narration, 
             $BasicAccountAmount AS total,
             $EwayBillNo, 
             $TransDate AS eway_date, 
             $FromStateName AS dispatch_from, 
             $ToStateName AS dispatch_to,
             $TransMode AS mode, 
             $VehicleNo AS vehicle_number, 
             $TransporterName AS transport_name,
             $LRNo AS lading_no, 
             $LRDate AS lading_date, 
             $IRN, $AckNo AS acknowledge_no, 
             $AckDate AS ack_date
             $MasterId, $AlterId
      FROM Voucher
      // WHERE $AlterId > ${filter}
      ORDER BY $AlterId ASC
    `;
    const result = await conn.query(query);
    const rows = Array.isArray(result) ? result : [];

    console.log(`Fetched ${rows.length} INVOICE(s) from Tally`, JSON.stringify(rows.slice(0, 2), null, 2));  // Log sample for brevity

    // await this.executeSync(conn, runId, 'INVOICE', query, async (rows, conn, profile) => {
    //   const invoices: any[] = [];
    //   for (const row of rows) {
    //     // Resolve customer_id
    //     const custQuery = `SELECT $MasterId FROM Ledger WHERE $Name = '${row.party_ledger?.replace(/'/g, "''")}'`;  // Escape single quotes
    //     const custRes = await conn.query(custQuery);
    //     const customerId = (Array.isArray(custRes) && custRes[0] ? (custRes[0] as any).$MasterId : '32375')?.toString();

    //     // Ledger Entries
    //     const ledgerQuery = `SELECT $LedgerName, $Amount, $IsDeemedPositive FROM LedgerEntries WHERE $VoucherNumber = '${row.invoice_number?.replace(/'/g, "''")}'`;
    //     const ledgerRes = await conn.query(ledgerQuery);
    //     const ledgerEntries = (Array.isArray(ledgerRes) ? ledgerRes : []).map((le: any) => ({
    //       Ledger_Name: le.$LedgerName || 'CGST',
    //       Amount: Number(le.$Amount) * (le.$IsDeemedPositive === 1 ? 1 : -1)
    //     })) || [
    //       { Ledger_Name: 'CGST', Amount: 10 }, { Ledger_Name: 'SGST', Amount: 10 },
    //       { Ledger_Name: 'Freight', Amount: 100 }, { Ledger_Name: 'Others', Amount: 10 },
    //       { Ledger_Name: 'Discount', Amount: -100 }
    //     ];

    //     // Bill Details
    //     const billQuery = `SELECT $Name AS bill_id, $BillAmount FROM BillAllocations WHERE $VoucherNumber = '${row.invoice_number?.replace(/'/g, "''")}'`;
    //     const billRes = await conn.query(billQuery);
    //     const billDetails = (Array.isArray(billRes) ? billRes : []).map((b: any) => ({
    //       bill_id: b.bill_id || 'ATS/25-26/0216',
    //       bill_amount: String(Number(b.$BillAmount) || 23676)
    //     }));

    //     // Inventory Details with Batches
    //     const invQuery = `SELECT $StockItemName, $BilledQty, $Rate, $Amount, $ActualQty, $UnitName, $GSTRate, $Discount FROM InventoryEntries.StockItems WHERE $VoucherNumber = '${row.invoice_number?.replace(/'/g, "''")}'`;
    //     const invRes = await conn.query(invQuery);
    //     const inventoryDetails: any[] = [];
    //     const invRows = Array.isArray(invRes) ? invRes : [];
    //     for (const inv of invRows as any[]) {
    //       const batchQuery = `SELECT $GodownName, $BatchName, $ManufactureDate, $BatchQty, $ExpiryDate FROM InventoryEntries.StockItems.BatchAllocations WHERE $VoucherNumber = '${row.invoice_number?.replace(/'/g, "''")}' AND $StockItemName = '${inv.$StockItemName?.replace(/'/g, "''")}'`;
    //       const batchRes = await conn.query(batchQuery);
    //       const batches = (Array.isArray(batchRes) ? batchRes : []).map((b: any) => ({
    //         Godown_Name: b.$GodownName || 'Godoown 1',
    //         Batch_Name: b.$BatchName || 'ABC00001',
    //         'Mfg date': this.formatTallyDate(b.$ManufactureDate || '20250401'),
    //         BACH_QTY: String(b.$BatchQty || '5'),
    //         'Due Date': this.formatTallyDate(b.$ExpiryDate || '20251010')
    //       })) || [
    //         { Godown_Name: 'Godoown 1', Batch_Name: 'ABC00001', 'Mfg date': '1-4-25', BACH_QTY: '5', 'Due Date': '10-10-25' },
    //         { Godown_Name: 'Godoown 2', Batch_Name: 'ABC00002', BACH_QTY: '5' }
    //       ];
    //       inventoryDetails.push({
    //         StockItem_Name: inv.$StockItemName || 'Pencil',
    //         Quantity: String(inv.$BilledQty || '10'),
    //         AltQuantity: String(inv.$ActualQty || '10'),
    //         Rate: String(inv.$Rate || '10'),
    //         UOM: inv.$UnitName || 'Nos',
    //         AlterbativeUnit: 'Box',
    //         Amount: String(inv.$Amount || '1000'),
    //         GST_perc: String(inv.$GSTRate || '18'),
    //         Discount: inv.$Discount || '10%',
    //         Batch_Allocation: batches
    //       });
    //     }

    //     const total = Number(row.total) || 1500;
    //     const ewayEnabled = total > 50000 && inventoryDetails.length > 0;

    //     invoices.push({
    //       invoice_id: `Tally${row.$AlterId}001`,
    //       invoice_number: row.invoice_number || 'INV1001',
    //       voucher_type: row.voucher_type?.toLowerCase().includes('credit') ? 'credit_note' : 'sales',
    //       issue_date: this.formatTallyDate(row.issue_date),
    //       due_date: this.formatTallyDate(row.due_date),
    //       customer_id: customerId,
    //       status: '',
    //       type: 'simple',
    //       total,
    //       balance: 500,  // Placeholder; extend with payment reconciliation
    //       biller_id: profile.biller_id!,
    //       address: 'shyam nagar',
    //       state: row.dispatch_to || 'delhi',
    //       country: 'india',
    //       company_name: row.customer_name || 'ABC',
    //       ...(ewayEnabled ? {
    //         Ewaybill_Num: row.$EwayBillNo || '12343658699',
    //         Date: this.formatTallyDate(row.eway_date || '20250401'),
    //         'DispatchFrom ': row.dispatch_from || 'Hariyana',
    //         Dispatchto: row.dispatch_to || 'Karnataka',
    //         TransporatName: row.transport_name || 'VRL logistics',
    //         TransporatId: '12443t',
    //         Mode: row.mode || 'By road',
    //         LadingNo: row.lading_no || 'Abc124356',
    //         LadingDate: this.formatTallyDate(row.lading_date || '20250701'),
    //         Vehicle_number: row.vehicle_number || 'KA01A1234',
    //         Vehicle_type: 'R - Regular'
    //       } : {}),
    //       Acknowledge_No: row.acknowledge_no || '123456789012345',
    //       Ack_Date: this.formatTallyDate(row.ack_date || '20250701'),
    //       IRN: row.$IRN || 'f6e5c3f11c3c2b47f9c893a6932be2f6977bc3646e9dfba8c8ea81c776c4a456',
    //       BilltoPlace: row.dispatch_to || 'Kerala',
    //       'Ship to Place': row.dispatch_from || 'Hariyana',
    //       billDetails,
    //       Ledger_Entries: ledgerEntries,
    //       Inventory_Entries: !!inventoryDetails.length,
    //       Order_NUmber: '132',
    //       Delivery_note_no: '110',
    //       Inventory_Details: inventoryDetails
    //     });
    //   }

    //   const batchMaxAlter = Math.max(...rows.map(r => parseInt(r.$AlterId || '0', 10))).toString();
    //   return {
    //     url: `${BASE_URL}/invoice/tally/create`,
    //     payload: { invoice: invoices },
    //     batchMaxAlter
    //   };
    // }, profile);
  }

  // PAYMENTS
  private async syncPayments(conn: odbc.Connection, profile: UserProfile, type: 'MANUAL' | 'BACKGROUND'): Promise<void> {
    const runId = await this.dbService.logSyncStart(type, 'PAYMENT');
    const filter = parseInt(await this.dbService.getGlobalMaxAlterId()) || 0;

    // const query = `Select $Name from ODBCTables`;
    const query = `SELECT * FROM ODBC_Zoro_Sales WHERE 1 = 1`;

    const result = await conn.query(query);
    console.log('Payment query result:', JSON.stringify(result, null, 2));
    // const rows = Array.isArray(result) ? result : [];

    // console.log(`Fetched ${rows.length} PAYMENT(s) from Tally`, JSON.stringify(rows.slice(0, 2), null, 2));  // Log sample for brevity


    // await this.executeSync(conn, runId, 'PAYMENT', query, async (rows, conn, profile) => {
    //   const receipts: any[] = [];
    //   for (const row of rows) {
    //     // Resolve bill allocations
    //     const escapedVoucherNumber = row.$VoucherNumber?.replace(/'/g, "''") || '';
    //     const billQuery = `SELECT $Name AS bill_id, $Amount AS bill_amount FROM BillAllocations WHERE $VoucherNumber = '${escapedVoucherNumber}'`;
    //     const billRes = await conn.query(billQuery);
    //     let billDetails = (Array.isArray(billRes) ? billRes : []).map((b: any) => ({
    //       bill_id: b.bill_id || 'INV1001',
    //       bill_amount: String(Number(b.bill_amount || 0).toFixed(2))
    //     }));

    //     // Dynamic unallocated per Postman example
    //     const allocatedSum = billDetails.reduce((sum: number, b: any) => sum + parseFloat(b.bill_amount), 0);
    //     const receiptAmt = Number(row.$BasicAccountAmount || 0).toFixed(2);
    //     if (Math.abs(allocatedSum - parseFloat(receiptAmt)) > 0.01) {
    //       billDetails.push({
    //         bill_id: 'Unallocated',
    //         bill_amount: String((parseFloat(receiptAmt) - allocatedSum).toFixed(2))
    //       });
    //     }

    //     receipts.push({
    //       receipt_id: String(row.$MasterId || row.$AlterId),
    //       receipt_number: row.$VoucherNumber || '1',
    //       receipt_date: this.formatTallyDate(row.$Date),
    //       customer_name: row.$PartyLedgerName || 'ABC Company1',
    //       customer_id: row.$LedgerMasterId?.toString() || '32375',
    //       receipt_amount: receiptAmt,
    //       biller_id: profile.biller_id!,
    //       transaction_type: row.$PaymentInstrumentName || 'Cheque/DD',
    //       billDetails  // Fixed key name to match Postman
    //     });
    //   }

    //   const batchMaxAlter = Math.max(...rows.map(r => parseInt(r.$AlterId || '0', 10))).toString();
    //   return {
    //     url: `${BASE_URL}/billers/tally/payment`,
    //     payload: { receipt: receipts },
    //     batchMaxAlter
    //   };
    // }, profile);
  }

  // STOCK ITEMS
  private async syncStockItems(conn: odbc.Connection, profile: UserProfile, type: 'MANUAL' | 'BACKGROUND'): Promise<void> {
    const runId = await this.dbService.logSyncStart(type, 'STOCK_ITEM');
    const filter = parseInt(await this.dbService.getGlobalMaxAlterId()) || 0;

    const query = `
    SELECT
      $Name,
      $PartNumber,
      $Parent AS group_name,
      $BaseUnits AS uom,
      $AlternateUnits AS alt_unit,
      $HSNSAC AS hsn_code,
      $SetAlterGST AS gst_applicable_date,
      $RateofTaxGST AS gst_rate,
      $MasterId, $AlterId
    FROM StockItem
    WHERE $AlterId > ${filter}
    ORDER BY $AlterId ASC
  `;

    await this.executeSync(conn, runId, 'STOCK_ITEM', query, async (rows, conn, profile) => {
      const stockItems = rows.map(r => {
        const cleanGroupName = (r.group_name || '').replace(/\u0004\s*/g, '').trim() || 'Primary';
        const cleanUOM = (r.uom || '').replace(/\u0004\s*/g, '').trim() || 'Not Applicable';

        const hsnDate = r.hsn_code ? '1-4-25' : '';
        const gstDate = r.gst_rate ? '1-4-25' : '';

        return {
          stock_item_id: `${r.$MasterId}`,
          biller_id: profile.biller_id!,
          Name: r.$Name?.trim() || 'Pencil',
          ProductCode: r.$PartNumber?.toString() || '1245667',
          Part_number: r.$PartNumber?.toString() || 'ABC133456',
          Group: cleanGroupName || 'Stationary',
          UOM: cleanUOM || 'Nos',
          Alt_Unit: r.alt_unit?.toString() || 'Box',
          HSN_AppDate: hsnDate,
          HSN_code: r.hsn_code?.toString() || '134e',
          GST_ApplicableDate: gstDate,
          GST_Rate: r.gst_rate ? `${r.gst_rate} %` : '18 %'
        };
      });

      const batchMaxAlter = Math.max(...rows.map(r => parseInt(r.$AlterId || '0', 10))).toString();
      return {
        url: `${BASE_URL}/tally/staging-stock-item-master/save`,
        payload: { stock_items: stockItems },
        batchMaxAlter
      };
    }, profile);
  }

  // JOURNAL ENTRIES
  private async syncJournalEntries(conn: odbc.Connection, profile: UserProfile, type: 'MANUAL' | 'BACKGROUND'): Promise<void> {
    const runId = await this.dbService.logSyncStart(type, 'JV_ENTRY');
    const filter = parseInt(await this.dbService.getGlobalMaxAlterId()) || 0;

    const query = `
      SELECT $Date AS date, $VoucherNumber AS voucher_number, $Reference AS ref_number,
             $Narration AS narration, $AlterId
      FROM Voucher
      WHERE $VoucherTypeName CONTAINS 'Journal' AND $AlterId > ${filter}
      ORDER BY $AlterId ASC
    `;

    const result = await conn.query(query);
    console.log('Journal query result:', result);

    // await this.executeSync(conn, runId, 'JV_ENTRY', query, async (rows, conn, profile) => {
    //   const jvEntries: any[] = [];
    //   for (const row of rows) {
    //     const ledgerQuery = `SELECT $LedgerName, $Amount, $IsDeemedPositive AS is_debit, $LedgerMasterId FROM LedgerEntries WHERE $VoucherNumber = '${row.voucher_number?.replace(/'/g, "''")}'`;
    //     const ledgerRes = await conn.query(ledgerQuery);
    //     const ledgerRows = Array.isArray(ledgerRes) ? ledgerRes : [];
    //     const ledgerEntries = ledgerRows.map((le: any) => {
    //       const isCustomerEntry = le.$LedgerName?.includes('Sundry Debtors') || le.$LedgerName?.includes('Customer');
    //       return {
    //         customer_id: isCustomerEntry ? (le.$LedgerMasterId?.toString() || '32375') : '3287375',
    //         conversation_rate: 84,
    //         company_name: le.$LedgerName || 'Bank Account',
    //         is_debit: le.is_debit === 1,
    //         amount: Math.abs(Number(le.$Amount)) || 26000.00,
    //         currency: 'INR',
    //         ...(isCustomerEntry ? {
    //           invoice_details: [{
    //             invoice_number: 'INV-1001',  // Can link via BillAllocations
    //             invoice_date: this.formatTallyDate(row.date),
    //             amount: Math.abs(Number(le.$Amount)) || 11000.00
    //           }]
    //         } : {})
    //       };
    //     });
    //     jvEntries.push({
    //       entry_type: 'JVENTRY',
    //       transation_id: `Vd8543587${row.$AlterId}`,
    //       biller_id: profile.biller_id!,
    //       voucher_number: row.voucher_number || 'JV003',
    //       ref_number: row.ref_number || 'JV002',
    //       date: this.formatTallyDate(row.date),
    //       ref_date: this.formatTallyDate(row.date),
    //       narration: row.narration || 'Payment received from customer against invoice INV-1001',
    //       ledger_entries: ledgerEntries
    //     });
    //   }
    //   const batchMaxAlter = Math.max(...rows.map(r => parseInt(r.$AlterId || '0', 10))).toString();
    //   return {
    //     url: `${BASE_URL}/ledgers/tally/jv-entries`,
    //     payload: { jv_entry: jvEntries },
    //     batchMaxAlter
    //   };
    // }, profile);
  }

  // FULL SYNC 
  private async fullSync(profile: UserProfile, type: 'MANUAL' | 'BACKGROUND' = 'BACKGROUND'): Promise<void> {
    if (this.isRunning) {
      this.dbService.log('WARN', 'Sync already in progress; skipping');
      return;
    }
    // this.isRunning = true;
    let conn: odbc.Connection | null = null;
    try {
      conn = await odbc.connect(this.connectionString);
      this.dbService.log('INFO', `${type} full sync initiated`);

      const prof = await this.dbService.getProfile();
      // console.log('Profile for sync:', prof, type);
      if (type === 'MANUAL' || !prof?.organization?.synced_at) {
        await this.syncOrganization(profile);
      }

      // const res = await fetchFullInvoices('20250101', '20251231');
      // const res = await fetchFromTally(XML_COMPANY_LIST);
      // console.log('Fetched full invoices:', JSON.stringify(res, null, 2));

      // const ledgers = await fetchAllLedgers();  // No parameters needed
      // console.log('Total Ledgers fetched:', ledgers.length);
      // console.log('Total Ledgers:', JSON.stringify(ledgers, null, 2));

      // const vouchers = await fetchAllVouchersODBC();
      // console.log('Total Vouchers fetched:', vouchers.length);
      // console.log('First voucher sample:', JSON.stringify(vouchers, null, 2));

      // const result = await fetchAllLedgers();
      // // console.log('Total Vouchers fetched:', result.length);
      // console.log('First voucher sample:', JSON.stringify(result, null, 2));

      // const result = await fetchAllVouchers();
      // // console.log('Total Vouchers fetched:', result.length);
      // console.log('First voucher sample:', JSON.stringify(result, null, 2));

      // const result = await fetchAllLedgersOpening();
      // // console.log('Total Vouchers fetched:', result.length);
      // console.log('First voucher sample:', JSON.stringify(result, null, 2));

      const result = await fetchAllCompanies();
      // console.log('Total Vouchers fetched:', result.length);
      console.log('First Company sample:', JSON.stringify(result, null, 2));

      // await this.syncCustomers(conn, profile, type);
      // await this.syncInvoices(conn, profile, type);
      // await this.syncPayments(conn, profile, type);
      // await this.syncStockItems(conn, profile, type);
      // await this.syncJournalEntries(conn, profile, type);

      await this.dbService.updateLastSuccessfulSync();
      this.dbService.log('INFO', `${type} full sync completed successfully`);
    } catch (e: any) {
      this.dbService.log('ERROR', 'Full sync failed', e);
    } finally {
      if (conn) await conn.close().catch(() => { });
      this.isRunning = false;
    }
  }

  async manualSync(profile: UserProfile): Promise<void> {
    await this.fullSync(profile, 'MANUAL');
  }

  startBackgroundSync(profile: UserProfile): void {
    this.fullSync(profile, 'BACKGROUND');
    setInterval(() => this.fullSync(profile, 'BACKGROUND'), 300000);
  }

  stop(): void {
    this.isRunning = false;
    this.dbService.log('INFO', 'Background sync stopped');
  }
}