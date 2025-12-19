import axios from 'axios';
import fs from 'fs';
import { parseStringPromise } from 'xml2js';
import { DatabaseService, UserProfile } from '../../database/database.service';

const db = new DatabaseService();

const ENTITY_TYPE = 'VOUCHER';
const CUSTOMER_MAP_ENTITY = 'CUSTOMER_MAP';
const BATCH_SIZE = 20;
const API_KEY = '7061797A6F72726F74616C6C79';

// API Endpoints
const INVOICE_API = 'http://localhost:3000/invoice/tally/create';
const RECEIPT_API = 'http://localhost:3000/billers/tally/payment';
const JV_API = 'http://localhost:3000/ledgers/tally/jv-entries';

export const customerMasterIdMap = new Map<string, string>();


const getText = (obj: any, key: string): string => {
  const value = obj?.[key]?.[0];
  if (!value) return '';
  return (typeof value === 'string' ? value.trim() : value._?.trim() || '');
};

const getLineItems = (inventoryEntries: any[]): any[] => {
  if (!Array.isArray(inventoryEntries) || inventoryEntries.length === 0) return [];
  return inventoryEntries.map(entry => ({
    StockItem_Name: getText(entry, 'STOCKITEMNAME'),
    Quantity: parseFloat(getText(entry, 'BILLEDQTY').replace(/,/g, '') || '0'),
    AltQuantity: parseFloat(getText(entry, 'BILLEDQTY').replace(/,/g, '') || '0'),
    Rate: parseFloat(getText(entry, 'RATE').replace(/,/g, '') || '0'),
    UOM: getText(entry, 'BASICUNIT'),
    AlterbativeUnit: getText(entry, 'ALTUNIT') || getText(entry, 'BASICUNIT'),
    Amount: parseFloat(getText(entry, 'AMOUNT').replace(/,/g, '') || '0'),
    GST_perc: getText(entry, 'TAXABLEPERCENTAGE') || '',
    Discount: getText(entry, 'DISCOUNT') || '',
    Batch_Allocation: getBatchAllocation(entry['BATCHALLOCATIONS.LIST'] || [])
  }));
};

const getBatchAllocation = (batchList: any[]): any[] => {
  if (!Array.isArray(batchList) || batchList.length === 0) return [];
  return batchList.map(batch => ({
    Godown_Name: getText(batch, 'GODOWNNAME'),
    Batch_Name: getText(batch, 'BATCHNAME'),
    Mfg_date: getText(batch, 'MFGDATE') || '',
    BACH_QTY: parseFloat(getText(batch, 'BILLEDQTY').replace(/,/g, '') || '0'),
    Due_Date: getText(batch, 'EXPIRYDATE') || ''
  }));
};

const getLedgerEntries = (allLedgerEntries: any[]): any[] => {
  const ledgerEntries: any[] = [];
  if (Array.isArray(allLedgerEntries)) {
    allLedgerEntries.forEach(entry => {
      const ledgerName = getText(entry, 'LEDGERNAME');
      const amount = parseFloat(getText(entry, 'AMOUNT').replace(/,/g, '') || '0');
      ledgerEntries.push({
        Ledger_Name: ledgerName,
        Amount: amount
      });
    });
  }
  return ledgerEntries;
};

const getBillDetails = (billAllocations: any[]): any[] => {
  if (!Array.isArray(billAllocations) || billAllocations.length === 0) return [];
  return billAllocations.map(bill => ({
    bill_id: getText(bill, 'NAME'),
    bill_amount: parseFloat(getText(bill, 'AMOUNT').replace(/,/g, '') || '0')
  }));
};

const formatTallyDate = (dateStr: string): string => {
  if (!dateStr || dateStr === '') return '';

  if (/^\d{8}$/.test(dateStr)) {
    const yyyy = dateStr.substring(0, 4);
    const mm = dateStr.substring(4, 6);
    const dd = dateStr.substring(6, 8);
    return `${dd}-${mm}-${yyyy}`;
  }

  return dateStr; // fallback (safe)
};

