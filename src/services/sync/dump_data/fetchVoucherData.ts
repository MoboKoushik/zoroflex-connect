import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { parseStringPromise } from 'xml2js';

/**
 * Recursively parses an XML node from Tally export into a structured JSON object.
 * Handles attributes (uppercased), simple text elements, and .LIST collections as arrays of objects.
 * @param xmlNode - The XML node from xml2js parsing.
 * @returns Parsed JSON object.
 */
function parseXmlToJson(xmlNode: any): any {
    if (typeof xmlNode === 'string' || typeof xmlNode === 'number' || xmlNode === null || xmlNode === undefined) {
        return xmlNode;
    }
    if (Array.isArray(xmlNode)) {
        return xmlNode.map(parseXmlToJson);
    }
    if (typeof xmlNode !== 'object') {
        return xmlNode;
    }

    const obj: Record<string, any> = {};
    // Handle attributes, uppercasing keys
    if ('$' in xmlNode && xmlNode.$ !== undefined) {
        Object.entries(xmlNode.$).forEach(([key, value]) => {
            obj[key.toUpperCase()] = value;
        });
    }

    // Handle child elements
    Object.entries(xmlNode).forEach(([key, value]) => {
        if (key === '$') return;

        const parsedKey = key.toUpperCase();
        if (key.endsWith('.LIST')) {
            // Handle collection lists (e.g., ALLLEDGERENTRIES.LIST, BILLALLOCATIONS.LIST)
            const baseKey = key.slice(0, -5).toUpperCase(); // Remove '.LIST'
            if (!obj[baseKey]) {
                obj[baseKey] = [];
            }
            const parsedValue = parseXmlToJson(value);
            if (Array.isArray(parsedValue)) {
                parsedValue.forEach(item => obj[baseKey].push(item));
            } else {
                obj[baseKey].push(parsedValue);
            }
        } else {
            // Simple element or nested non-list
            obj[parsedKey] = parseXmlToJson(value);
        }
    });

    return obj;
}

/**
 * Fetches vouchers from Tally using the provided XML request.
 * Parses the response into structured JSON.
 * @param fromDate - Start date in YYYY-MM-DD format.
 * @param toDate - End date in YYYY-MM-DD format.
 * @param fromAlterId - Starting AlterID for incremental fetch.
 * @param sizeMax - Maximum number of records per fetch (default: 500).
 * @returns Array of parsed voucher objects.
 */
