import axios from 'axios';
import fs from 'fs';
import { DatabaseService, UserProfile, VoucherData, VoucherLedgerData } from '../../database/database.service';
import { getApiUrl } from '../../config/api-url-helper';
import { fetchVouchersBatch, extractVouchersFromBatch } from '../../tally/batch-fetcher';

const db = new DatabaseService();

const ENTITY_TYPE = 'VOUCHER';
const BATCH_SIZE = 20; // API batch size (for sending to API)
const TALLY_BATCH_SIZE = 20; // Tally fetch batch size (reduced to prevent crashes)
const BATCH_DELAY_MS = 1000; // Delay between batches (increased to 1000ms for safety)
const API_KEY = '7061797A6F72726F74616C6C79';

// In-memory customer map for fast lookups (ledger_name -> tally_master_id)
const customerMasterIdMap = new Map<string, string>();

/**
 * Build customer map from SQLite database for fast lookups
 * This avoids querying database for each voucher
 */
async function buildCustomerMap(): Promise<void> {
  try {
    customerMasterIdMap.clear();
    // Get all customers from database
    const customers = await db.getAllCustomersForMap();

    for (const customer of customers) {
      if (customer.ledger_name && customer.tally_master_id) {
        customerMasterIdMap.set(customer.ledger_name.toLowerCase(), customer.tally_master_id);
      }
    }
    console.log(`Built customer map with ${customerMasterIdMap.size} entries from database`);
  } catch (error: any) {
    console.error('Failed to build customer map:', error.message);
    // Continue without map, will fallback to database queries
  }
}

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
export async function syncVouchers(profile: UserProfile): Promise<void> {
  const runId = await db.logSyncStart('BACKGROUND', ENTITY_TYPE);
  let successCount = { invoice: 0, receipt: 0, jv: 0 };
  let failedCount = { invoice: 0, receipt: 0, jv: 0 };
  let newMaxAlterId = '0';

  try {
    const baseUrl = await getApiUrl(db);
    const INVOICE_API = `${baseUrl}/invoice/tally/create`;
    const RECEIPT_API = `${baseUrl}/billers/tally/payment`;
    const JV_API = `${baseUrl}/ledgers/tally/jv-entries`;

    const lastAlterId = await db.getEntityMaxAlterId(ENTITY_TYPE);
    db.log('INFO', 'Voucher sync started', { from_alter_id: lastAlterId });

    // Build customer map once at the start for fast lookups
    await buildCustomerMap();

    console.log(`Starting batch AR voucher sync from AlterID > ${lastAlterId}`);

    let currentAlterId = parseInt(lastAlterId || '0', 10);
    let batchNumber = 0;
    let hasMoreBatches = true;

    // Process in batches from Tally
    // If lastAlterId = 203 and size = 100, fetch all records with AlterID > 203, up to 100 records
    while (hasMoreBatches) {
      batchNumber++;
      const fromAlterId = currentAlterId.toString(); // Start from last processed AlterID

      // Create batch tracking record
      const batchId = await db.createSyncBatch(
        runId,
        ENTITY_TYPE,
        batchNumber,
        TALLY_BATCH_SIZE,
        fromAlterId,
        '' // No upper bound
      );

      let vouchersXml: any[] = [];
      try {
        // Fetch batch from Tally
        // Pass TALLY_BATCH_SIZE as sizeMax to limit the number of records returned
        console.log(`Fetching vouchers batch ${batchNumber}: AlterID > ${fromAlterId} (max ${TALLY_BATCH_SIZE} records)`);
        const parsed = await fetchVouchersBatch(fromAlterId, TALLY_BATCH_SIZE);
        fs.mkdirSync('./dump/voucher', { recursive: true });
        fs.writeFileSync(`./dump/voucher/raw_batch_${batchNumber}.json`, JSON.stringify(parsed, null, 2));

        vouchersXml = extractVouchersFromBatch(parsed);

        if (vouchersXml.length === 0) {
          hasMoreBatches = false;
          await db.updateSyncBatchStatus(batchId, 'COMPLETED', 0);
          break;
        }

        // Filter and sort by AlterID
        // Fetch records with AlterID > fromAlterId (exclusive)
        const fromAlterIdNum = parseInt(fromAlterId, 10);
        vouchersXml = vouchersXml
          .filter((voucher: any) => {
            const alterId = parseInt(getText(voucher, 'ALTERID') || '0', 10);
            return alterId > fromAlterIdNum;
          })
          .sort((a: any, b: any) => {
            const idA = parseInt(getText(a, 'ALTERID') || '0', 10);
            const idB = parseInt(getText(b, 'ALTERID') || '0', 10);
            return idA - idB;
          })
          .slice(0, TALLY_BATCH_SIZE);

        if (vouchersXml.length === 0) {
          hasMoreBatches = false;
          await db.updateSyncBatchStatus(batchId, 'COMPLETED', 0);
          break;
        }

        await db.updateSyncBatchStatus(batchId, 'FETCHED', vouchersXml.length);

        // Calculate max AlterID from ALL vouchers (before AR filtering)
        // This ensures we don't skip any vouchers when updating the cursor
        let batchHighestAlterId = currentAlterId;
        for (const voucher of vouchersXml) {
          const alterIdNum = parseInt(getText(voucher, 'ALTERID').replace(/\s+/g, '') || '0', 10);
          if (!isNaN(alterIdNum) && alterIdNum > batchHighestAlterId) {
            batchHighestAlterId = alterIdNum;
          }
        }

        // Filter AR vouchers
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
          return isAR;
        });

        console.log(`Fetched ${vouchersXml.length} total vouchers, ${arVouchersXml.length} are AR related in batch ${batchNumber}`);

        if (arVouchersXml.length === 0) {
          // Update AlterID even if no AR vouchers (already calculated above)
          currentAlterId = batchHighestAlterId;
          newMaxAlterId = currentAlterId.toString();
          await db.updateSyncBatchStatus(batchId, 'COMPLETED', vouchersXml.length, 0);
          if (vouchersXml.length < TALLY_BATCH_SIZE) {
            hasMoreBatches = false;
          }
          continue;
        }

        const groupedVouchers: any = {
          invoice: [],
          receipt: [],
          jv_entry: []
        };

        for (const voucher of arVouchersXml) {
          const voucherType = getText(voucher, 'VOUCHERTYPENAME').toLowerCase();
          const rawAlterId = getText(voucher, 'ALTERID');

          const ledgerEntries = voucher['ALLLEDGERENTRIES.LIST'] || [];
          const ledgerEntriesAll = getLedgerEntries(ledgerEntries);
          const lineItems = getLineItems(voucher['ALLINVENTORYENTRIES.LIST'] || []);
          const billDetails = getBillDetails(voucher['BILLALLOCATIONS.LIST'] || []);

          const partyLedgerName = getText(voucher, 'PARTYLEDGERNAME');

          // Lookup customer from in-memory map (fast) or fallback to SQLite
          let customerId = '';
          if (partyLedgerName && partyLedgerName !== '') {
            const key = partyLedgerName.toLowerCase();
            customerId = customerMasterIdMap.get(key) || '';

            // Fallback to database if not in map
            if (!customerId) {
              const customer = await db.getCustomerByLedgerName(partyLedgerName);
              customerId = customer?.tally_master_id || '';
              // Add to map for future lookups
              if (customerId) {
                customerMasterIdMap.set(key, customerId);
              } else {
                console.log(`Warning: Customer not found for ledger name: ${partyLedgerName}`);
              }
            }
          }

          const invoiceId = getText(voucher, 'MASTERID');
          const issueDate = getText(voucher, 'DATE');
          const billerId = profile?.biller_id || '';
          const address = getText(voucher, 'ADDRESS') || '';
          const state = getText(voucher, 'STATE') || '';
          const country = 'india';
          const companyName = getText(voucher, 'COMPANYNAME') || '';
          const narration = getText(voucher, 'NARRATION') || '';

          let transformedObj: any = null;
          let totalAmount = 0;
          let voucherTypeForDB = '';
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

            totalAmount = total;
            voucherTypeForDB = voucherType === 'credit note' ? 'credit_note' : 'sales';
            transformedObj = {
              invoice_id: invoiceId,
              invoice_number: getText(voucher, 'VOUCHERNUMBER'),
              voucher_type: voucherTypeForDB,
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

            // Store in SQLite FIRST (before API send)
            const voucherData: VoucherData = {
              tally_master_id: invoiceId,
              voucher_number: getText(voucher, 'VOUCHERNUMBER'),
              voucher_type: voucherTypeForDB,
              voucher_date: formatTallyDate(issueDate),
              party_ledger_name: partyLedgerName,
              customer_master_id: customerId || undefined,
              total_amount: totalAmount,
              biller_id: billerId,
              address: address || undefined,
              state: state || undefined,
              country: country,
              company_name: companyName || undefined,
              narration: narration || undefined,
              tally_alter_id: rawAlterId,
              voucher_data_json: JSON.stringify(transformedObj),
              synced_to_api: 0
            };
            const voucherDbId = await db.insertVoucher(voucherData);

            // Store voucher ledger entries
            const voucherLedgers: VoucherLedgerData[] = ledgerEntriesRaw.map((entry: any) => ({
              voucher_id: voucherDbId,
              ledger_name: getText(entry, 'LEDGERNAME'),
              amount: Math.abs(parseFloat(getText(entry, 'AMOUNT').replace(/,/g, '') || '0')),
              is_party_ledger: getText(entry, 'ISPARTYLEDGER') === 'Yes' ? 1 : 0,
              is_deemed_positive: getText(entry, 'ISDEEMEDPOSITIVE') === 'Yes' ? 1 : 0,
              parent: getText(entry, 'PARENT') || undefined
            }));
            await db.insertVoucherLedgers(voucherDbId, voucherLedgers);

            groupedVouchers.invoice.push(transformedObj);
          } else if (voucherType === 'receipt') {
            const ledgerEntriesRaw = voucher['ALLLEDGERENTRIES.LIST'] || [];
            const partyLedgerEntry = getPartyLedgerEntry(ledgerEntriesRaw);
            const paymentLedgerEntry = getPaymentLedgerEntry(ledgerEntriesRaw);

            const receiptAmount = getReceiptAmount(partyLedgerEntry);

            const billDetails = getReceiptBillDetails(
              partyLedgerEntry,
              receiptAmount
            );

            totalAmount = receiptAmount;
            voucherTypeForDB = 'receipt';
            transformedObj = {
              receipt_id: invoiceId,
              receipt_number: getText(voucher, 'VOUCHERNUMBER'),
              receipt_date: formatTallyDate(issueDate),
              customer_name: partyLedgerName,
              customer_id: customerId,
              receipt_amount: receiptAmount.toFixed(2),
              biller_id: billerId,
              transaction_type: getText(paymentLedgerEntry, 'LEDGERNAME') || 'Unknown',
              bill_details: billDetails,
              voucher_type: 'receipt'
            };

            // Store in SQLite FIRST
            const receiptVoucherData: VoucherData = {
              tally_master_id: invoiceId,
              voucher_number: getText(voucher, 'VOUCHERNUMBER'),
              voucher_type: 'receipt',
              voucher_date: formatTallyDate(issueDate),
              party_ledger_name: partyLedgerName,
              customer_master_id: customerId || undefined,
              total_amount: totalAmount,
              biller_id: billerId,
              address: address || undefined,
              state: state || undefined,
              country: country,
              company_name: companyName || undefined,
              narration: narration || undefined,
              tally_alter_id: rawAlterId,
              voucher_data_json: JSON.stringify(transformedObj),
              synced_to_api: 0
            };
            const receiptVoucherDbId = await db.insertVoucher(receiptVoucherData);
            const receiptLedgers: VoucherLedgerData[] = ledgerEntriesRaw.map((entry: any) => ({
              voucher_id: receiptVoucherDbId,
              ledger_name: getText(entry, 'LEDGERNAME'),
              amount: Math.abs(parseFloat(getText(entry, 'AMOUNT').replace(/,/g, '') || '0')),
              is_party_ledger: getText(entry, 'ISPARTYLEDGER') === 'Yes' ? 1 : 0,
              is_deemed_positive: getText(entry, 'ISDEEMEDPOSITIVE') === 'Yes' ? 1 : 0,
              parent: getText(entry, 'PARENT') || undefined
            }));
            await db.insertVoucherLedgers(receiptVoucherDbId, receiptLedgers);

            groupedVouchers.receipt.push(transformedObj);
          } else if (voucherType === 'journal') {
            const ledgerEntriesRaw = voucher['ALLLEDGERENTRIES.LIST'] || [];
            const jvLedgerEntries = getJVLedgerEntries(
              ledgerEntriesRaw,
              customerId
            );

            voucherTypeForDB = 'journal';
            // Calculate total from ledger entries for JV
            totalAmount = ledgerEntriesRaw.reduce((sum: number, entry: any) => {
              return sum + Math.abs(parseFloat(getText(entry, 'AMOUNT').replace(/,/g, '') || '0'));
            }, 0);
            transformedObj = {
              entry_type: 'JVENTRY',
              voucher_type: 'jv_entry',
              transation_id: `Vd${invoiceId}`,
              biller_id: billerId,
              voucher_number: getText(voucher, 'VOUCHERNUMBER'),
              ref_number: '',
              date: formatTallyDate(issueDate),
              ref_date: formatTallyDate(issueDate),
              narration: narration,
              ledger_entries: jvLedgerEntries
            };

            // Store in SQLite FIRST
            const jvVoucherData: VoucherData = {
              tally_master_id: invoiceId,
              voucher_number: getText(voucher, 'VOUCHERNUMBER'),
              voucher_type: 'journal',
              voucher_date: formatTallyDate(issueDate),
              party_ledger_name: partyLedgerName,
              customer_master_id: customerId || undefined,
              total_amount: totalAmount,
              biller_id: billerId,
              address: address || undefined,
              state: state || undefined,
              country: country,
              company_name: companyName || undefined,
              narration: narration || undefined,
              tally_alter_id: rawAlterId,
              voucher_data_json: JSON.stringify(transformedObj),
              synced_to_api: 0
            };
            const jvVoucherDbId = await db.insertVoucher(jvVoucherData);
            const jvLedgers: VoucherLedgerData[] = ledgerEntriesRaw.map((entry: any) => ({
              voucher_id: jvVoucherDbId,
              ledger_name: getText(entry, 'LEDGERNAME'),
              amount: Math.abs(parseFloat(getText(entry, 'AMOUNT').replace(/,/g, '') || '0')),
              is_party_ledger: getText(entry, 'ISPARTYLEDGER') === 'Yes' ? 1 : 0,
              is_deemed_positive: getText(entry, 'ISDEEMEDPOSITIVE') === 'Yes' ? 1 : 0,
              parent: getText(entry, 'PARENT') || undefined
            }));
            await db.insertVoucherLedgers(jvVoucherDbId, jvLedgers);

            groupedVouchers.jv_entry.push(transformedObj);
          }
        }

        // Update AlterID and batch status
        currentAlterId = batchHighestAlterId;
        newMaxAlterId = currentAlterId.toString();
        await db.updateSyncBatchStatus(batchId, 'STORED', vouchersXml.length, arVouchersXml.length);

        fs.writeFileSync(`./dump/voucher/grouped_vouchers_batch_${batchNumber}.json`, JSON.stringify(groupedVouchers, null, 2));
        console.log(`Processed ${arVouchersXml.length} AR vouchers into groups: Invoice=${groupedVouchers.invoice.length}, Receipt=${groupedVouchers.receipt.length}, JV=${groupedVouchers.jv_entry.length} (batch ${batchNumber}, highest AlterID: ${newMaxAlterId})`);

        // Send to API in batches
        const sendBatchToAPI = async (items: any[], apiUrl: string, type: 'invoice' | 'receipt' | 'jv') => {
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

              // Log each voucher as successful
              for (const item of batch) {
                const voucherNumber = item.invoice_number || item.receipt_number || item.voucher_number || 'N/A';
                const voucherType = item.voucher_type || item.entry_type || type.toUpperCase();
                const date = item.issue_date || item.receipt_date || item.date || new Date().toISOString().split('T')[0];
                const partyName = item.customer_name || item.customer_id || null;
                const amount = parseFloat(item.total || item.receipt_amount || '0') || 0;

                await db.logTallyVoucher(
                  voucherNumber,
                  voucherType,
                  date,
                  partyName,
                  amount,
                  'SUCCESS',
                  null,
                  runId
                );
              }
            } catch (err: any) {
              failedCount[type] += batch.length;
              const errMsg = err.response?.data || err.message;
              db.log('ERROR', `${type} batch failed`, { error: errMsg });
              fs.writeFileSync(`./dump/voucher/failed_${type}_batch_${Date.now()}_${i}.json`, JSON.stringify(payload, null, 2));

              // Log each voucher as failed
              for (const item of batch) {
                const voucherNumber = item.invoice_number || item.receipt_number || item.voucher_number || 'N/A';
                const voucherType = item.voucher_type || item.entry_type || type.toUpperCase();
                const date = item.issue_date || item.receipt_date || item.date || new Date().toISOString().split('T')[0];
                const partyName = item.customer_name || item.customer_id || null;
                const amount = parseFloat(item.total || item.receipt_amount || '0') || 0;
                const errorMessage = typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg);

                await db.logTallyVoucher(
                  voucherNumber,
                  voucherType,
                  date,
                  partyName,
                  amount,
                  'FAILED',
                  errorMessage,
                  runId
                );
              }
            }
          }
        };

        await Promise.all([
          sendBatchToAPI(groupedVouchers.invoice, INVOICE_API, 'invoice'),
          sendBatchToAPI(groupedVouchers.receipt, RECEIPT_API, 'receipt'),
          sendBatchToAPI(groupedVouchers.jv_entry, JV_API, 'jv')
        ]);

        const batchSuccess = successCount.invoice + successCount.receipt + successCount.jv;
        const batchFailed = failedCount.invoice + failedCount.receipt + failedCount.jv;

        await db.updateSyncBatchStatus(
          batchId,
          batchFailed === 0 ? 'API_SUCCESS' : 'API_FAILED',
          vouchersXml.length,
          arVouchersXml.length,
          batchSuccess,
          batchFailed > 0 ? `API failed for ${batchFailed} records` : undefined
        );

        // Check if we should continue (if we got less than batch size, we're done)
        if (vouchersXml.length < TALLY_BATCH_SIZE) {
          hasMoreBatches = false;
        }

        // Add a small delay between batches to avoid overwhelming Tally
        if (hasMoreBatches) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
        }

      } catch (error: any) {
        await db.updateSyncBatchStatus(batchId, 'API_FAILED', 0, 0, 0, error.message);
        db.log('ERROR', `Voucher batch ${batchNumber} failed`, { error: error.message });
        // Continue with next batch even if this one failed
        if (vouchersXml?.length < TALLY_BATCH_SIZE) {
          hasMoreBatches = false;
        }
      }
    }

    const totalSuccess = successCount.invoice + successCount.receipt + successCount.jv;
    const totalFailed = failedCount.invoice + failedCount.receipt + failedCount.jv;
    const status = totalFailed === 0 ? 'SUCCESS' : (totalSuccess > 0 ? 'PARTIAL' : 'FAILED');

    if (totalSuccess > 0 || newMaxAlterId !== '0') {
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
