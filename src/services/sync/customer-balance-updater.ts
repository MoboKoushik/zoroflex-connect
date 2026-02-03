// src/services/sync/customer-balance-updater.ts
import axios from 'axios';
import { DatabaseService, UserProfile } from '../database/database.service';
import { getApiUrl } from '../config/api-url-helper';
import { getApiKey } from '../config/api-key-helper';
import { fetchLedgerBalance } from '../tally/batch-fetcher';

const BALANCE_UPDATE_BATCH_SIZE = 50;
const BALANCE_UPDATE_DELAY_MS = 500;

/**
 * Format date to DD-MMM-YY format (e.g., 31-Mar-20)
 */
function formatDateToTallyFormat(dateStr: string): string {
  if (!dateStr || dateStr.trim() === '') return '';

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let date: Date;

  // Handle YYYYMMDD format
  const yyyyMMddMatch = dateStr.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (yyyyMMddMatch) {
    const [, year, month, day] = yyyyMMddMatch;
    date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }
  // Handle YYYY-MM-DD format
  else if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    date = new Date(dateStr);
  }
  // Handle DD-MM-YYYY format
  else if (dateStr.match(/^\d{1,2}-\d{1,2}-\d{4}$/)) {
    const parts = dateStr.split('-');
    date = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  }
  // Fallback: try parsing directly
  else {
    date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return dateStr; // Return as-is if can't parse
    }
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = monthNames[date.getMonth()];
  const year = String(date.getFullYear()).slice(-2);

  return `${day}-${month}-${year}`;
}

interface LedgerEntry {
  customer_id?: string;
  ledgername?: string;
  ledgergroup?: string;
  [key: string]: any;
}

interface CustomerBalanceUpdate {
  customer_id: string;
  biller_id: string;
  current_balance: number;
  current_balance_at: string;
}

/**
 * Extract unique SundryDebtors ledger names from voucher data
 */
export function extractSundryDebtorsLedgers(
  vouchersData: any[],
  ledgerEntriesKey: string = 'Ledger_Entries'
): Map<string, string> {
  // Map of ledgername -> customer_id
  const sundryDebtorsMap = new Map<string, string>();

  for (const voucher of vouchersData) {
    const ledgerEntries: LedgerEntry[] = voucher[ledgerEntriesKey] || voucher.ledger_entries || [];

    for (const entry of ledgerEntries) {
      const ledgerGroup = entry.ledgergroup || entry.LEDGERGROUP || '';

      // Check if this is a Sundry Debtors entry (case insensitive, with or without space)
      // Handles: "Sundry Debtors", "SundryDebtors", "sundry debtors", "sundrydebtors"
      const normalizedGroup = ledgerGroup.toLowerCase().replace(/\s+/g, '');
      if (normalizedGroup === 'sundrydebtors') {
        const ledgerName = entry.ledgername || entry.LEDGERNAME || '';
        const customerId = entry.customer_id || entry.CUSTOMER_ID || '';

        if (ledgerName && customerId) {
          sundryDebtorsMap.set(ledgerName, customerId);
        }
      }
    }
  }

  return sundryDebtorsMap;
}

/**
 * Update customer balances after voucher sync
 * @param profile User profile with biller_id
 * @param sundryDebtorsMap Map of ledgername -> customer_id
 * @param syncDate Date to fetch balance for (YYYYMMDD format)
 * @param db DatabaseService instance
 */
export async function updateCustomerBalancesFromVouchers(
  profile: UserProfile,
  sundryDebtorsMap: Map<string, string>,
  syncDate: string,
  db: DatabaseService
): Promise<{ updated: number; failed: number }> {
  if (sundryDebtorsMap.size === 0) {
    db.log('INFO', 'No SundryDebtors entries found, skipping balance update');
    return { updated: 0, failed: 0 };
  }

  try {
    const baseUrl = await getApiUrl(db);
    const apiKey = await getApiKey(db);
    const BALANCE_UPDATE_API = `${baseUrl}/customer/tally/update-balance`;

    if (!apiKey) {
      db.log('ERROR', 'API key not found for balance update');
      return { updated: 0, failed: sundryDebtorsMap.size };
    }

    const billerId = profile?.biller_id || '';
    if (!billerId) {
      db.log('ERROR', 'Biller ID not found for balance update');
      return { updated: 0, failed: sundryDebtorsMap.size };
    }

    // Format the sync date for current_balance_at
    const formattedDate = formatDateToTallyFormat(syncDate);

    db.log('INFO', `Updating balances for ${sundryDebtorsMap.size} SundryDebtors customers`, {
      sync_date: formattedDate
    });

    const customersToUpdate: CustomerBalanceUpdate[] = [];

    // Fetch balance for each ledger from ZorrofinLedger
    for (const [ledgerName, customerId] of sundryDebtorsMap) {
      try {
        const ledgerData = await fetchLedgerBalance(ledgerName, syncDate);

        customersToUpdate.push({
          customer_id: customerId,
          biller_id: billerId,
          current_balance: ledgerData.closingBalance,
          current_balance_at: formattedDate
        });

        db.log('DEBUG', `Fetched balance for ${ledgerName}: ${ledgerData.closingBalance}`);
      } catch (error: any) {
        db.log('WARN', `Failed to fetch balance for ledger ${ledgerName}: ${error.message}`);
      }
    }

    if (customersToUpdate.length === 0) {
      db.log('INFO', 'No customer balances to update');
      return { updated: 0, failed: sundryDebtorsMap.size };
    }

    // Send to API in batches
    let updatedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < customersToUpdate.length; i += BALANCE_UPDATE_BATCH_SIZE) {
      const chunk = customersToUpdate.slice(i, i + BALANCE_UPDATE_BATCH_SIZE);
      const payload = { customers: chunk };

      try {
        const response = await axios.post(BALANCE_UPDATE_API, payload, {
          headers: {
            'API-KEY': apiKey,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        });

        if (response.data?.status) {
          updatedCount += response.data.updated || chunk.length;
          failedCount += response.data.failed || 0;
        } else {
          failedCount += chunk.length;
        }
      } catch (err: any) {
        failedCount += chunk.length;
        const errorMsg = err.response?.data?.message || err.message || 'Unknown error';
        db.log('ERROR', `Customer balance update API failed`, { error: errorMsg });
      }

      await new Promise(resolve => setTimeout(resolve, BALANCE_UPDATE_DELAY_MS));
    }

    db.log('INFO', `Customer balance update completed: ${updatedCount} updated, ${failedCount} failed`);
    return { updated: updatedCount, failed: failedCount };

  } catch (error: any) {
    db.log('ERROR', `Customer balance update failed: ${error.message}`);
    return { updated: 0, failed: sundryDebtorsMap.size };
  }
}
