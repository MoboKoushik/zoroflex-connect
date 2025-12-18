// fetchVouchersODBCEnhanced.ts

import odbc from 'odbc';
import fs from 'fs';

/**
 * Fetches vouchers using Tally Prime's ODBC interface for a fixed date range (FY 2025-26).
 * Uses CompanyVouchers (limited to current/recent data; consider custom TDL for full access).
 * Returns flat records with basic fields; nested data limited.
 * 
 * @returns Promise<Array<Record<string, any>>>
 * @throws Error on failure
 */
export async function fetchAllVouchersODBC(): Promise<any> {
    const connectionString = 'DSN=TallyODBC64_9000;';  // Adjust DSN if necessary

    const fromDate = '20250401';
    const toDate   = '20260331';

    // Enhanced query with more fields; use custom collection for better results/nested access
    const query = `
        SELECT 
            $Date AS VoucherDate,
            $VoucherNumber AS VoucherNumber,
            $VoucherTypeName AS VoucherType,
            $PartyLedgerName AS PartyLedger,
            $Narration AS Narration,
            $Amount AS TotalAmount,
            $Reference AS Reference,
            $Guid AS Guid,
            $AlterId AS AlterId
        FROM CompanyVouchers
        WHERE $Date >= '${fromDate}' AND $Date <= '${toDate}'
        ORDER BY $Date, $VoucherNumber
    `;

    let connection;
    try {
        connection = await odbc.connect(connectionString);
        const result = await connection.query(query);

        const jsonFilePath = 'vouchers_odbc_enhanced.json';
        fs.writeFileSync(jsonFilePath, JSON.stringify(result, null, 2), 'utf8');
        console.log(`Fetched ${result.length} vouchers. Saved to ${jsonFilePath}`);

        return result;
    } catch (error: any) {
        throw new Error(`ODBC failure: ${error.message || error}`);
    } finally {
        if (connection) await connection.close();
    }
}

// Example usage
// (async () => {
//     try {
//         const vouchers = await fetchAllVouchersODBC();
//         console.log('Sample:', vouchers[0]);
//     } catch (err) {
//         console.error(err);
//     }
// })();