async function fetchFromTally(fromDate: string, toDate: string, fromAlterId: number, sizeMax: number = 500): Promise<Record<string, any>[]> {
    const xmlRequest = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>AR_VOUCHERS</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVFROMDATE>${fromDate}</SVFROMDATE>
        <SVTODATE>${toDate}</SVTODATE>
        <SVFROMALTERID>${fromAlterId}</SVFROMALTERID>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="AR_VOUCHERS"
                      ISINITIALIZE="Yes"
                      SIZEMAX="${sizeMax}">
            <TYPE>Voucher</TYPE>
            <FILTERS>
              AR_IncrementalFilter,
              AR_VoucherTypeFilter,
              AR_PartyFilter
            </FILTERS>
            <NATIVEMETHOD>MasterID</NATIVEMETHOD>
            <NATIVEMETHOD>AlterID</NATIVEMETHOD>
            <NATIVEMETHOD>Date</NATIVEMETHOD>
            <NATIVEMETHOD>VoucherNumber</NATIVEMETHOD>
            <NATIVEMETHOD>VoucherTypeName</NATIVEMETHOD>
            <NATIVEMETHOD>PartyLedgerName</NATIVEMETHOD>
            <NATIVEMETHOD>Narration</NATIVEMETHOD>
            <NATIVEMETHOD>Amount</NATIVEMETHOD>
            <NATIVEMETHOD>AllLedgerEntries.List</NATIVEMETHOD>
            <NATIVEMETHOD>AllLedgerEntries.LedgerName</NATIVEMETHOD>
            <NATIVEMETHOD>AllLedgerEntries.Amount</NATIVEMETHOD>
            <NATIVEMETHOD>AllLedgerEntries.IsDeemedPositive</NATIVEMETHOD>
            <NATIVEMETHOD>AllLedgerEntries.BillAllocations.List</NATIVEMETHOD>
            <NATIVEMETHOD>AllLedgerEntries.BillAllocations.Name</NATIVEMETHOD>
            <NATIVEMETHOD>AllLedgerEntries.BillAllocations.Amount</NATIVEMETHOD>
            <NATIVEMETHOD>AllLedgerEntries.BillAllocations.BillType</NATIVEMETHOD>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="AR_IncrementalFilter">
            $$Number:$AlterID &gt; $$Number:##SVFROMALTERID
          </SYSTEM>
          <SYSTEM TYPE="Formulae" NAME="AR_VoucherTypeFilter">
            $$IsSales:$VoucherTypeName
            OR $$IsReceipt:$VoucherTypeName
            OR $$IsCreditNote:$VoucherTypeName
          </SYSTEM>
          <SYSTEM TYPE="Formulae" NAME="AR_PartyFilter">
            $$IsLedOfGrp:$PartyLedgerName:$$GroupSundryDebtors
          </SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`.trim();

    try {
        const response = await axios.post('http://localhost:9000', xmlRequest, {
            headers: { 'Content-Type': 'text/xml' }
        });
        const parsed: any = await parseStringPromise(response.data);

        // Extract collection from response structure
        const collection = parsed.ENVELOPE?.BODY?.[0]?.DATA?.[0]?.COLLECTION?.[0];
        if (!collection) {
            return [];
        }

        const vouchersXml = Array.isArray(collection.VOUCHER) ? collection.VOUCHER : collection.VOUCHER ? [collection.VOUCHER] : [];
        const vouchersJson: Record<string, any>[] = vouchersXml
            .map((voucher: any) => parseXmlToJson(voucher))
            .filter((voucher: Record<string, any>) => voucher && voucher.ALTERID); // Filter valid vouchers with AlterID

        return vouchersJson;
    } catch (error) {
        console.error('Error fetching vouchers:', (error as Error).message || error);
        throw error;
    }
}

/**
 * Fetches all AR vouchers incrementally by year and month slices.
 * Supports checkpointing for resuming interrupted fetches.
 * Collects all vouchers and saves to a consolidated JSON file.
 * @returns Array of all parsed voucher objects.
 */
export async function fetchAllVouchers(): Promise<Record<string, any>[]> {
    const startYear = 2024;
    const endYear = 2025;
    let allVouchers: Record<string, any>[] = [];

    // Ensure directories exist
    const checkpointDir = './checkpoints';
    const dumpDir = './dump/voucher';
    if (!fs.existsSync(checkpointDir)) {
        fs.mkdirSync(checkpointDir, { recursive: true });
    }
    if (!fs.existsSync(dumpDir)) {
        fs.mkdirSync(dumpDir, { recursive: true });
    }

    for (let year = startYear; year <= endYear; year++) {
        for (let month = 1; month <= 12; month++) {
            // Calculate date range for the month
            const fromDate = new Date(year, month - 1, 1);
            const toDate = new Date(year, month, 0);
            const fromDateStr = fromDate.toISOString().split('T')[0];
            const toDateStr = toDate.toISOString().split('T')[0];

            const checkpointFile = path.join(checkpointDir, `${year}_${month.toString().padStart(2, '0')}.json`);
            let fromAlterId = 0;
            let processedThisMonth = 0;

            // Load checkpoint if exists
            if (fs.existsSync(checkpointFile)) {
                try {
                    const checkpoint: { fromAlterId?: number; processed?: number } = JSON.parse(fs.readFileSync(checkpointFile, 'utf8'));
                    fromAlterId = checkpoint.fromAlterId || 0;
                    processedThisMonth = checkpoint.processed || 0;
                    console.log(`Resuming ${year}-${month.toString().padStart(2, '0')} from AlterID: ${fromAlterId}`);
                } catch (error) {
                    console.warn(`Invalid checkpoint for ${year}-${month}, starting from AlterID 0`);
                    fromAlterId = 0;
                    processedThisMonth = 0;
                }
            }

            // Incremental fetch loop for this month
            while (true) {
                const vouchers = await fetchFromTally(fromDateStr, toDateStr, fromAlterId, 500);
                const rawFile = './dump/voucher/all_vouchers_raw_01.json';
                fs.writeFileSync(rawFile, JSON.stringify(vouchers, null, 2), 'utf8');
                if (vouchers.length === 0) {
                    break;
                }

                // pushToAR equivalent: collect in allVouchers (extend as needed for DB insert, etc.)
                allVouchers.push(...vouchers);
                processedThisMonth += vouchers.length;

                // Calculate next fromAlterId
                const alterIds = vouchers.map(v => parseInt(v.ALTERID || '0')).filter(id => !isNaN(id));
                const maxAlterId = alterIds.length > 0 ? Math.max(...alterIds) : fromAlterId;
                fromAlterId = maxAlterId;

                // Save checkpoint
                fs.writeFileSync(checkpointFile, JSON.stringify({ fromAlterId, processed: processedThisMonth }, null, 2));

                console.log(`Fetched ${vouchers.length} vouchers for ${year}-${month.toString().padStart(2, '0')}; total this month: ${processedThisMonth}; next AlterID: ${fromAlterId}`);
            }

            console.log(`Completed ${year}-${month.toString().padStart(2, '0')}: ${processedThisMonth} vouchers`);
        }
    }

    // Save consolidated output
    const outputFile = path.join(dumpDir, 'all_vouchers.json');
    fs.writeFileSync(outputFile, JSON.stringify(allVouchers, null, 2), 'utf8');
    console.log(`All vouchers saved to ${outputFile} (total: ${allVouchers.length})`);

    return allVouchers;
}