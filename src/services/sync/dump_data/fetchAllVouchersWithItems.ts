import axios from 'axios';
import fs from 'fs';
import { parseStringPromise } from 'xml2js';

export async function fetchAllVouchersWithItems() {
    const xmlRequest = `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>AllSalesVouchersDetailed</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="AllSalesVouchersDetailed" ISINITIALIZE="Yes">
            <TYPE>Voucher</TYPE>
            <NATIVEMETHOD>*</NATIVEMETHOD>
            <FETCH>*</FETCH>
            <FETCH>AllLedgerEntries.*</FETCH>
            <FETCH>AllInventoryEntries.*</FETCH>
            <FETCH>ALLINVENTORYENTRIES.LIST.*</FETCH>
            <FETCH>BATCHALLOCATIONS.*</FETCH>
            <!-- Explicitly fetch bill allocations at all levels -->
            <FETCH>BILLALLOCATIONS.LIST.*</FETCH>
            <FETCH>ALLBILLALLOCATIONS.LIST.*</FETCH>
            <FETCH>LedgerEntries.BillAllocations.*</FETCH>
            <FETCH>ALLLEDGERENTRIES.LIST.BILLALLOCATIONS.LIST.*</FETCH>
            <FETCH>EWAYBILLDETAILS.*</FETCH>
            <FETCH>IRNDETAILS.*</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`.trim();

    // Helper to format Tally date (YYYYMMDD) → DD-MM-YYYY
    const formatDate = (tallyDate: string): string => {
        if (!tallyDate || tallyDate.length !== 8) return '';
        const y = tallyDate.substring(0, 4);
        const m = tallyDate.substring(4, 6);
        const d = tallyDate.substring(6, 8);
        return `${d}-${m}-${y}`;
    };

    // Generate PDF URL
    const generatePdfUrl = (voucherNumber: string, voucherType: string = 'Sales'): string => {
        const encodedVchType = encodeURIComponent(voucherType);
        const encodedVchNum = encodeURIComponent(voucherNumber);
        return `http://localhost:9000/?vch=${encodedVchType}&num=${encodedVchNum}&format=pdf`;
    };

    try {
        const response = await axios.post('http://localhost:9000', xmlRequest, {
            headers: { 'Content-Type': 'text/xml' }
        });

        const parsed = await parseStringPromise(response.data);

        const rawFile = './dump/invoice/all_invoices_raw.json';
        fs.mkdirSync('./dump/invoice', { recursive: true });
        fs.writeFileSync(rawFile, JSON.stringify(parsed, null, 2), 'utf8');

        const collection = parsed.ENVELOPE?.BODY?.[0]?.DATA?.[0]?.COLLECTION?.[0];
        const vouchersXml = collection?.VOUCHER || [];

        const invoices = vouchersXml.map((voucher: any, index: number) => {
            const obj: Record<string, any> = {};

            if (voucher.$) {
                Object.keys(voucher.$).forEach(k => obj[k.toUpperCase()] = voucher.$[k]);
            }

            Object.keys(voucher).forEach(key => {
                if (key === '$') return;
                const value = voucher[key];
                if (key.endsWith('.LIST') && Array.isArray(value)) {
                    const base = key.replace('.LIST', '');
                    obj[base] = value.map((item: any) => {
                        const sub: Record<string, any> = {};
                        if (item.$) Object.keys(item.$).forEach(a => sub[a.toUpperCase()] = item.$[a]);
                        Object.keys(item).forEach(sk => {
                            if (sk !== '$' && Array.isArray(item[sk]) && item[sk].length > 0) {
                                sub[sk] = item[sk][0];
                            }
                        });
                        return sub;
                    });
                } else if (Array.isArray(value) && value.length > 0) {
                    obj[key] = value[0];
                }
            });

            const voucherType = (obj.VOUCHERTYPENAME || '').toLowerCase().includes('credit')
                ? 'credit_note'
                : 'sales';

            const total = parseFloat(obj.AMOUNT || '0') || 0;

            const hasInventory = Array.isArray(obj.ALLINVENTORYENTRIES) && obj.ALLINVENTORYENTRIES.length > 0;

            const ewayEnabled = total > 50000 && hasInventory;

            const inventoryDetails = (obj.ALLINVENTORYENTRIES || []).map((inv: any) => ({
                StockItem_Name: inv.STOCKITEMNAME || '',
                Quantity: inv.BILLEDQTY || '',
                AltQuantity: inv.ACTUALQTY || '',
                Rate: inv.RATE || '',
                UOM: inv.BASEUNITS || '',
                AlterbativeUnit: inv.ALTERNATEUNITS || '',
                Amount: inv.AMOUNT || '',
                GST_perc: inv.GSTRATE ? `${inv.GSTRATE}%` : '',
                Discount: inv.DISCOUNT || '',
                Batch_Allocation: (inv.BATCHALLOCATIONS || []).map((batch: any) => ({
                    Godown_Name: batch.GODOWN || '',
                    Batch_Name: batch.BATCHNAME || '',
                    'Mfg date': batch.MFGDATE ? formatDate(batch.MFGDATE) : '',
                    BACH_QTY: batch.BATCHQTY || '',
                    'Due Date': batch.EXPIRYDATE ? formatDate(batch.EXPIRYDATE) : ''
                }))
            }));

            const ledgerEntries = (obj.ALLLEDGERENTRIES || []).map((le: any) => ({
                Ledger_Name: le.LEDGERNAME || '',
                Amount: le.AMOUNT || '0'
            }));

            // Improved bill_details extraction
            let billDetails: Array<{ bill_id: string; bill_amount: string }> = [];

            // Try multiple possible locations for bill allocations
            const possibleBillSources = [
                obj.BILLALLOCATIONS,              // Top-level
                obj.ALLBILLALLOCATIONS,           // All bills
                ...(obj.ALLLEDGERENTRIES || []).flatMap((le: any) => le.BILLALLOCATIONS || []),  // Inside ledger entries
                ...(obj.ALLLEDGERENTRIES || []).flatMap((le: any) => le.ALLBILLALLOCATIONS || [])
            ];

            possibleBillSources.forEach(source => {
                if (Array.isArray(source)) {
                    source.forEach((bill: any) => {
                        if (bill.NAME || bill.AMOUNT) {
                            billDetails.push({
                                bill_id: bill.NAME || 'N/A',
                                bill_amount: (bill.AMOUNT || '0').toString()
                            });
                        }
                    });
                }
            });

            // Fallback if no bills found
            if (billDetails.length === 0) {
                billDetails = [{ bill_id: 'N/A', bill_amount: '0' }];
            }

            const pdf_url = generatePdfUrl(obj.VOUCHERNUMBER || '', obj.VOUCHERTYPENAME || 'Sales');

            return {
                invoice_id: `Tally${obj.ALTERID || index + 1001}001`,
                invoice_number: obj.VOUCHERNUMBER || '',
                voucher_type: voucherType,
                issue_date: obj.DATE ? formatDate(obj.DATE) : '',
                due_date: obj.DUEDATE ? formatDate(obj.DUEDATE) : '',
                customer_id: obj.PARTYLEDGERMASTERID || '',
                status: '',
                type: 'simple',
                total,
                balance: 0,
                biller_id: 'a6ca7e76-34b7-40db-85e4-481ccc5f662f',
                address: obj.PARTYADDRESS || 'shyam nagar',
                state: obj.PARTYSTATENAME || 'delhi',
                country: 'india',
                company_name: obj.PARTYLEDGERNAME || '',
                pdf_url,
                ...(ewayEnabled && obj.EWAYBILLDETAILS ? {
                    Ewaybill_Num: obj.EWAYBILLDETAILS.EWAYBILLNO || '',
                    Date: obj.EWAYBILLDETAILS.DATE ? formatDate(obj.EWAYBILLDETAILS.DATE) : '',
                    'DispatchFrom ': obj.EWAYBILLDETAILS.FROMSTATENAME || '',
                    Dispatchto: obj.EWAYBILLDETAILS.TOSTATENAME || '',
                    TransporatName: obj.EWAYBILLDETAILS.TRANSPORTERNAME || '',
                    TransporatId: obj.EWAYBILLDETAILS.TRANSPORTERID || '',
                    Mode: obj.EWAYBILLDETAILS.TRANSPORTMODE || '',
                    LadingNo: obj.EWAYBILLDETAILS.LRNO || '',
                    LadingDate: obj.EWAYBILLDETAILS.LRDATE ? formatDate(obj.EWAYBILLDETAILS.LRDATE) : '',
                    Vehicle_number: obj.EWAYBILLDETAILS.VEHICLENO || '',
                    Vehicle_type: obj.EWAYBILLDETAILS.VEHICLETYPE || ''
                } : {}),
                ...(obj.IRNDETAILS ? {
                    Acknowledge_No: obj.IRNDETAILS.ACKNO || '',
                    Ack_Date: obj.IRNDETAILS.ACKDATE ? formatDate(obj.IRNDETAILS.ACKDATE) : '',
                    IRN: obj.IRNDETAILS.IRN || '',
                    BilltoPlace: obj.IRNDETAILS.BILLTOPLACE || '',
                    'Ship to Place': obj.IRNDETAILS.SHIPTOPLACE || ''
                } : {}),
                bill_details: billDetails,
                Ledger_Entries: ledgerEntries,
                Inventory_Entries: hasInventory,
                Order_NUmber: obj.REFERENCE || '',
                Delivery_note_no: obj.DELIVERYNOTENO || '',
                Inventory_Details: inventoryDetails
            };
        });

        const result = { invoice: invoices };

        const fileName = './dump/invoice/all_invoices_with_pdf.json';
        fs.writeFileSync(fileName, JSON.stringify(result, null, 2), 'utf8');
        console.log(`Formatted invoices with correct bill_details and PDF saved to ${fileName}`);
        console.log(`Total invoices: ${invoices.length}`);

        return result;
    } catch (error: any) {
        console.error('Error:', error?.message || error);
        throw error;
    }
}