// src/services/tally/batch-fetcher.ts

import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import fs from 'fs';
import http from 'http';
const TALLY_URL = 'http://localhost:9000';

/**
 * Retry configuration for Tally API calls
 */
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000; // 1 second
const MAX_RETRY_DELAY_MS = 10000; // 10 seconds

/**
 * Checks if an error is retryable (transient connection error)
 */
function isRetryableError(error: any): boolean {
    if (!error) return false;

    // Check error code from various locations
    const errorCode = error.code || error.cause?.code || error.errno;
    const errorMessage = error.message || error.cause?.message || '';

    const retryableCodes = [
        'ECONNRESET',
        'ETIMEDOUT',
        'ECONNREFUSED',
        'ENOTFOUND',
        'EAI_AGAIN',
        'EPIPE',
        'ESOCKETTIMEDOUT',
        'ECONNABORTED'
    ];

    // Check if it's a retryable error code
    if (errorCode && retryableCodes.includes(String(errorCode))) {
        return true;
    }

    // Check error message for retryable patterns
    const retryablePatterns = [
        'ECONNRESET',
        'timeout',
        'network',
        'connection reset',
        'socket hang up',
        'ECONNREFUSED'
    ];

    return retryablePatterns.some(pattern =>
        errorMessage.toLowerCase().includes(pattern.toLowerCase())
    );
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry wrapper with exponential backoff
 */
async function withRetry<T>(
    fn: () => Promise<T>,
    operationName: string,
    maxRetries: number = MAX_RETRIES
): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;

            // Don't retry on last attempt or if error is not retryable
            if (attempt === maxRetries || !isRetryableError(error)) {
                throw error;
            }

            // Calculate delay with exponential backoff
            const delay = Math.min(
                INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt),
                MAX_RETRY_DELAY_MS
            );

            const errorInfo = error.code || error.cause?.code || error.message || 'Unknown error';
            console.log(
                `${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}): ${errorInfo}. Retrying in ${delay}ms...`
            );

            await sleep(delay);
        }
    }

    throw lastError;
}

/**
 * Fetches customers (ledgers) from Tally in batches using AlterID windowing
 * @param fromAlterId Starting AlterID (exclusive, so we fetch > fromAlterId)
 * @param sizeMax Maximum number of records to return per request (default: 100)
 * @returns Parsed XML response with LEDGER array
 */
