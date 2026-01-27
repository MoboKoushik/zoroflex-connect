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
 * Fetches vouchers using ZorrofinReceipt report with date range (for first sync only)
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
 * @param cullection Starting 
 * @returns Parsed XML response with VOUCHERS containing INVOICE and RECEIPT arrays
 */
export async function fetchVouchersFromReportByAlterId(
  fromAlterId: string, cullection: string): Promise<any> {
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
                <REPORTNAME>ZorrofinCust</REPORTNAME>
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

    // Log raw response for debugging (first 500 chars)
    const rawResponsePreview = typeof response.data === 'string'
      ? response.data.substring(0, 500)
      : JSON.stringify(response.data).substring(0, 500);
    console.log('Tally ZorrofinCmp response preview:', rawResponsePreview);

    const parsed = await parseStringPromise(response.data, {
      explicitArray: true,
      mergeAttrs: false,
      explicitRoot: false
    });

    // Log parsed structure for debugging
    console.log('Parsed response structure:', {
      hasEnvelope: !!parsed.ENVELOPE,
      envelopeKeys: parsed.ENVELOPE ? Object.keys(parsed.ENVELOPE) : [],
      hasBiller: !!parsed.ENVELOPE?.BILLER,
      billerType: Array.isArray(parsed.ENVELOPE?.BILLER) ? 'array' : typeof parsed.ENVELOPE?.BILLER,
      billerLength: Array.isArray(parsed.ENVELOPE?.BILLER) ? parsed.ENVELOPE.BILLER.length : 'not array'
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
  console.log('extractBillersFromReport - Parsed structure:', {
    hasEnvelope: !!parsed?.ENVELOPE,
    envelopeKeys: parsed?.ENVELOPE ? Object.keys(parsed.ENVELOPE) : [],
    hasBiller: !!parsed?.ENVELOPE?.BILLER,
    billerType: Array.isArray(parsed?.ENVELOPE?.BILLER) ? 'array' : typeof parsed?.ENVELOPE?.BILLER,
    hasBody: !!parsed?.ENVELOPE?.BODY,
    hasDirectBiller: !!parsed?.BILLER
  });

  // Response structure: ENVELOPE.BILLER (array) or ENVELOPE.BODY[0].BILLER
  if (parsed?.ENVELOPE?.BILLER) {
    const billers = Array.isArray(parsed.ENVELOPE.BILLER)
      ? parsed.ENVELOPE.BILLER
      : [parsed.ENVELOPE.BILLER];
    console.log(`extractBillersFromReport - Found ${billers.length} billers in ENVELOPE.BILLER`);
    return billers;
  }

  if (parsed?.ENVELOPE?.BODY?.[0]?.BILLER) {
    const billers = parsed.ENVELOPE.BODY[0].BILLER;
    const billerArray = Array.isArray(billers) ? billers : [billers];
    console.log(`extractBillersFromReport - Found ${billerArray.length} billers in ENVELOPE.BODY[0].BILLER`);
    return billerArray;
  }

  if (parsed?.BILLER) {
    const billers = Array.isArray(parsed.BILLER) ? parsed.BILLER : [parsed.BILLER];
    console.log(`extractBillersFromReport - Found ${billers.length} billers in BILLER`);
    return billers;
  }

  console.warn('extractBillersFromReport - No BILLER found in response. Full parsed structure:', JSON.stringify(parsed, null, 2).substring(0, 1000));
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
