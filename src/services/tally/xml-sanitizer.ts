// src/services/tally/xml-sanitizer.ts

/**
 * XML Sanitization Utility
 * Prevents XML Injection attacks by escaping special characters
 */

/**
 * Escapes special XML characters to prevent injection attacks
 * @param str - The string to escape
 * @returns Sanitized string safe for XML insertion
 */
export function escapeXml(str: string | number | undefined | null): string {
  if (str === undefined || str === null) {
    return '';
  }

  return String(str)
    .replace(/&/g, '&amp;')   // Must be first to avoid double-escaping
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Validates that a date string is in YYYYMMDD format
 * @param dateStr - Date string to validate
 * @returns true if valid, throws error if invalid
 */
export function validateTallyDate(dateStr: string): boolean {
  const dateRegex = /^\d{8}$/;
  if (!dateRegex.test(dateStr)) {
    throw new Error(`Invalid Tally date format: ${dateStr}. Expected YYYYMMDD format.`);
  }

  // Additional validation: check if it's a valid date
  const year = parseInt(dateStr.substring(0, 4), 10);
  const month = parseInt(dateStr.substring(4, 6), 10);
  const day = parseInt(dateStr.substring(6, 8), 10);

  if (year < 1900 || year > 2100) {
    throw new Error(`Invalid year in date: ${dateStr}`);
  }
  if (month < 1 || month > 12) {
    throw new Error(`Invalid month in date: ${dateStr}`);
  }
  if (day < 1 || day > 31) {
    throw new Error(`Invalid day in date: ${dateStr}`);
  }

  return true;
}

/**
 * Validates ALTER_ID to ensure it's a valid number
 * @param alterId - ALTER_ID to validate
 * @returns Sanitized ALTER_ID string
 */
export function validateAlterId(alterId: string | number): string {
  const alterIdNum = typeof alterId === 'number' ? alterId : parseInt(alterId, 10);

  if (isNaN(alterIdNum) || alterIdNum < 0) {
    throw new Error(`Invalid ALTER_ID: ${alterId}. Must be a non-negative number.`);
  }

  return String(alterIdNum);
}

/**
 * Validates and sanitizes report name
 * Ensures report name contains only alphanumeric characters and underscores
 * @param reportName - Report name to validate
 * @returns Sanitized report name
 */
export function validateReportName(reportName: string): string {
  const reportRegex = /^[a-zA-Z0-9_]+$/;
  if (!reportRegex.test(reportName)) {
    throw new Error(`Invalid report name: ${reportName}. Only alphanumeric characters and underscores allowed.`);
  }
  return reportName;
}

/**
 * Validates and sanitizes ledger name for Tally queries
 * @param ledgerName - Ledger name to sanitize
 * @returns Escaped ledger name safe for XML
 */
export function sanitizeLedgerName(ledgerName: string): string {
  if (!ledgerName || typeof ledgerName !== 'string') {
    throw new Error('Ledger name must be a non-empty string');
  }

  // Escape XML special characters
  return escapeXml(ledgerName);
}
