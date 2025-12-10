import * as odbc from 'odbc';
import axios from 'axios';
import { DatabaseService, UserProfile, SyncSummary } from '../database/database.service';

const BASE_URL = 'http://localhost:3000';
const API_KEY = '7061797A6F72726F74616C6C79';  // Hardcoded from Postman; use env in prod

export interface TallyCompanyData {
  name: string;
  mailingName: string;
  address: string;
  state: string;
  country: string;
  gstin: string;
  trn: string;
  phone: string;
  email: string;
  pincode: string;
}

export class SyncService {
  private dbService: DatabaseService;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private connectionString = 'DSN=TallyODBC64_9000;UID=;PWD=;';

  constructor(dbService: DatabaseService) {
    this.dbService = dbService;
  }

  // Fetch Company Data from Tally ODBC
  async fetchTallyCompanyData(): Promise<TallyCompanyData | null> {
    let conn: odbc.Connection | null = null;
    try {
      this.dbService.log('INFO', 'Fetching Tally company data via ODBC');
      conn = await odbc.connect(this.connectionString);

      const query = `
        SELECT 
          $Name as name,
          $MailingName as mailingName,
          $Address as address,
          $StateName as state,
          $CountryName as country,
          $GSTIN as gstin,
          $TRN as trn,
          $Phone as phone,
          $EMail as email,
          $PINCode as pincode
        FROM Company
      `;

      const result = await conn.query(query);
      const companyData: any = Array.isArray(result) && result.length > 0 ? result[0] : null;
      console.log('Raw Tally company data:', companyData);

      if (!companyData) {
        this.dbService.log('ERROR', 'No company data found in Tally ODBC');
        return null;
      }

      const formatted: TallyCompanyData = {
        name: companyData.name || '',
        mailingName: companyData.mailingName || '',
        address: companyData.address || '',
        state: companyData.state || 'West Bengal',
        country: companyData.country || 'India',
        gstin: companyData.gstin || '',
        trn: companyData.trn || '',
        phone: companyData.phone || '',
        email: companyData.email || '',
        pincode: companyData.pincode || ''
      };
      console.log('Fetched Tally company data:', formatted);

      this.dbService.log('INFO', 'Tally company data fetched', formatted);
      return formatted;

    } catch (error: any) {
      console.log(error)
      this.dbService.log('ERROR', 'Failed to fetch Tally company data', { error: error.message });
      return null;
    } finally {
      if (conn) try { await conn.close(); } catch (e) { }
    }
  }

  // Set Organization using Tally Company Data
  async setOrganization(profile: UserProfile): Promise<void> {
    try {
      const companyData = await this.fetchTallyCompanyData();
      if (!companyData) {
        this.dbService.log('WARN', 'Skipping set-organization: No company data');
        return;
      }

      // Update DB profile
      await this.dbService.updateOrganization(profile.email, companyData);

      const payload = {
        biller: [
          {
            biller_id: profile.biller_id,
            organization_id: '',  // Optional
            tally_id: companyData.name,
            state: companyData.state,
            country: companyData.country,
            trn: companyData.trn
          }
        ]
      };

      const response = await axios.post(`${BASE_URL}/billers/tally/set-organization`, payload, {
        headers: { 'API-KEY': API_KEY, 'Content-Type': 'application/json' },
        timeout: 15000
      });

      this.dbService.log('INFO', 'Organization set with Tally data', { status: response.data.status });
    } catch (err: any) {
      this.dbService.log('ERROR', 'Failed to set organization', { error: err.message });
    }
  }

  startBackground(profile?: UserProfile): void {
    if (this.isRunning || !profile) {
      this.dbService.log('WARN', 'Background sync skipped');
      return;
    }
    this.isRunning = true;
    this.dbService.log('INFO', 'Background sync started (5 min interval)');
    this.setOrganization(profile).then(() => this.fullSync(profile));
    this.intervalId = setInterval(() => {
      this.setOrganization(profile).then(() => this.fullSync(profile));
    }, 5 * 60 * 1000);
  }