export async function fetchCustomersBatch(fromAlterId: string, sizeMax: number = 100): Promise<any> {
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
        <SVFromAlterID>${fromAlterId}</SVFromAlterID>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="ARCUSTOMERS" ISINITIALIZE="Yes" SIZEMAX="${sizeMax}">
            <TYPE>Ledger</TYPE>
            <BELONGSTO>Yes</BELONGSTO>
            <CHILDOF>$$GroupSundryDebtors</CHILDOF>
            <FILTERS>BatchFilter</FILTERS>
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
          <SYSTEM TYPE="Formulae" NAME="BatchFilter">
            $$Number:$AlterID > $$Number:##SVFromAlterID
          </SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>
`.trim();
    return withRetry(async () => {
        const response = await axios.post(TALLY_URL, xmlRequest, {
            headers: { 'Content-Type': 'text/xml' },
            timeout: 30000,
            httpAgent: new http.Agent({ keepAlive: true }),
            validateStatus: () => true // Don't throw on HTTP errors, we'll check response
        });

        const parsed = await parseStringPromise(response.data);

        // Check for Tally error response
        if (parsed.RESPONSE || parsed.ENVELOPE?.BODY?.[0]?.RESPONSE) {
            const errorMsg = parsed.RESPONSE || parsed.ENVELOPE?.BODY?.[0]?.RESPONSE?.[0];
            if (errorMsg && typeof errorMsg === 'string' && errorMsg.includes('Unknown Request')) {
                throw new Error(`Tally error: ${errorMsg}. Check XML request format.`);
            }
        }

        // No upper bound filtering - fetch all records with AlterID > fromAlterId
        // The sizeMax parameter limits the number of records returned

        return parsed;
    }, `fetchCustomersBatch(AlterID > ${fromAlterId})`).catch((error: any) => {
        if (error.message && error.message.includes('Tally error')) {
            throw error;
        }
        throw new Error(`Batch fetch customers failed: ${error.message}`);
    });
}

/**
 * Fetches vouchers from Tally in batches using AlterID windowing
 * Optimized query using FETCH for nested data to prevent Tally crashes
 * @param fromAlterId Starting AlterID (exclusive, so we fetch > fromAlterId)
 * @param sizeMax Maximum number of records to return per request (default: 10)
 * @returns Parsed XML response with VOUCHER array
 */
export async function fetchVouchersBatch(fromAlterId: string, sizeMax: number = 10): Promise<any> {
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
        <SVLastMaxAlterID>${fromAlterId}</SVLastMaxAlterID>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="ALLVOUCHERS" ISINITIALIZE="Yes" SIZEMAX="${sizeMax}">
            <TYPE>Voucher</TYPE>
            <FILTERS>IncrementalFilter</FILTERS>
            <NATIVEMETHOD>Date</NATIVEMETHOD>
            <NATIVEMETHOD>VoucherNumber</NATIVEMETHOD>
            <NATIVEMETHOD>VoucherTypeName</NATIVEMETHOD>
            <NATIVEMETHOD>PartyLedgerName</NATIVEMETHOD>
            <NATIVEMETHOD>MasterID</NATIVEMETHOD>
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

    return withRetry(async () => {
        const response = await axios.post(TALLY_URL, xmlRequest, {
            headers: { 'Content-Type': 'text/xml' },
            timeout: 120000, // 120 seconds (2 minutes)
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            httpAgent: new http.Agent({
                keepAlive: true,
                keepAliveMsecs: 1000,
                maxSockets: 1,
                maxFreeSockets: 1
            }),
            validateStatus: () => true // Don't throw on HTTP errors, we'll check response
        });

        const parsed = await parseStringPromise(response.data);

        // Check for Tally error response
        if (parsed.RESPONSE || parsed.ENVELOPE?.BODY?.[0]?.RESPONSE) {
            const errorMsg = parsed.RESPONSE || parsed.ENVELOPE?.BODY?.[0]?.RESPONSE?.[0];
            if (errorMsg && typeof errorMsg === 'string' && errorMsg.includes('Unknown Request')) {
                throw new Error(`Tally error: ${errorMsg}. Check XML request format.`);
            }
        }

        return parsed;
    }, `fetchVouchersBatch(AlterID > ${fromAlterId})`).catch((error: any) => {
        console.log('Error in fetchVouchersBatch after retries:', error);
        if (error.message && error.message.includes('Tally error')) {
            throw error;
        }
        throw new Error(`Batch fetch vouchers failed: ${error.message}`);
    });
}

/**
 * Extracts LEDGER array from parsed customers batch response
 */
export function extractLedgersFromBatch(parsed: any): any[] {
    return parsed.ENVELOPE?.BODY?.[0]?.DATA?.[0]?.COLLECTION?.[0]?.LEDGER || [];
}

/**
 * Extracts VOUCHER array from parsed vouchers batch response
 */
export function extractVouchersFromBatch(parsed: any): any[] {
    return parsed.ENVELOPE?.BODY?.[0]?.DATA?.[0]?.COLLECTION?.[0]?.VOUCHER || [];
}

/**
 * Fetches customers with date range filter (for first sync)
 * @param fromDate Date range start (YYYYMMDD format, e.g., "20200401")
 * @param toDate Date range end (YYYYMMDD format, e.g., "20200430")
 * @param fromAlterId Starting AlterID (exclusive)
 * @param sizeMax Maximum number of records to return per request
 * @returns Parsed XML response with LEDGER array
 */
export async function fetchCustomersBatchByDateRange(
    fromDate: string,
    toDate: string,
    fromAlterId: string,
    sizeMax: number = 100
): Promise<any> {
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
        <SVFROMDATE>${fromDate}</SVFROMDATE>
        <SVTODATE>${toDate}</SVTODATE>
        <SVFromAlterID>${fromAlterId}</SVFromAlterID>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="ARCUSTOMERS" ISINITIALIZE="Yes" SIZEMAX="${sizeMax}">
            <TYPE>Ledger</TYPE>
            <BELONGSTO>Yes</BELONGSTO>
            <CHILDOF>$$GroupSundryDebtors</CHILDOF>
            <FILTERS>DateAndAlterFilter</FILTERS>
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
          <SYSTEM TYPE="Formulae" NAME="DateAndAlterFilter">
            ($$Number:$AlterID > $$Number:##SVFromAlterID) AND
            ($AlteredDate >= ##SVFROMDATE) AND
            ($AlteredDate <= ##SVTODATE)
          </SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>
`.trim();

    return withRetry(async () => {
        const response = await axios.post(TALLY_URL, xmlRequest, {
            headers: { 'Content-Type': 'text/xml' },
            timeout: 30000,
            httpAgent: new http.Agent({ keepAlive: true }),
            validateStatus: () => true
        });

        const parsed = await parseStringPromise(response.data);

        // Check for Tally error response
        if (parsed.RESPONSE || parsed.ENVELOPE?.BODY?.[0]?.RESPONSE) {
            const errorMsg = parsed.RESPONSE || parsed.ENVELOPE?.BODY?.[0]?.RESPONSE?.[0];
            if (errorMsg && typeof errorMsg === 'string' && errorMsg.includes('Unknown Request')) {
                throw new Error(`Tally error: ${errorMsg}. Check XML request format.`);
            }
        }

        return parsed;
    }, `fetchCustomersBatchByDateRange(${fromDate} to ${toDate}, AlterID > ${fromAlterId})`).catch((error: any) => {
        if (error.message && error.message.includes('Tally error')) {
            throw error;
        }
        throw new Error(`Batch fetch customers by date range failed: ${error.message}`);
    });
}