const getPartyLedgerEntry = (ledgerEntries: any[]) =>
  ledgerEntries.find(
    (l: any) => l.ISPARTYLEDGER?.[0]?._ === 'Yes'
  );

const getPaymentLedgerEntry = (ledgerEntries: any[]) =>
  ledgerEntries.find(
    (l: any) => l.ISDEEMEDPOSITIVE?.[0]?._ === 'Yes'
  );

const getReceiptAmount = (ledgerEntry: any): number => {
  if (!ledgerEntry) return 0;
  const amt = parseFloat(getText(ledgerEntry, 'AMOUNT').replace(/,/g, '') || '0');
  return Math.abs(amt);
};

const getReceiptBillDetails = (partyLedger: any, receiptAmount: number) => {
  const billList = partyLedger?.['BILLALLOCATIONS.LIST'];

  if (Array.isArray(billList) && billList.length > 0) {
    return billList.map((bill: any) => ({
      bill_id: getText(bill, 'NAME') || 'Unallocated',
      bill_amount: Math.abs(
        parseFloat(getText(bill, 'AMOUNT').replace(/,/g, '') || '0')
      ).toFixed(2)
    }));
  }
  return [
    {
      bill_id: 'Unallocated',
      bill_amount: receiptAmount.toFixed(2)
    }
  ];
};


const getJVLedgerEntries = (
  ledgerEntries: any[],
  customerId: string
) => {
  return ledgerEntries.map((entry: any) => {
    const amount = Math.abs(
      parseFloat(getText(entry, 'AMOUNT').replace(/,/g, '') || '0')
    );

    const isDeemedPositive = getText(entry, 'ISDEEMEDPOSITIVE') === 'Yes';
    const isDebit = !isDeemedPositive;
    const billAllocs = entry['BILLALLOCATIONS.LIST'];
    const invoiceDetails =
      Array.isArray(billAllocs) && billAllocs.length > 0
        ? billAllocs.map((bill: any) => ({
          invoice_number: getText(bill, 'NAME'),
          invoice_date: formatTallyDate(getText(bill, 'BILLDATE')),
          amount: Math.abs(
            parseFloat(getText(bill, 'AMOUNT').replace(/,/g, '') || '0')
          )
        }))
        : undefined;

    return {
      customer_id: getText(entry, 'ISPARTYLEDGER') === 'Yes' ? customerId : '',
      conversation_rate: 84,
      company_name: getText(entry, 'LEDGERNAME'),
      is_debit: isDebit,
      amount: amount,
      currency: 'INR',
      ...(invoiceDetails ? { invoice_details: invoiceDetails } : {})
    };
  });
};

const getInvoiceTotalFromPartyLedger = (ledgerEntries: any[]): number => {
  const party = ledgerEntries.find(
    (l: any) => l.ISPARTYLEDGER?.[0]?._ === 'Yes'
  );
  if (!party) return 0;
  return Math.abs(
    parseFloat(getText(party, 'AMOUNT').replace(/,/g, '') || '0')
  );
};

const getInvoiceLedgerEntries = (ledgerEntries: any[]) => {
  return ledgerEntries
    .filter((l: any) => getText(l, 'ISPARTYLEDGER') !== 'Yes')
    .map((l: any) => ({
      Ledger_Name: getText(l, 'LEDGERNAME'),
      Amount: getText(l, 'AMOUNT')
    }));
};

const getInvoiceBillDetails = (partyLedger: any, total: number) => {
  const bills = partyLedger?.['BILLALLOCATIONS.LIST'];
  if (Array.isArray(bills) && bills.length > 0) {
    return bills.map((b: any) => ({
      bill_id: getText(b, 'NAME'),
      bill_amount: Math.abs(
        parseFloat(getText(b, 'AMOUNT').replace(/,/g, '') || '0')
      ).toFixed(2)
    }));
  }

  return [
    {
      bill_id: 'Unallocated',
      bill_amount: total.toFixed(2)
    }
  ];
};