  manualSync(profile?: UserProfile): void {
    this.dbService.log('INFO', 'Manual sync triggered');
    if (!profile) {
      this.dbService.log('ERROR', 'No profile for manual sync');
      return;
    }
    this.setOrganization(profile).then(() => this.fullSync(profile));
  }

  private async fullSync(profile: UserProfile): Promise<void> {
    if (this.isRunning) {
      this.dbService.log('WARN', 'Sync in progress, skipping');
      return;
    }
    this.isRunning = true;
    let conn: odbc.Connection | null = null;

    try {
      const runId = await this.dbService.startSyncRun('FULL_SYNC');
      this.dbService.log('INFO', 'Full sync started', { runId });

      conn = await odbc.connect(this.connectionString);
      this.dbService.log('INFO', 'Tally ODBC connected');

      const lastSync = await this.dbService.getLastSuccessfulSync();
      const lastAlter = await this.dbService.getLastAlterDate();
      const dateFilter = lastSync > '1970-01-01' ? lastSync.split('T')[0] : '2020-01-01';
      const alterFilter = lastAlter > '1970-01-01' ? lastAlter.split('T')[0] : '2020-01-01';

      // Sync entities
      await this.syncCustomers(conn, profile, alterFilter, runId);
      // await this.syncSuppliers(conn, profile, alterFilter, runId);
      // await this.syncInvoices(conn, profile, dateFilter, runId);
      // await this.syncPayments(conn, profile, dateFilter, runId);
      // await this.syncStockItems(conn, profile, alterFilter, runId);
      // await this.syncJVEntries(conn, profile, dateFilter, runId);

      await this.dbService.updateLastSuccessfulSync();
      this.dbService.log('INFO', 'Full sync completed');

    } catch (error: any) {
      this.dbService.log('ERROR', 'Full sync failed', { error: error.message });
      await this.dbService.completeSyncRun(0, 'FAILED', { total: 0, created: 0, updated: 0, failed: 1, skipped: 0 }, error.message);
    } finally {
      if (conn) try { await conn.close(); } catch (e) { }
      this.isRunning = false;
    }
  }

