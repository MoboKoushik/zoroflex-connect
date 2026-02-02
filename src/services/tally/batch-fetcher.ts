// src/services/tally/batch-fetcher.ts

import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import http from 'http';
import { getDefaultTallyUrl } from '../config/tally-url-helper';

// Dynamic Tally URL - can be set via setTallyUrl()
let TALLY_URL = getDefaultTallyUrl();

/**
 * Set the Tally URL dynamically (call this before sync operations)
 */
export function setTallyUrl(url: string): void {
  TALLY_URL = url;
}

/**
 * Get current Tally URL
 */
export function getCurrentTallyUrl(): string {
  return TALLY_URL;
}

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
 * Fetches vouchers using ZorrofinReceipt report with date range (for first sync only)
 * @param fromDate Date range start (YYYYMMDD format, e.g., "20230401")
 * @param toDate Date range end (YYYYMMDD format, e.g., "20260331")
 * @returns Parsed XML response with VOUCHERS containing INVOICE and RECEIPT arrays
 */
export async function fetchVouchersFromReportByDateRange(
  fromDate: string,
  toDate: string,
  collection: string
): Promise<any> {
  const xmlRequest = `
  <ENVELOPE>
    <HEADER>
        <TALLYREQUEST>Export Data</TALLYREQUEST>
    </HEADER>
    <BODY>
        <EXPORTDATA>
            <REQUESTDESC>
                <REPORTNAME>${collection}</REPORTNAME>
                <STATICVARIABLES>
                    <SVFROMDATE>${fromDate}</SVFROMDATE>
                    <SVTODATE>${toDate}</SVTODATE>
                </STATICVARIABLES>
            </REQUESTDESC>
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
        throw new Error(`Tally error: ${errorMsg}. Check if ZorrofinReceipt report exists in Tally.`);
      }
    }

    return parsed;
  }, `fetchVouchersFromReportByDateRange(${fromDate} to ${toDate})`).catch((error: any) => {
    console.log('Error in fetchVouchersFromReportByDateRange after retries:', error);
    if (error.message && error.message.includes('Tally error')) {
      throw error;
    }
    throw new Error(`Fetch vouchers from ZorrofinReceipt report (date range) failed: ${error.message}`);
  });
}

/**
 * Fetches vouchers using ZorrofinReceipt report with ALTER_ID only (for incremental sync)
 * @param fromAlterId Starting ALTER_ID (exclusive)
 * @param collection Starting 
 * @returns Parsed XML response with VOUCHERS containing INVOICE and RECEIPT arrays
 */
export async function fetchVouchersFromReportByAlterId(
  fromAlterId: string, collection: string): Promise<any> {
  const xmlRequest = `
  <ENVELOPE>
    <HEADER>
        <TALLYREQUEST>Export Data</TALLYREQUEST>
    </HEADER>
    <BODY>
        <EXPORTDATA>
            <REQUESTDESC>
                <REPORTNAME>${collection}</REPORTNAME>
                <STATICVARIABLES>
                    <SVZORROFINALTERID>${fromAlterId}</SVZORROFINALTERID>
                </STATICVARIABLES>
            </REQUESTDESC>
        </EXPORTDATA>
    </BODY>
</ENVELOPE>`.trim();

  return withRetry(async () => {
    const response = await axios.post(TALLY_URL, xmlRequest, {
      headers: { 'Content-Type': 'text/plain' },
      timeout: 360000,
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
        throw new Error(`Tally error: ${errorMsg}. Check if ZorrofinReceipt report exists in Tally.`);
      }
    }

    return parsed;
  }, `fetchVouchersFromReportByAlterId(AlterID > ${fromAlterId})`).catch((error: any) => {
    console.log('Error in fetchVouchersFromReportByAlterId after retries:', error);
    if (error.message && error.message.includes('Tally error')) {
      throw error;
    }
    throw new Error(`Fetch vouchers from ZorrofinReceipt report (ALTER_ID) failed: ${error.message}`);
  });
}

/**
 * Extracts INVOICE array from ZorrofinReceipt report response
 */
export function extractInvoicesFromReport(parsed: any): any[] {
  return parsed.VOUCHERS?.INVOICE || [];
}

/**
 * Extracts RECEIPT array from ZorrofinReceipt report response
 */
export function extractReceiptsFromReport(parsed: any): any[] {
  return parsed.VOUCHERS?.RECEIPT || [];
}

/**
 * Fetches customers using ZorrofinCust report with date range (for first sync only)
 * @param fromDate Date range start (YYYYMMDD format, e.g., "20230401")
 * @param toDate Date range end (YYYYMMDD format, e.g., "20260330")
 * @returns Parsed XML response with CUSTOMER array
 */
export async function fetchCustomersFromReportByDateRange(
  fromDate: string,
  toDate: string
): Promise<any> {
  const xmlRequest = `
  <ENVELOPE>
    <HEADER>
        <TALLYREQUEST>Export Data</TALLYREQUEST>
    </HEADER>
    <BODY>
        <EXPORTDATA>
            <REQUESTDESC>
                <REPORTNAME>ZorrofinCust</REPORTNAME>
                <STATICVARIABLES>
                <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
                    <SVFROMDATE>${fromDate}</SVFROMDATE>
                    <SVTODATE>${toDate}</SVTODATE>
                </STATICVARIABLES>
            </REQUESTDESC>
        </EXPORTDATA>
    </BODY>
</ENVELOPE>`.trim();

  return withRetry(async () => {
    const response = await axios.post(TALLY_URL, xmlRequest, {
      headers: { 'Content-Type': 'application/xml' },
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
        throw new Error(`Tally error: ${errorMsg}. Check if ZorrofinCust report exists in Tally.`);
      }
    }

    return parsed;
  }, `fetchCustomersFromReportByDateRange(${fromDate} to ${toDate})`).catch((error: any) => {
    console.log('Error in fetchCustomersFromReportByDateRange after retries:', error);
    if (error.message && error.message.includes('Tally error')) {
      throw error;
    }
    throw new Error(`Fetch customers from ZorrofinCust report (date range) failed: ${error.message}`);
  });
}

/**
 * Fetches customers using ZorrofinCust report with ALTER_ID only (for incremental sync)
 * @param fromAlterId Starting ALTER_ID (exclusive)
 * @returns Parsed XML response with CUSTOMER array
 */
export async function fetchCustomersFromReportByAlterId(
  fromAlterId: string,
  fromDate: string,
  toDate: string
): Promise<any> {
  const xmlRequest = `
  <ENVELOPE>
    <HEADER>
        <TALLYREQUEST>Export Data</TALLYREQUEST>
    </HEADER>
    <BODY>
        <EXPORTDATA>
            <REQUESTDESC>
                <REPORTNAME>ZorrofinCust</REPORTNAME>
                <STATICVARIABLES>
                    <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
                    <SVFROMDATE>${fromDate}</SVFROMDATE>
                    <SVTODATE>${toDate}</SVTODATE>
                    <SVZORROFINALTERID>${fromAlterId}</SVZORROFINALTERID>
                </STATICVARIABLES>
            </REQUESTDESC>
        </EXPORTDATA>
    </BODY>
</ENVELOPE>`.trim();

  return withRetry(async () => {
    const response = await axios.post(TALLY_URL, xmlRequest, {
      headers: { 'Content-Type': 'application/xml' },
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
        throw new Error(`Tally error: ${errorMsg}. Check if ZorrofinCust report exists in Tally.`);
      }
    }

    return parsed;
  }, `fetchCustomersFromReportByAlterId(AlterID > ${fromAlterId})`).catch((error: any) => {
    console.log('Error in fetchCustomersFromReportByAlterId after retries:', error);
    if (error.message && error.message.includes('Tally error')) {
      throw error;
    }
    throw new Error(`Fetch customers from ZorrofinCust report (ALTER_ID) failed: ${error.message}`);
  });
}

/**
 * Extracts CUSTOMER array from ZorrofinCust report response
 */
export function extractCustomersFromReport(parsed: any): any[] {
  // Response structure: ENVELOPE.CUSTOMER (array) or ENVELOPE.BODY[0].CUSTOMER
  if (parsed.ENVELOPE?.CUSTOMER) {
    return Array.isArray(parsed.ENVELOPE.CUSTOMER) ? parsed.ENVELOPE.CUSTOMER : [parsed.ENVELOPE.CUSTOMER];
  }
  if (parsed.ENVELOPE?.BODY?.[0]?.CUSTOMER) {
    const customers = parsed.ENVELOPE.BODY[0].CUSTOMER;
    return Array.isArray(customers) ? customers : [customers];
  }
  if (parsed.CUSTOMER) {
    return Array.isArray(parsed.CUSTOMER) ? parsed.CUSTOMER : [parsed.CUSTOMER];
  }
  return [];
}

/**
 * Fetches organization using ZorrofinCmp report
 * @returns Parsed XML response with BILLER array
 */
export async function fetchOrganizationFromReport(): Promise<any> {
  const xmlRequest = `
<ENVELOPE>
    <HEADER>
        <TALLYREQUEST>Export Data</TALLYREQUEST>
    </HEADER>
    <BODY>
        <EXPORTDATA>
            <REQUESTDESC>
                <REPORTNAME>ZorrofinCmp</REPORTNAME>
            </REQUESTDESC>
        </EXPORTDATA>
    </BODY>
</ENVELOPE>`.trim();

  return withRetry(async () => {
    const response = await axios.post(TALLY_URL, xmlRequest, {
      headers: { 'Content-Type': 'application/xml' },
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

    const parsed = await parseStringPromise(response.data, {
      explicitArray: true,
      mergeAttrs: false,
      explicitRoot: false
    });

    // Check for Tally error response
    if (parsed.RESPONSE || parsed.ENVELOPE?.BODY?.[0]?.RESPONSE) {
      const errorMsg = parsed.RESPONSE || parsed.ENVELOPE?.BODY?.[0]?.RESPONSE?.[0];
      if (errorMsg && typeof errorMsg === 'string' && errorMsg.includes('Unknown Request')) {
        throw new Error(`Tally error: ${errorMsg}. Check if ZorrofinCmp report exists in Tally.`);
      }
    }

    return parsed;
  }, `fetchOrganizationFromReport()`).catch((error: any) => {
    console.log('Error in fetchOrganizationFromReport after retries:', error);
    if (error.message && error.message.includes('Tally error')) {
      throw error;
    }
    throw new Error(`Fetch organization from ZorrofinCmp report failed: ${error.message}`);
  });
}

/**
 * Extracts BILLER array from ZorrofinCmp report response
 */
export function extractBillersFromReport(parsed: any): any[] {
  // Response structure: ENVELOPE.BILLER (array) or ENVELOPE.BODY[0].BILLER
  if (parsed?.ENVELOPE?.BILLER) {
    const billers = Array.isArray(parsed.ENVELOPE.BILLER)
      ? parsed.ENVELOPE.BILLER
      : [parsed.ENVELOPE.BILLER];
    return billers;
  }

  if (parsed?.ENVELOPE?.BODY?.[0]?.BILLER) {
    const billers = parsed.ENVELOPE.BODY[0].BILLER;
    const billerArray = Array.isArray(billers) ? billers : [billers];
    return billerArray;
  }

  if (parsed?.BILLER) {
    const billers = Array.isArray(parsed.BILLER) ? parsed.BILLER : [parsed.BILLER];
    return billers;
  }

  return [];
}

/**
 * Helper to extract text from ZorrofinReceipt report XML elements
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

/**
 * Helper to extract array from XML elements (e.g., LEDGER_ENTRIES, INVENTORY, BILL_DETAILS)
 * Returns the array of child elements for the given key
 */
export function getReportArray(obj: any, key: string): any[] {
  if (!obj || !obj[key]) return [];
  const value = obj[key];
  if (Array.isArray(value)) {
    return value;
  }
  // If it's a single object, wrap it in an array
  return [value];
}

/**
 * Fetches Journal Vouchers using ZorrofinJV report with date range (for first sync only)
 * @param fromDate Date range start (YYYYMMDD format, e.g., "20230401")
 * @param toDate Date range end (YYYYMMDD format, e.g., "20260330")
 * @returns Parsed XML response with JV_ENTRY array
 */
export async function fetchJournalVouchersFromReportByDateRange(
  fromDate: string,
  toDate: string
): Promise<any> {
  const xmlRequest = `
<ENVELOPE>
    <HEADER>
        <TALLYREQUEST>Export Data</TALLYREQUEST>
    </HEADER>
    <BODY>
        <EXPORTDATA>
            <REQUESTDESC>
                <REPORTNAME>ZorrofinJV</REPORTNAME>
                <STATICVARIABLES>
                    <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
                    <SVFROMDATE>${fromDate}</SVFROMDATE>
                    <SVTODATE>${toDate}</SVTODATE>
                </STATICVARIABLES>
            </REQUESTDESC>
        </EXPORTDATA>
    </BODY>
</ENVELOPE>`.trim();

  return withRetry(async () => {
    const response = await axios.post(TALLY_URL, xmlRequest, {
      headers: { 'Content-Type': 'application/xml' },
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

    const parsed = await parseStringPromise(response.data, {
      explicitArray: true,
      mergeAttrs: false,
      explicitRoot: false
    });

    // Check for Tally error response
    if (parsed.RESPONSE || parsed.ENVELOPE?.BODY?.[0]?.RESPONSE) {
      const errorMsg = parsed.RESPONSE || parsed.ENVELOPE?.BODY?.[0]?.RESPONSE?.[0];
      if (errorMsg && typeof errorMsg === 'string' && errorMsg.includes('Unknown Request')) {
        throw new Error(`Tally error: ${errorMsg}. Check if ZorrofinJV report exists in Tally.`);
      }
    }

    return parsed;
  }, `fetchJournalVouchersFromReportByDateRange(${fromDate} to ${toDate})`).catch((error: any) => {
    console.log('Error in fetchJournalVouchersFromReportByDateRange after retries:', error);
    if (error.message && error.message.includes('Tally error')) {
      throw error;
    }
    throw new Error(`Fetch Journal Vouchers from ZorrofinJV report (date range) failed: ${error.message}`);
  });
}

/**
 * Fetches Journal Vouchers using ZorrofinJV report with ALTER_ID only (for incremental sync)
 * @param fromAlterId Starting ALTER_ID (exclusive)
 * @returns Parsed XML response with JV_ENTRY array
 */
export async function fetchJournalVouchersFromReportByAlterId(
  fromAlterId: string
): Promise<any> {
  const xmlRequest = `
<ENVELOPE>
    <HEADER>
        <TALLYREQUEST>Export Data</TALLYREQUEST>
    </HEADER>
    <BODY>
        <EXPORTDATA>
            <REQUESTDESC>
                <REPORTNAME>ZorrofinJV</REPORTNAME>
                <STATICVARIABLES>
                    <SVZORROFINALTERID>${fromAlterId}</SVZORROFINALTERID>
                </STATICVARIABLES>
            </REQUESTDESC>
        </EXPORTDATA>
    </BODY>
</ENVELOPE>`.trim();

  return withRetry(async () => {
    const response = await axios.post(TALLY_URL, xmlRequest, {
      headers: { 'Content-Type': 'application/xml' },
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

    const parsed = await parseStringPromise(response.data, {
      explicitArray: true,
      mergeAttrs: false,
      explicitRoot: false
    });

    // Check for Tally error response
    if (parsed.RESPONSE || parsed.ENVELOPE?.BODY?.[0]?.RESPONSE) {
      const errorMsg = parsed.RESPONSE || parsed.ENVELOPE?.BODY?.[0]?.RESPONSE?.[0];
      if (errorMsg && typeof errorMsg === 'string' && errorMsg.includes('Unknown Request')) {
        throw new Error(`Tally error: ${errorMsg}. Check if ZorrofinJV report exists in Tally.`);
      }
    }

    return parsed;
  }, `fetchJournalVouchersFromReportByAlterId(AlterID > ${fromAlterId})`).catch((error: any) => {
    console.log('Error in fetchJournalVouchersFromReportByAlterId after retries:', error);
    if (error.message && error.message.includes('Tally error')) {
      throw error;
    }
    throw new Error(`Fetch Journal Vouchers from ZorrofinJV report (ALTER_ID) failed: ${error.message}`);
  });
}

/**
 * Extracts JV_ENTRY array from ZorrofinJV report response
 */
export function extractJournalVouchersFromReport(parsed: any): any[] {
  // Response structure: ENVELOPE.JV_ENTRY (array) or direct JV_ENTRY
  if (parsed.ENVELOPE?.JV_ENTRY) {
    return Array.isArray(parsed.ENVELOPE.JV_ENTRY)
      ? parsed.ENVELOPE.JV_ENTRY
      : [parsed.ENVELOPE.JV_ENTRY];
  }
  if (parsed.ENVELOPE?.BODY?.[0]?.JV_ENTRY) {
    const jvEntries = parsed.ENVELOPE.BODY[0].JV_ENTRY;
    return Array.isArray(jvEntries) ? jvEntries : [jvEntries];
  }
  if (parsed.JV_ENTRY) {
    return Array.isArray(parsed.JV_ENTRY) ? parsed.JV_ENTRY : [parsed.JV_ENTRY];
  }
  return [];
}


export interface TallyDeletedVoucherRaw {
  cmpguid: string[];
  cmpname: string[];
  guid: string[];
  master_id: string[];
  voucher_type: string[];
  delete_or_cancel: string[];
}


/**
 * Fetches deleted/cancelled vouchers using ZorrofinDeletedVch report
 * @param fromDate Start date (YYYYMMDD)
 * @param toDate End date (YYYYMMDD)
 * @param fromAlterId Optional - starting ALTER_ID (exclusive)
 */
export async function fetchDeletedVouchersFromReport(
  fromDate: string,
  toDate: string,
  fromAlterId: string = '0'
): Promise<any> {
  const xmlRequest = `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>ZorrofinDeletedVch</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <SVFROMDATE>${fromDate}</SVFROMDATE>
          <SVTODATE>${toDate}</SVTODATE>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`.trim();

  return withRetry(async () => {
    const response = await axios.post(TALLY_URL, xmlRequest, {
      headers: { 'Content-Type': 'application/xml' },
      timeout: 120000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      httpAgent: new http.Agent({
        keepAlive: true,
        keepAliveMsecs: 1000,
        maxSockets: 1,
        maxFreeSockets: 1,
      }),
      validateStatus: () => true,
    });

    // === Fix: Wrap multiple root elements ===
    let xmlToParse = response.data.trim();
    if (!xmlToParse.startsWith('<root>')) {
      xmlToParse = `<root>${xmlToParse}</root>`;
    }

    const parsed = await parseStringPromise(xmlToParse, {
      explicitArray: true,
      mergeAttrs: false,
      explicitRoot: false,
      trim: true,
      normalize: true,
    });

    // Early error detection
    if (parsed?.RESPONSE?.[0]?.includes('Unknown Request')) {
      throw new Error('Tally error: Unknown Request. Verify that the report "ZorrofinDeletedVch" exists in Tally.');
    }

    return parsed;
  }, `fetchDeletedVouchersFromReport(${fromDate}-${toDate}, AlterID > ${fromAlterId})`);
}

/**
 * Fetches deleted vouchers using only ALTER_ID filter (incremental sync)
 * Uses a wide date range so ALTER_ID becomes the primary filter
 */
export async function fetchDeletedVouchersByAlterId(
  fromAlterId: string
): Promise<any> {
  // Use a very wide range so we rely mostly on ALTER_ID
  const wideFromDate = '20190401';
  const wideToDate = '20301231'; // far future

  const xmlRequest = `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>ZorrofinDeletedVch</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <SVFROMDATE>${wideFromDate}</SVFROMDATE>
          <SVTODATE>${wideToDate}</SVTODATE>
          <SVZORROFINALTERID>${fromAlterId}</SVZORROFINALTERID>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`.trim();

  return withRetry(async () => {
    const response = await axios.post(TALLY_URL, xmlRequest, {
      headers: { 'Content-Type': 'application/xml' },
      timeout: 120000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      httpAgent: new http.Agent({
        keepAlive: true,
        keepAliveMsecs: 1000,
        maxSockets: 1,
        maxFreeSockets: 1,
      }),
      validateStatus: () => true,
    });

    let xmlToParse = response.data.trim();
    if (!xmlToParse.startsWith('<root>')) {
      xmlToParse = `<root>${xmlToParse}</root>`;
    }

    const parsed = await parseStringPromise(xmlToParse, {
      explicitArray: true,
      mergeAttrs: false,
      explicitRoot: false,
      trim: true,
      normalize: true,
    });

    if (parsed?.RESPONSE?.[0]?.includes('Unknown Request')) {
      throw new Error('Tally error: Unknown Request. Check custom report "ZorrofinDeletedVch".');
    }

    return parsed;
  }, `fetchDeletedVouchersByAlterId(AlterID > ${fromAlterId})`);
}


function getFirstText(values: string[] | undefined): string {
  return values && values.length > 0 ? values[0].trim() : '';
}

/**
 * Extracts array of deleted voucher records from parsed XML
 */
export function extractDeletedVouchersFromReport(parsed: any): TallyDeletedVoucherRaw[] {
  let rawItems: any[] = [];

  // Most common case after wrapper
  if (parsed?.root?.DeleteTallyInvoice) {
    rawItems = Array.isArray(parsed.root.DeleteTallyInvoice)
      ? parsed.root.DeleteTallyInvoice
      : [parsed.root.DeleteTallyInvoice];
  }
  // Fallback cases
  else if (parsed?.DeleteTallyInvoice) {
    rawItems = Array.isArray(parsed.DeleteTallyInvoice)
      ? parsed.DeleteTallyInvoice
      : [parsed.DeleteTallyInvoice];
  }
  else if (parsed?.ENVELOPE?.DeleteTallyInvoice) {
    rawItems = Array.isArray(parsed.ENVELOPE.DeleteTallyInvoice)
      ? parsed.ENVELOPE.DeleteTallyInvoice
      : [parsed.ENVELOPE.DeleteTallyInvoice];
  }

  // Normalize shape
  return rawItems.map((item: any) => ({
    cmpguid: item.cmpguid || [],
    cmpname: item.cmpname || [],
    guid: item.guid || [],
    master_id: item.master_id || [],
    voucher_type: item.voucher_type || [],
    delete_or_cancel: item.delete_or_cancel || [],
  }));
}

/**
 * Converts raw parsed item to clean normalized object
 */
export function parseDeletedVoucher(raw: TallyDeletedVoucherRaw): {
  company_guid: string;
  company_name: string;
  voucher_guid: string;
  tally_master_id: string;
  voucher_type: string;
  deletion_action: 'Delete' | 'Cancel';
} {
  return {
    company_guid: getFirstText(raw.cmpguid),
    company_name: getFirstText(raw.cmpname),
    voucher_guid: getFirstText(raw.guid),
    tally_master_id: getFirstText(raw.master_id),
    voucher_type: getFirstText(raw.voucher_type).toLowerCase(),
    deletion_action: getFirstText(raw.delete_or_cancel) as 'Delete' | 'Cancel',
  };
}

/**
 * Fetches ledger closing balance using ZorrofinLedger report
 * @param ledgerName The name of the ledger to fetch balance for
 * @param toDate Date to get balance as of (YYYYMMDD format)
 * @returns { closingBalance: number, drCr: 'Dr' | 'Cr' | '', parent: string }
 */
export async function fetchLedgerBalance(
  ledgerName: string,
  toDate: string
): Promise<{ closingBalance: number; drCr: 'Dr' | 'Cr' | ''; parent: string }> {
  const xmlRequest = `
<ENVELOPE>
    <HEADER>
        <TALLYREQUEST>Export Data</TALLYREQUEST>
    </HEADER>
    <BODY>
        <EXPORTDATA>
            <REQUESTDESC>
                <REPORTNAME>ZorrofinLedger</REPORTNAME>
                <STATICVARIABLES>
                    <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
                    <SVTODATE>${toDate}</SVTODATE>
                    <SVZORROLEDGERNAME>${ledgerName}</SVZORROLEDGERNAME>
                </STATICVARIABLES>
            </REQUESTDESC>
        </EXPORTDATA>
    </BODY>
</ENVELOPE>`.trim();

  try {
    const response = await axios.post(TALLY_URL, xmlRequest, {
      headers: { 'Content-Type': 'application/xml' },
      timeout: 15000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      httpAgent: new http.Agent({
        keepAlive: true,
        keepAliveMsecs: 1000,
        maxSockets: 1,
        maxFreeSockets: 1,
      }),
      validateStatus: () => true,
    });

    const parsed = await parseStringPromise(response.data, {
      explicitArray: false,
      mergeAttrs: true,
      trim: true,
    });

    // Extract LEDGER data from response
    const ledger = parsed?.ENVELOPE?.BODY?.DATA?.LEDGER ||
                   parsed?.LEDGER ||
                   parsed?.ENVELOPE?.LEDGER;

    if (!ledger) {
      console.log(`[fetchLedgerBalance] No LEDGER data found for: ${ledgerName}`);
      return { closingBalance: 0, drCr: '', parent: '' };
    }

    const closingBalStr = ledger.CLOSINGBAL || ledger.CLOSING_BALANCE || '0';
    const drCr = (ledger.DRCR || ledger.DR_CR || '').trim() as 'Dr' | 'Cr' | '';
    const parent = ledger.PARENT || '';

    // Parse closing balance
    let closingBalance = parseFloat(String(closingBalStr).replace(/,/g, '')) || 0;

    // Apply Dr/Cr sign: Dr = negative (amount owed by customer), Cr = positive (credit)
    // Actually for Sundry Debtors: Dr means customer owes money (positive receivable)
    // But user said: Dr hole - and Cr hole + hobe
    if (drCr === 'Dr') {
      closingBalance = -Math.abs(closingBalance);
    } else if (drCr === 'Cr') {
      closingBalance = Math.abs(closingBalance);
    }

    return { closingBalance, drCr, parent };

  } catch (error: any) {
    console.log(`[fetchLedgerBalance] Error fetching balance for ${ledgerName}:`, error.message);
    return { closingBalance: 0, drCr: '', parent: '' };
  }
}