export async function syncLedgersAndBuildMap(): Promise<void> {
  try {
    const lastMaxAlterId = '0';
    const cleanLastAlterId = lastMaxAlterId.trim();

    const xmlRequest = `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>ARCUSTOMERS</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVLastMaxAlterID>${cleanLastAlterId}</SVLastMaxAlterID>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="ARCUSTOMERS" ISINITIALIZE="Yes">
            <TYPE>Ledger</TYPE>
            <BELONGSTO>Yes</BELONGSTO>
            <CHILDOF>$$GroupSundryDebtors</CHILDOF>
            <FILTERS>IncrementalFilter</FILTERS>
            <NATIVEMETHOD>Name</NATIVEMETHOD>
            <NATIVEMETHOD>LedgerContact</NATIVEMETHOD>
            <NATIVEMETHOD>Email</NATIVEMETHOD>
            <NATIVEMETHOD>EmailCC</NATIVEMETHOD>
            <NATIVEMETHOD>LedgerPhone</NATIVEMETHOD>
            <NATIVEMETHOD>LedgerMobile</NATIVEMETHOD>
            <NATIVEMETHOD>OpeningBalance</NATIVEMETHOD>
            <NATIVEMETHOD>ClosingBalance</NATIVEMETHOD>
            <NATIVEMETHOD>Address.List</NATIVEMETHOD>
            <NATIVEMETHOD>PartyGSTIN</NATIVEMETHOD>
            <NATIVEMETHOD>GSTRegistrationType</NATIVEMETHOD>
            <NATIVEMETHOD>LedgerState</NATIVEMETHOD>
            <NATIVEMETHOD>BankAllocations.List</NATIVEMETHOD>
            <NATIVEMETHOD>MasterID</NATIVEMETHOD>
            <NATIVEMETHOD>AlterID</NATIVEMETHOD>
          </COLLECTION>

          <!-- Proven working formula: Numeric comparison with $$Number -->
          <SYSTEM TYPE="Formulae" NAME="IncrementalFilter">
            $$Number:$AlterID > $$Number:##SVLastMaxAlterID
          </SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>
`.trim();

    const response = await axios.post('http://localhost:9000', xmlRequest, {
      headers: { 'Content-Type': 'text/xml' },
    });

    const parsed = await parseStringPromise(response.data);
    const ledgers = parsed.ENVELOPE?.BODY?.[0]?.DATA?.[0]?.COLLECTION?.[0]?.LEDGER || [];

    console.log(`Fetched ${ledgers.length} ledgers for customer mapping`);

    if (ledgers.length === 0) {
      console.log('No new/changed customers.');
      return;
    }
    customerMasterIdMap.clear();

    for (const ledger of ledgers) {
      const name = ledger?.$?.NAME || '';
      const masterId = getText(ledger, 'MASTERID').trim();
      console.log(`Mapping customer: Name='${name}', MasterID='${masterId}'`);
      if (name !== '' && masterId !== '') {
        customerMasterIdMap.set(name.toLowerCase(), masterId);
      }
    }
  } catch (error: any) {
    console.error('Ledger sync failed:', error.message);
    throw error;
  }
}