/**
 * Fetches vouchers using ZeroFinnReceipt report with date range (for first sync only)
 * @param fromDate Date range start (YYYYMMDD format, e.g., "20230401")
 * @param toDate Date range end (YYYYMMDD format, e.g., "20260331")
 * @returns Parsed XML response with VOUCHERS containing INVOICE and RECEIPT arrays
 */
export async function fetchVouchersFromReportByDateRange(
    fromDate: string,
    toDate: string,
    cullection: string
): Promise<any> {
    const xmlRequest = `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>${cullection}</REPORTNAME>
        <STATICVARIABLES>
          <SVFROMDATE>${fromDate}</SVFROMDATE>
          <SVTODATE>${toDate}</SVTODATE>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA/>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`.trim();

    return withRetry(async () => {
        const response = await axios.post(TALLY_URL, xmlRequest, {
            headers: { 'Content-Type': 'text/plain' },
            timeout: 120000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            httpAgent: new http.Agent({
                keepAlive: true,
                keepAliveMsecs: 1000,
                maxSockets: 1,
                maxFreeSockets: 1
            }),
            validateStatus: () => true
        });

        const parsed = await parseStringPromise(response.data);

        // Check for Tally error response
        if (parsed.RESPONSE || parsed.ENVELOPE?.BODY?.[0]?.RESPONSE) {
            const errorMsg = parsed.RESPONSE || parsed.ENVELOPE?.BODY?.[0]?.RESPONSE?.[0];
            if (errorMsg && typeof errorMsg === 'string' && errorMsg.includes('Unknown Request')) {
                throw new Error(`Tally error: ${errorMsg}. Check if ZeroFinnReceipt report exists in Tally.`);
            }
        }

        return parsed;
    }, `fetchVouchersFromReportByDateRange(${fromDate} to ${toDate})`).catch((error: any) => {
        console.log('Error in fetchVouchersFromReportByDateRange after retries:', error);
        if (error.message && error.message.includes('Tally error')) {
            throw error;
        }
        throw new Error(`Fetch vouchers from ZeroFinnReceipt report (date range) failed: ${error.message}`);
    });
}

/**
 * Fetches vouchers using ZeroFinnReceipt report with ALTER_ID only (for incremental sync)
 * @param fromAlterId Starting ALTER_ID (exclusive)
 * @returns Parsed XML response with VOUCHERS containing INVOICE and RECEIPT arrays
 */
export async function fetchVouchersFromReportByAlterId(
fromAlterId: string,): Promise<any> {
    const xmlRequest = `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>ZeroFinnReceipt</REPORTNAME>
        <STATICVARIABLES>
          <SVZEROFINNALTERID>${fromAlterId}</SVZEROFINNALTERID>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA/>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`.trim();

    return withRetry(async () => {
        const response = await axios.post(TALLY_URL, xmlRequest, {
            headers: { 'Content-Type': 'text/plain' },
            timeout: 120000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            httpAgent: new http.Agent({
                keepAlive: true,
                keepAliveMsecs: 1000,
                maxSockets: 1,
                maxFreeSockets: 1
            }),
            validateStatus: () => true
        });

        const parsed = await parseStringPromise(response.data);

        // Check for Tally error response
        if (parsed.RESPONSE || parsed.ENVELOPE?.BODY?.[0]?.RESPONSE) {
            const errorMsg = parsed.RESPONSE || parsed.ENVELOPE?.BODY?.[0]?.RESPONSE?.[0];
            if (errorMsg && typeof errorMsg === 'string' && errorMsg.includes('Unknown Request')) {
                throw new Error(`Tally error: ${errorMsg}. Check if ZeroFinnReceipt report exists in Tally.`);
            }
        }

        return parsed;
    }, `fetchVouchersFromReportByAlterId(AlterID > ${fromAlterId})`).catch((error: any) => {
        console.log('Error in fetchVouchersFromReportByAlterId after retries:', error);
        if (error.message && error.message.includes('Tally error')) {
            throw error;
        }
        throw new Error(`Fetch vouchers from ZeroFinnReceipt report (ALTER_ID) failed: ${error.message}`);
    });
}

/**
 * Extracts INVOICE array from ZeroFinnReceipt report response
 */
export function extractInvoicesFromReport(parsed: any): any[] {
    return parsed.VOUCHERS?.INVOICE || [];
}

/**
 * Extracts RECEIPT array from ZeroFinnReceipt report response
 */
export function extractReceiptsFromReport(parsed: any): any[] {
    return parsed.VOUCHERS?.RECEIPT || [];
}

/**
 * Helper to extract text from ZeroFinnReceipt report XML elements
 * Report format uses simple text nodes, not the complex TDL format
 */
export function getReportText(obj: any, key: string): string {
    if (!obj || !obj[key]) return '';
    const value = obj[key];
    if (Array.isArray(value) && value.length > 0) {
        return String(value[0] || '').trim();
    }
    return String(value || '').trim();
}
