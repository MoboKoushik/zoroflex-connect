// fetchReceiptsFinal.ts

import http from 'http';
import fs from 'fs';

/**
 * Fetches Receipt vouchers from Tally Prime and transforms to the exact desired format.
 * Works with the standard Voucher Register XML response structure.
 */
export async function fetchReceipts(): Promise<{ receipt: Array<Record<string, any>> }> {
    const tallyServer = 'localhost';
    const tallyPort = 9000;

    // Use a date range with known Receipt vouchers for testing
    const fromDate = '20240101';  // Adjust to include actual data period
    const toDate   = '20260331';

    const reqPayload = `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Voucher Register</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <SVFROMDATE Type="Date">${fromDate}</SVFROMDATE>
          <SVTODATE Type="Date">${toDate}</SVTODATE>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

    const xmlResponse = await postToTally(tallyServer, tallyPort, reqPayload);

    // Debug: Save raw response
    fs.writeFileSync('raw_receipt_response.xml', xmlResponse, 'utf8');

    const xml2js = require('xml2js');
    const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true, trim: true });

    return new Promise((resolve, reject) => {
        parser.parseString(xmlResponse, (err: any, result: any) => {
            if (err) {
                reject(new Error(`XML parsing failed: ${err.message}`));
                return;
            }

            // Save parsed structure for debugging
            fs.writeFileSync('parsed_receipt.json', JSON.stringify(result, null, 2), 'utf8');

            console.log('Parsed XML structure:', JSON.stringify(Object.keys(result?.ENVELOPE?.BODY?.IMPORTDATA?.REQUESTDATA?.TALLYMESSAGE), null, 2));

            // Extract vouchers from common path: ENVELOPE.TALLYMESSAGE[].VOUCHER
            let vouchers: any[] = [];
            if (result?.ENVELOPE?.BODY?.IMPORTDATA?.REQUESTDATA?.TALLYMESSAGE) {
                const messages = Array.isArray(result?.ENVELOPE?.BODY?.IMPORTDATA?.REQUESTDATA?.TALLYMESSAGE) ? result?.ENVELOPE?.BODY?.IMPORTDATA?.REQUESTDATA?.TALLYMESSAGE : [];
                console.log('messages==>', messages.length)
                messages.forEach((msg: any) => {
                    if (msg.VOUCHER) {
                        const vchs = Array.isArray(msg.VOUCHER) ? msg.VOUCHER : [msg.VOUCHER];
                        vouchers.push(...vchs);
                    }
                });
            }

            if (vouchers.length === 0) {
                console.log('No vouchers found. Check date range and raw_receipt_response.xml');
                resolve({ receipt: [] });
                return;
            }

            console.log(`Found ${vouchers.length} vouchers in response.`);
            fs.writeFileSync('parsed_receipt.json', JSON.stringify(vouchers, null, 2), 'utf8');

            const receipts: any[] = [];

            for (const voucher of vouchers) {
                const voucherType = (voucher.VOUCHERTYPENAME || '').toLowerCase();
                if (voucherType !== 'receipt') continue;

                // Ledger entries
                const entries = voucher.ALLLEDGERENTRIES?.LIST || voucher.LEDGERENTRIES?.LIST || [];
                const entryArray = Array.isArray(entries) ? entries : [entries];

                let partyEntry: any = null;
                let bankEntry: any = null;

                entryArray.forEach((entry: any) => {
                    if (entry.ISPARTYLEDGER === 'Yes' || entry.BILLALLOCATIONS?.LIST) {
                        partyEntry = entry;
                    } else {
                        bankEntry = entry;
                    }
                });

                if (!partyEntry) continue;

                // Bill allocations
                let allocs = partyEntry.BILLALLOCATIONS?.LIST || [];
                if (!Array.isArray(allocs)) allocs = allocs ? [allocs] : [];

                const billDetails = allocs.map((alloc: any) => ({
                    bill_id: alloc.BILLTYPE === 'New Ref' || alloc.BILLTYPE === 'On Account' || alloc.BILLTYPE === 'Advance' 
                        ? 'Unallocated' 
                        : (alloc.NAME || 'Unknown'),
                    bill_amount: Math.abs(parseFloat(alloc.AMOUNT || '0')).toFixed(2)
                }));

                if (billDetails.length === 0) {
                    billDetails.push({
                        bill_id: 'Unallocated',
                        bill_amount: Math.abs(parseFloat(voucher.AMOUNT || '0')).toFixed(2)
                    });
                }

                // Transaction type
                const bankName = (bankEntry?.LEDGERNAME || '').toLowerCase();
                const transactionType = /cheque|dd|check|bank/i.test(bankName) ? 'Cheque/DD' : 'Cash/Bank';

                // Date formatting
                const rawDate = voucher.DATE || '20240101';
                const formattedDate = rawDate.replace(/^(\d{4})(\d{2})(\d{2})$/, '$3-$2-$1');

                const receiptObj = {
                    receipt_id: voucher.GUID || voucher.ALTERID || voucher.VOUCHERNUMBER || '',
                    receipt_number: voucher.VOUCHERNUMBER || '',
                    receipt_date: formattedDate,
                    customer_name: partyEntry.LEDGERNAME || 'Unknown',
                    customer_id: '32375',  // Placeholder - replace with actual logic if ledger GUID needed
                    receipt_amount: Math.abs(parseFloat(voucher.AMOUNT || '0')).toFixed(2),
                    biller_id: '2ca2cc07-0768-4ac1-981d-84c212355a67',  // Placeholder
                    transaction_type: transactionType,
                    bill_details: billDetails
                };

                receipts.push(receiptObj);
            }

            const output = { receipt: receipts };
            fs.writeFileSync('receipts_final.json', JSON.stringify(output, null, 2), 'utf8');
            console.log(`Successfully transformed ${receipts.length} Receipt vouchers.`);

            resolve(output);
        });
    });
}

// postToTally helper (UTF-16LE required by Tally)
function postToTally(server: string, port: number, payload: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: server,
            port: port,
            path: '/',
            method: 'POST',
            headers: {
                'Content-Length': Buffer.byteLength(payload, 'utf16le'),
                'Content-Type': 'text/xml;charset=utf-16'
            }
        }, (res) => {
            let data = '';
            res.setEncoding('utf16le');
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });

        req.on('error', reject);
        req.write(payload, 'utf16le');
        req.end();
    });
}