export async function syncVouchers(profile: UserProfile): Promise<void> {
  const runId = await db.logSyncStart('BACKGROUND', ENTITY_TYPE);
  let successCount = { invoice: 0, receipt: 0, jv: 0 };
  let failedCount = { invoice: 0, receipt: 0, jv: 0 };
  let newMaxAlterId = '0';

  try {
    const lastAlterId = await db.getEntityMaxAlterId(ENTITY_TYPE);
    db.log('INFO', 'Voucher sync started', { from_alter_id: lastAlterId });

    console.log(`Starting incremental AR voucher sync from AlterID > ${lastAlterId}`);

    const xmlRequest = `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>ALLVOUCHERS</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVLastMaxAlterID>${lastAlterId}</SVLastMaxAlterID>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="ALLVOUCHERS" ISINITIALIZE="Yes">
            <TYPE>Voucher</TYPE>
            <FILTERS>IncrementalFilter</FILTERS>
            <NATIVEMETHOD>Date</NATIVEMETHOD>
            <NATIVEMETHOD>VoucherNumber</NATIVEMETHOD>
            <NATIVEMETHOD>VoucherTypeName</NATIVEMETHOD>
            <NATIVEMETHOD>PartyLedgerName</NATIVEMETHOD>
            <NATIVEMETHOD>MasterID</NATIVEMETHOD>
            <NATIVEMETHOD>AllLedgerEntries.List</NATIVEMETHOD>
            <NATIVEMETHOD>AllLedgerEntries.LedgerName</NATIVEMETHOD>
            <NATIVEMETHOD>AllLedgerEntries.MasterID</NATIVEMETHOD>
            <NATIVEMETHOD>AllLedgerEntries.Parent</NATIVEMETHOD>
            <NATIVEMETHOD>AllLedgerEntries.Amount</NATIVEMETHOD>
            <NATIVEMETHOD>AllLedgerEntries.IsDeemedPositive</NATIVEMETHOD>
            <NATIVEMETHOD>InventoryEntries.List</NATIVEMETHOD>
            <NATIVEMETHOD>InventoryEntries.StockItemName</NATIVEMETHOD>
            <NATIVEMETHOD>InventoryEntries.BilledQty</NATIVEMETHOD>
            <NATIVEMETHOD>InventoryEntries.Rate</NATIVEMETHOD>
            <NATIVEMETHOD>InventoryEntries.Amount</NATIVEMETHOD>
            <NATIVEMETHOD>InventoryEntries.BasicUnit</NATIVEMETHOD>
            <NATIVEMETHOD>InventoryEntries.AltUnit</NATIVEMETHOD>
            <NATIVEMETHOD>InventoryEntries.TaxablePercentage</NATIVEMETHOD>
            <NATIVEMETHOD>InventoryEntries.Discount</NATIVEMETHOD>
            <NATIVEMETHOD>InventoryEntries.BatchAllocations.List</NATIVEMETHOD>
            <NATIVEMETHOD>InventoryEntries.BatchAllocations.GodownName</NATIVEMETHOD>
            <NATIVEMETHOD>InventoryEntries.BatchAllocations.BatchName</NATIVEMETHOD>
            <NATIVEMETHOD>InventoryEntries.BatchAllocations.BilledQty</NATIVEMETHOD>
            <NATIVEMETHOD>InventoryEntries.BatchAllocations.MFGDATE</NATIVEMETHOD>
            <NATIVEMETHOD>InventoryEntries.BatchAllocations.EXPIRYDATE</NATIVEMETHOD>
            <NATIVEMETHOD>BillAllocations.List</NATIVEMETHOD>
            <NATIVEMETHOD>Narration</NATIVEMETHOD>
            <NATIVEMETHOD>AlterID</NATIVEMETHOD>
          </COLLECTION>

          <SYSTEM TYPE="Formulae" NAME="IncrementalFilter">
            $$Number:$AlterID > $$Number:##SVLastMaxAlterID
          </SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>
`.trim();

    const response = await axios.post('http://localhost:9000', xmlRequest, {
      headers: { 'Content-Type': 'text/xml' },
    });
    await syncLedgersAndBuildMap();
    console.log(`Built customer ledger map with ${customerMasterIdMap.size} entries`, JSON.stringify(customerMasterIdMap, null, 2));
    const parsed = await parseStringPromise(response.data);
    fs.mkdirSync('./dump/voucher', { recursive: true });
    fs.writeFileSync('./dump/voucher/raw_incremental_vouchers.json', JSON.stringify(parsed, null, 2));

    let vouchersXml = parsed.ENVELOPE?.BODY?.[0]?.DATA?.[0]?.COLLECTION?.[0]?.VOUCHER || [];

    if (vouchersXml.length === 0) {
      await db.logSyncEnd(runId, 'SUCCESS', 0, 0, lastAlterId, 'No new vouchers');
      db.log('INFO', 'No new vouchers found');
      return;
    }

    vouchersXml.forEach((voucher: { [x: string]: never[]; }, index: number) => {
      const ledgerEntries = voucher['ALLLEDGERENTRIES.LIST'] || [];
    });

    const arVouchersXml = vouchersXml.filter((voucher: any) => {
      const partyLedger = getText(voucher, 'PARTYLEDGERNAME');
      const ledgerEntries = voucher['ALLLEDGERENTRIES.LIST'] || [];
      const hasParty = partyLedger !== '';
      const hasNonSystemLedger = Array.isArray(ledgerEntries) && ledgerEntries.some((entry: any) => {
        const ledgerName = getText(entry, 'LEDGERNAME').toLowerCase();
        const parent = getText(entry, 'PARENT').toLowerCase();
        const isNonSystem = ledgerName !== '' && !['sales', 'cgst', 'sgst', 'igst', 'freight', 'discount', 'round off', 'output cgst', 'output sgst'].includes(ledgerName) && (parent === 'sundry debtors' || parent.includes('debtors'));
        return isNonSystem;
      });
      const isAR = hasParty || hasNonSystemLedger;
      console.log(`Voucher ${getText(voucher, 'VOUCHERNUMBER')} is AR: ${isAR} (hasParty: ${hasParty}, hasNonSystem: ${hasNonSystemLedger})`);
      return isAR;
    });

    console.log(`Fetched ${vouchersXml.length} total new vouchers, ${arVouchersXml.length} are AR related`);

    if (arVouchersXml.length === 0) {
      console.log('No AR related vouchers in this batch.');
      let highest = parseInt(lastAlterId || '0', 10);
      for (const voucher of vouchersXml) {
        const alterIdNum = parseInt(getText(voucher, 'ALTERID').replace(/\s+/g, '') || '0', 10);
        if (alterIdNum > highest) highest = alterIdNum;
      }
      newMaxAlterId = highest.toString();
      return;
    }

    const groupedVouchers: any = {
      invoice: [],
      receipt: [],
      jv_entry: []
    };

    let highestAlterId = parseInt(lastAlterId || '0', 10);

    for (const voucher of arVouchersXml) {
      const voucherType = getText(voucher, 'VOUCHERTYPENAME').toLowerCase();
      const rawAlterId = getText(voucher, 'ALTERID');
      const alterIdNum = parseInt((rawAlterId || '0').replace(/\s+/g, ''), 10);
      if (!isNaN(alterIdNum) && alterIdNum > highestAlterId) {
        highestAlterId = alterIdNum;
      }

      const ledgerEntries = voucher['ALLLEDGERENTRIES.LIST'] || [];
      const ledgerEntriesAll = getLedgerEntries(ledgerEntries);
      const lineItems = getLineItems(voucher['ALLINVENTORYENTRIES.LIST'] || []);
      const billDetails = getBillDetails(voucher['BILLALLOCATIONS.LIST'] || []);

      const partyLedgerName = getText(voucher, 'PARTYLEDGERNAME');

      const ledgerList = voucher['LEDGERENTRIES.LIST'] || [];
      let inventoryTotal = 0;
      if (ledgerList && ledgerList.length > 0) {
        const amountStr = getText(ledgerList[0], 'AMOUNT').replace(/,/g, '');
        console.log(`Line item amount string: '${amountStr}'`);
        inventoryTotal = Math.abs(parseFloat(amountStr)) || 0;
      }

      let customerId = '';
      if (partyLedgerName && partyLedgerName !== '') {
        const key = partyLedgerName.toLowerCase();
        customerId = customerMasterIdMap.get(key) || '';
      }

      const partyLedger = getText(voucher, 'PARTYLEDGERNAME');
      const invoiceId = getText(voucher, 'MASTERID');
      const issueDate = getText(voucher, 'DATE');
      const billerId = profile?.biller_id || '';
      const address = getText(voucher, 'ADDRESS') || '';
      const state = getText(voucher, 'STATE') || '';
      const country = 'india';
      const companyName = getText(voucher, 'COMPANYNAME') || '';

      let transformedObj: any = null;
      if (voucherType === 'sales' || voucherType === 'credit note') {

        const ledgerEntriesRaw = voucher['ALLLEDGERENTRIES.LIST'] || [];
        const inventoryEntriesRaw = voucher['ALLINVENTORYENTRIES.LIST'] || [];
        const partyLedger = ledgerEntriesRaw.find(
          (l: any) => l.ISPARTYLEDGER?.[0]?._ === 'Yes'
        );
        const total = Math.abs(
          parseFloat(getText(partyLedger, 'AMOUNT').replace(/,/g, '') || '0')
        );
        const bill_details = getInvoiceBillDetails(partyLedger, total);
        const Ledger_Entries = ledgerEntriesRaw
          .filter((l: any) => {
            const isParty = getText(l, 'ISPARTYLEDGER') === 'Yes';
            const parent = getText(l, 'PARENT').toLowerCase();
            return !isParty && !parent.includes('sales');
          })
          .map((l: any) => ({
            Ledger_Name: getText(l, 'LEDGERNAME'),
            Amount: Math.abs(
              parseFloat(getText(l, 'AMOUNT').replace(/,/g, '') || '0')
            )
          }));
        const Inventory_Details = inventoryEntriesRaw
          .filter((i: any) => getText(i, 'STOCKITEMNAME') !== '')
          .map((i: any) => {

            const billedQtyStr = getText(i, 'BILLEDQTY');
            const qty = parseQty(billedQtyStr);

            const amt = Math.abs(
              parseFloat(getText(i, 'AMOUNT').replace(/,/g, '') || '0')
            );

            const rateFromTally = parseFloat(getText(i, 'RATE').replace(/,/g, '') || '0');
            const rate = rateFromTally > 0
              ? rateFromTally
              : (qty > 0 ? amt / qty : 0);

            return {
              StockItem_Name: getText(i, 'STOCKITEMNAME'),
              Quantity: qty,
              AltQuantity: qty,
              Rate: Number(rate.toFixed(2)),
              UOM: getText(i, 'BASICUNIT') || '',
              AlterbativeUnit: getText(i, 'ALTUNIT') || '',
              Amount: amt,
              GST_perc: getText(i, 'TAXABLEPERCENTAGE') || '',
              Discount: getText(i, 'DISCOUNT') || '0',
              Batch_Allocation: getBatchAllocation(i['BATCHALLOCATIONS.LIST'] || [])
            };
          });

        transformedObj = {
          invoice_id: invoiceId,
          invoice_number: getText(voucher, 'VOUCHERNUMBER'),
          voucher_type: voucherType === 'credit note' ? 'credit_note' : 'sales',
          issue_date: formatTallyDate(issueDate),
          due_date: formatTallyDate(
            getText(
              partyLedger?.['BILLALLOCATIONS.LIST']?.[0],
              'BILLCREDITPERIOD'
            )
          ),
          customer_id: customerId,
          status: '',
          type: 'simple',
          total,
          balance: voucherType === 'credit note' ? 0 : total,
          biller_id: billerId,
          address,
          state,
          country,
          company_name: companyName,
          Ewaybill_Num: '',
          Date: formatTallyDate(issueDate),
          "DispatchFrom ": '',
          Dispatchto: '',
          TransporatName: '',
          TransporatId: '',
          Mode: '',
          LadingNo: '',
          LadingDate: '',
          Vehicle_number: '',
          Vehicle_type: '',
          Acknowledge_No: '',
          Ack_Date: '',
          IRN: '',
          BilltoPlace: '',
          "Ship to Place": '',
          bill_details,
          Ledger_Entries,
          Inventory_Entries: Inventory_Details.length > 0,
          Order_NUmber: '',
          Delivery_note_no: '',
          Inventory_Details
        };

        groupedVouchers.invoice.push(transformedObj);
      } else if (voucherType === 'receipt') {
        const partyLedgerEntry = getPartyLedgerEntry(ledgerEntries);
        const paymentLedgerEntry = getPaymentLedgerEntry(ledgerEntries);

        const receiptAmount = getReceiptAmount(partyLedgerEntry);

        const billDetails = getReceiptBillDetails(
          partyLedgerEntry,
          receiptAmount
        );

        transformedObj = {
          receipt_id: invoiceId,
          receipt_number: getText(voucher, 'VOUCHERNUMBER'),
          receipt_date: formatTallyDate(issueDate),
          customer_name: partyLedger,
          customer_id: customerId,
          receipt_amount: receiptAmount.toFixed(2),
          biller_id: billerId,
          transaction_type: getText(paymentLedgerEntry, 'LEDGERNAME') || 'Unknown',
          bill_details: billDetails
        };

        groupedVouchers.receipt.push(transformedObj);
      } else if (voucherType === 'journal') {
        const ledgerEntriesRaw = voucher['ALLLEDGERENTRIES.LIST'] || [];
        const jvLedgerEntries = getJVLedgerEntries(
          ledgerEntriesRaw,
          customerId
        );

        transformedObj = {
          entry_type: 'JVENTRY',
          transation_id: `Vd${invoiceId}`,
          biller_id: billerId,
          voucher_number: getText(voucher, 'VOUCHERNUMBER'),
          ref_number: '',
          date: formatTallyDate(issueDate),
          ref_date: formatTallyDate(issueDate),
          narration: getText(voucher, 'NARRATION'),
          ledger_entries: jvLedgerEntries
        };

        groupedVouchers.jv_entry.push(transformedObj);
      }
    }

    newMaxAlterId = highestAlterId.toString();

    fs.writeFileSync('./dump/voucher/grouped_vouchers.json', JSON.stringify(groupedVouchers, null, 2));
    console.log(`Processed ${arVouchersXml.length} AR vouchers into groups: Invoice=${groupedVouchers.invoice.length}, Receipt=${groupedVouchers.receipt.length}, JV=${groupedVouchers.jv_entry.length} (highest AlterID: ${newMaxAlterId})`);

    const sendBatch = async (items: any[], apiUrl: string, type: 'invoice' | 'receipt' | 'jv') => {
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        const payload: any = {};
        if (type === 'invoice') payload.invoice = batch;
        else if (type === 'receipt') payload.receipt = batch;
        else payload.jv_entry = batch;

        try {
          await axios.post(apiUrl, payload, {
            headers: { 'API-KEY': API_KEY, 'Content-Type': 'application/json' },
            timeout: 30000
          });
          successCount[type] += batch.length;
          db.log('INFO', `${type.charAt(0).toUpperCase() + type.slice(1)} batch synced`, { batch_index: i / BATCH_SIZE + 1, count: batch.length });
        } catch (err: any) {
          failedCount[type] += batch.length;
          const errMsg = err.response?.data || err.message;
          db.log('ERROR', `${type} batch failed`, { error: errMsg });
          fs.writeFileSync(`./dump/voucher/failed_${type}_batch_${Date.now()}_${i}.json`, JSON.stringify(payload, null, 2));
        }
      }
    };

    await Promise.all([
      sendBatch(groupedVouchers.invoice, INVOICE_API, 'invoice'),
      sendBatch(groupedVouchers.receipt, RECEIPT_API, 'receipt'),
      sendBatch(groupedVouchers.jv_entry, JV_API, 'jv')
    ]);

    const totalSuccess = successCount.invoice + successCount.receipt + successCount.jv;
    const totalFailed = failedCount.invoice + failedCount.receipt + failedCount.jv;
    const status = totalFailed === 0 ? 'SUCCESS' : (totalSuccess > 0 ? 'PARTIAL' : 'FAILED');

    if (totalSuccess > 0) {
      await db.updateEntityMaxAlterId(ENTITY_TYPE, newMaxAlterId);
    }

    await db.logSyncEnd(runId, status, totalSuccess, totalFailed, newMaxAlterId, `${totalSuccess} synced`, {
      invoice: { success: successCount.invoice, failed: failedCount.invoice },
      receipt: { success: successCount.receipt, failed: failedCount.receipt },
      jv: { success: successCount.jv, failed: failedCount.jv }
    });
    await db.updateLastSuccessfulSync();

    db.log('INFO', 'Voucher sync completed', { totalSuccess, totalFailed, highest_alter_id: newMaxAlterId });

  } catch (error: any) {
    await db.logSyncEnd(runId, 'FAILED', 0, 0, undefined, error.message);
    db.log('ERROR', 'Voucher sync crashed', { error: error.message });
    throw error;
  }
}

function parseQty(billedQtyStr: string): number {
  return parseFloat(billedQtyStr.replace(/,/g, '') || '0');
}
