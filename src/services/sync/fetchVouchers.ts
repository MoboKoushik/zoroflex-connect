// fetchVouchers.ts

import http from 'http';
import fs from 'fs';

/**
 * Fetches vouchers using the built-in 'Voucher Register' report from Tally 
 * for a fixed (static) date range (Financial Year 2025-26).
 * Uses default server (localhost) and default port (9000).
 * Returns them as an array of JSON objects.
 * 
 * @returns Promise<Array<Record<string, string>>> - Array of voucher objects
 * @throws Error if communication with Tally fails or parsing error occurs
 */
export async function fetchAllVouchers(): Promise<Array<Record<string, string>>> {
    const tallyServer = 'localhost';
    const tallyPort = 9000;

    // Static date range (FY 2025-26: adjust as needed)
    const fromDate = '20250401';  // 1st April 2025
    const toDate   = '20260331';  // 31st March 2026

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
      <REQUESTDATA />
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

    const xmlResponse = await postToTally(tallyServer, tallyPort, reqPayload);

    const xml2js = require('xml2js');
    const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });

    return new Promise((resolve, reject) => {
        parser.parseString(xmlResponse, (err: any, result: any) => {
            if (err) {
                reject(new Error(`XML parsing failed: ${err.message}`));
                return;
            }

            const jsonFilePath = 'vouchers.json';
            fs.writeFileSync(jsonFilePath, JSON.stringify(result, null, 2), 'utf8');

            // Debug: Log the full parsed structure to verify
            // console.log('Parsed Voucher XML structure:', JSON.stringify(result?.ENVELOPE?.BODY?.IMPORTDATA?.REQUESTDATA?.TALLYMESSAGE[4].VOUCHER, null, 2));
            // console.log('Parsed Voucher XML structure:', JSON.stringify(Object.keys(result?.ENVELOPE?.BODY?.IMPORTDATA?.REQUESTDATA?.TALLYMESSAGE[1].VOUCHER), null, 2));

            // Vouchers are typically under ENVELOPE > BODY > DATA > VOUCHER or similar nesting
            const vouchersRaw = result?.ENVELOPE?.BODY?.IMPORTDATA?.REQUESTDATA?.TALLYMESSAGE;
            let vouchers: Array<Record<string, string>> = [];

            if (Array.isArray(vouchersRaw)) {
                vouchers = vouchersRaw.map((voucher: any) => flattenVoucherObject(voucher));
            } else if (vouchersRaw) {
                vouchers = [flattenVoucherObject(vouchersRaw)];
            }

            resolve(vouchers);
        });
    });
}

// Helper: Send POST request to Tally (unchanged)
function postToTally(server: string, port: number, payload: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                hostname: server,
                port: port,
                path: '/',
                method: 'POST',
                headers: {
                    'Content-Length': Buffer.byteLength(payload, 'utf16le'),
                    'Content-Type': 'text/xml;charset=utf-16'
                }
            },
            (res) => {
                let data = '';
                res.setEncoding('utf16le');
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => resolve(data));
                res.on('error', reject);
            }
        );

        req.on('error', reject);
        req.write(payload, 'utf16le');
        req.end();
    });
}

// Helper: Flatten nested voucher object (handles arrays like ALLLEDGERENTRIES.LIST)
function flattenVoucherObject(voucher: any): Record<string, string> {
    const flat: Record<string, string> = {};

    function traverse(obj: any, prefix: string = '') {
        if (obj === null || obj === undefined) return;

        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const value = obj[key];
                const newKey = prefix ? `${prefix}.${key}` : key;

                if (Array.isArray(value)) {
                    value.forEach((item, index) => {
                        if (typeof item === 'object') {
                            traverse(item, `${newKey}[${index}]`);
                        } else {
                            flat[`${newKey}[${index}]`] = (item ?? '').toString();
                        }
                    });
                } else if (value && typeof value === 'object') {
                    traverse(value, newKey);
                } else {
                    flat[newKey] = (value ?? '').toString();
                }
            }
        }
    }

    traverse(voucher);
    return flat;
}