  // Customers Sync
  private async syncCustomers(conn: odbc.Connection, profile: UserProfile, alterFilter: string, runId: number): Promise<void> {
    const query = `
      SELECT $Name as name, $MailingName as company_name, $Address as address, $EMail as email,
             $Phone as phone, $MobileNo as mobile, $GSTIN as gstin, $OpeningBalance as opening_balance,
             $ClosingBalance as current_balance, $LastStmtDate as current_balance_at, $Parent as group_name
      FROM Ledger WHERE $$IsLedOfGrp:$Name:$$GroupSundryDebtors AND $AlterDate >= '${alterFilter}'
    `;
    const result = await conn.query(query);
    const customers = Array.isArray(result) ? result : [];
    this.dbService.log('INFO', 'Fetched customers', { count: customers.length });

    if (customers.length === 0) return;

    const payloadCustomers = customers.map((c: any) => ({
      name: c.name || '',
      email: c.email || '',
      phone: c.phone || '',
      mobile: c.mobile || '',
      company_name: c.company_name || '',
      customer_id: c.gstin || `CUST${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
      biller_id: profile.biller_id,
      current_balance: Number(c.current_balance) || 0,
      current_balance_at: c.current_balance_at ? new Date(c.current_balance_at).toLocaleString('en-GB') : new Date().toLocaleString('en-GB'),
      opening_balance: Number(c.opening_balance) || 0,
      invoice_details: []  // Expand with JOIN if needed
    }));

    console.log('Prepared customer payload:', payloadCustomers);

    const payload = { customer: payloadCustomers };
    // try {
    //   const res = await axios.post(`${BASE_URL}/customer/tally/create`, payload, {
    //     headers: { 'API-KEY': API_KEY, 'Content-Type': 'application/json' },
    //     timeout: 15000
    //   });
    //   const summary: SyncSummary = {
    //     total: payloadCustomers.length,
    //     created: res.data.updated_records || 0,
    //     updated: res.data.updated_records || 0,
    //     failed: res.data.failed_records || 0,
    //     skipped: 0
    //   };
    //   await this.dbService.completeSyncRun(runId, 'SUCCESS', summary, `Customers: ${customers.length}`);
    //   this.dbService.log('INFO', 'Customers synced', summary);
    //   await this.dbService.updateLastAlterDate();  // Update alter for masters
    // } catch (err: any) {
    //   this.dbService.log('ERROR', 'Customers API failed', { error: err.message });
    // }
  }

  // Suppliers Sync (Similar to Customers, SundryCreditors)
  private async syncSuppliers(conn: odbc.Connection, profile: UserProfile, alterFilter: string, runId: number): Promise<void> {
    const query = `
      SELECT $Name as name, $MailingName as company_name, $Address as address, $EMail as email,
             $Phone as phone, $MobileNo as mobile, $GSTIN as gstin, $OpeningBalance as opening_balance,
             $ClosingBalance as current_balance, $LastStmtDate as current_balance_at
      FROM Ledger WHERE $$IsLedOfGrp:$Name:$$GroupSundryCreditors AND $AlterDate >= '${alterFilter}'
    `;
    const result = await conn.query(query);
    const suppliers = Array.isArray(result) ? result : [];
    this.dbService.log('INFO', 'Fetched suppliers', { count: suppliers.length });

    if (suppliers.length === 0) return;

    const payloadSuppliers = suppliers.map((s: any) => ({
      name: s.name || '',
      email: s.email || '',
      phone: s.phone || '',
      mobile: s.mobile || '',
      company_name: s.company_name || '',
      supplier_id: s.gstin || `SUP${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
      biller_id: profile.biller_id,
      current_balance: Number(s.current_balance) || 0,
      opening_balance: Number(s.opening_balance) || 0
    }));

    const payload = { supplier: payloadSuppliers };  // Assume /supplier/tally/create endpoint
    try {
      const res = await axios.post(`${BASE_URL}/supplier/tally/create`, payload, {  // Adjust endpoint if different
        headers: { 'API-KEY': API_KEY, 'Content-Type': 'application/json' },
        timeout: 15000
      });
      const summary: SyncSummary = {
        total: payloadSuppliers.length,
        created: res.data.updated_records || 0,
        updated: res.data.updated_records || 0,
        failed: res.data.failed_records || 0,
        skipped: 0
      };
      await this.dbService.completeSyncRun(runId, 'SUCCESS', summary, `Suppliers: ${suppliers.length}`);
      this.dbService.log('INFO', 'Suppliers synced', summary);
    } catch (err: any) {
      this.dbService.log('ERROR', 'Suppliers API failed', { error: err.message });
    }
  }

  // Invoices Sync
  private async syncInvoices(conn: odbc.Connection, profile: UserProfile, dateFilter: string, runId: number): Promise<void> {
    const query = `
      SELECT $Date as issue_date, $VoucherNumber as invoice_number, $VoucherTypeName as voucher_type,
             $PartyLedgerName as customer_name, $BasicAmountToBeAdjusted as total, $DueDate as due_date,
             $Narration as narration, $Reference as ref_number
      FROM RTSAllVouchers WHERE $Date >= '${dateFilter}' AND $VoucherTypeName IN ('Sales', 'Credit Note')
    `;
    const result = await conn.query(query);
    const invoices = Array.isArray(result) ? result : [];
    this.dbService.log('INFO', 'Fetched invoices', { count: invoices.length });

    if (invoices.length === 0) return;

    const payloadInvoices = invoices.map((inv: any) => ({
      invoice_id: `Tally${inv.invoice_number}`,
      invoice_number: inv.invoice_number || '',
      voucher_type: inv.voucher_type.toLowerCase(),
      issue_date: new Date(inv.issue_date).toLocaleDateString('en-GB'),
      due_date: new Date(inv.due_date).toLocaleDateString('en-GB'),
      customer_id: inv.customer_name || '32375',  // Map to actual ID
      status: '',
      type: 'simple',
      total: Number(inv.total) || 0,
      balance: Number(inv.total) || 0,  // Simplify; calc if needed
      biller_id: profile.biller_id,
      address: '',  // From ledger JOIN
      state: 'delhi',  // From org
      country: 'india',
      company_name: inv.customer_name || '',
      bill_details: [], Ledger_Entries: [], Inventory_Entries: false,
      Inventory_Details: [], Order_NUmber: '', Delivery_note_no: ''
    }));

    const payload = { invoice: payloadInvoices };
    try {
      const res = await axios.post(`${BASE_URL}/invoice/tally/create`, payload, {
        headers: { 'API-KEY': API_KEY, 'Content-Type': 'application/json' },
        timeout: 15000
      });
      const summary: SyncSummary = {
        total: payloadInvoices.length,
        created: res.data.updated_records || 0,
        updated: res.data.updated_records || 0,
        failed: res.data.failed_records || 0,
        skipped: 0
      };
      await this.dbService.completeSyncRun(runId, 'SUCCESS', summary, `Invoices: ${invoices.length}`);
      this.dbService.log('INFO', 'Invoices synced', summary);
    } catch (err: any) {
      this.dbService.log('ERROR', 'Invoices API failed', { error: err.message });
    }
  }

  // Payments Sync
  private async syncPayments(conn: odbc.Connection, profile: UserProfile, dateFilter: string, runId: number): Promise<void> {
    const query = `
      SELECT $Date as receipt_date, $VoucherNumber as receipt_number, $PartyLedgerName as customer_name,
             $BasicAmountToBeAdjusted as receipt_amount, $VoucherTypeName as transaction_type
      FROM RTSAllVouchers WHERE $Date >= '${dateFilter}' AND $VoucherTypeName IN ('Receipt', 'Payment')
    `;
    const result = await conn.query(query);
    const payments = Array.isArray(result) ? result : [];
    this.dbService.log('INFO', 'Fetched payments', { count: payments.length });

    if (payments.length === 0) return;

    const payloadReceipts = payments.map((p: any) => ({
      receipt_id: `R${p.receipt_number}`,
      receipt_number: p.receipt_number || '',
      receipt_date: new Date(p.receipt_date).toLocaleDateString('en-GB'),
      customer_name: p.customer_name || '',
      customer_id: p.customer_name || '32375',
      receipt_amount: Number(p.receipt_amount) || 0,
      biller_id: profile.biller_id,
      transaction_type: p.transaction_type === 'Receipt' ? 'Cheque/DD' : 'Cash',
      bill_details: []  // Expand with allocations
    }));

    const payload = { receipt: payloadReceipts };
    try {
      const res = await axios.post(`${BASE_URL}/billers/tally/payment`, payload, {
        headers: { 'API-KEY': API_KEY, 'Content-Type': 'application/json' },
        timeout: 15000
      });
      const summary: SyncSummary = { total: payloadReceipts.length, created: res.data?.updated_records || 0, updated: 0, failed: 0, skipped: 0 };
      await this.dbService.completeSyncRun(runId, 'SUCCESS', summary, `Payments: ${payments.length}`);
      this.dbService.log('INFO', 'Payments synced', summary);
    } catch (err: any) {
      this.dbService.log('ERROR', 'Payments API failed', { error: err.message });
    }
  }

  // Stock Items Sync
  private async syncStockItems(conn: odbc.Connection, profile: UserProfile, alterFilter: string, runId: number): Promise<void> {
    const query = `
      SELECT $Name as Name, $PartNo as ProductCode, $AltPartNo as Part_number, $Parent as Group,
             $BaseUnits as UOM, $AltUnit as Alt_Unit, $HSNCode as HSN_code, $GSTApplicableFrom as GST_ApplicableDate
      FROM StockItem WHERE $AlterDate >= '${alterFilter}'
    `;
    const result = await conn.query(query);
    const stockItems = Array.isArray(result) ? result : [];
    this.dbService.log('INFO', 'Fetched stock items', { count: stockItems.length });

    if (stockItems.length === 0) return;

    const payloadStock = stockItems.map((s: any) => ({
      stock_item_id: `SIID${s.Name.replace(/\s+/g, '')}`,
      biller_id: profile.biller_id,
      Name: s.Name || '',
      ProductCode: s.ProductCode || '',
      Part_number: s.Part_number || '',
      Group: s.Group || '',
      UOM: s.UOM || 'Nos',
      Alt_Unit: s.Alt_Unit || '',
      HSN_AppDate: s.GST_ApplicableDate || new Date().toLocaleDateString('en-GB'),
      HSN_code: s.HSN_code || '',
      GST_ApplicableDate: s.GST_ApplicableDate || new Date().toLocaleDateString('en-GB'),
      GST_Rate: '18 %'  // Map from GST details if JOIN
    }));

    const payload = { stock_items: payloadStock };
    try {
      const res = await axios.post(`${BASE_URL}/tally/staging-stock-item-master/save`, payload, {
        headers: { 'API-KEY': API_KEY, 'Content-Type': 'application/json' },
        timeout: 15000
      });
      const successCount = res.data.results?.filter((r: any) => r.status === 'success').length || 0;
      const summary: SyncSummary = {
        total: payloadStock.length,
        created: successCount,
        updated: 0,
        failed: payloadStock.length - successCount,
        skipped: 0
      };
      await this.dbService.completeSyncRun(runId, 'SUCCESS', summary, `Stock Items: ${stockItems.length}`);
      this.dbService.log('INFO', 'Stock items synced', summary);
    } catch (err: any) {
      this.dbService.log('ERROR', 'Stock items API failed', { error: err.message });
    }
  }

  // JV Entries Sync
  private async syncJVEntries(conn: odbc.Connection, profile: UserProfile, dateFilter: string, runId: number): Promise<void> {
    const query = `
      SELECT $Date as date, $VoucherNumber as voucher_number, $Narration as narration,
             $Reference as ref_number, $VoucherTypeName as entry_type
      FROM RTSAllVouchers WHERE $Date >= '${dateFilter}' AND $VoucherTypeName = 'Journal'
    `;
    const result = await conn.query(query);
    const jvs = Array.isArray(result) ? result : [];
    this.dbService.log('INFO', 'Fetched JV entries', { count: jvs.length });

    if (jvs.length === 0) return;

    const payloadJVs = jvs.map((jv: any) => ({
      entry_type: 'JVENTRY',
      transation_id: `Vd${jv.voucher_number}`,
      biller_id: profile.biller_id,
      voucher_number: jv.voucher_number || '',
      ref_number: jv.ref_number || '',
      date: new Date(jv.date).toLocaleDateString('en-GB'),
      ref_date: new Date(jv.date).toLocaleDateString('en-GB'),
      narration: jv.narration || '',
      ledger_entries: [  // Placeholder; JOIN AllLedgerEntries for full
        {
          customer_id: '32375',
          conversation_rate: 84,
          company_name: 'Bank Account',
          is_debit: true,
          amount: 26000.00,
          currency: 'INR'
        }
      ]
    }));

    const payload = { jv_entry: payloadJVs };
    try {
      const res = await axios.post(`${BASE_URL}/ledgers/tally/jv-entries`, payload, {
        headers: { 'API-KEY': API_KEY, 'Content-Type': 'application/json' },
        timeout: 15000
      });
      const summary: SyncSummary = { total: payloadJVs.length, created: res.data?.updated_records || 0, updated: 0, failed: 0, skipped: 0 };
      await this.dbService.completeSyncRun(runId, 'SUCCESS', summary, `JV Entries: ${jvs.length}`);
      this.dbService.log('INFO', 'JV entries synced', summary);
    } catch (err: any) {
      this.dbService.log('ERROR', 'JV entries API failed', { error: err.message });
    }
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    this.dbService.log('INFO', 'Background sync stopped');
  }
}