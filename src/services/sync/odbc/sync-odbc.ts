// src/services/sync.service.ts

import * as odbc from 'odbc';
import axios from 'axios';

export class SyncService {
    private isRunning = false;
    private connectionString = 'DSN=TallyODBC64_9000;UID=;PWD=;';

    constructor(
    ) {
    }

    // ORGANIZATION SYNC
    private async syncOrganization(): Promise<void> {
        let conn: odbc.Connection | null = null;
        try {
            conn = await odbc.connect(this.connectionString);
            const result = await conn.query(`
        SELECT 
          $Name, $MailingName, $Address, $StateName, $CountryName,
          $GSTIN, $TRN, $Phone, $EMail, $PINCode, $MasterId, $AlterId
        FROM Company
      `);
            const company: any = Array.isArray(result) && result.length > 0 ? result[0] : null;

            if (!company) throw new Error('No company in Tally');

            const tallyId = (company.$MailingName || company.$Name || 'TALLY_CO').trim();
            const payload = {
                biller: [{
                    biller_id: '',
                    organization_id: '',  // Optional per Postman
                    tally_id: tallyId,
                    state: company.$StateName || 'West Bengal',
                    country: company.$CountryName || 'India',
                    trn: company.$TRN || '23406713697'
                }]
            };

        } catch (e: any) {
            console.error('Organization sync failed', e);
        } finally {
            if (conn) await conn.close().catch(() => { });
        }
    }


    // CUSTOMERS 
    private async syncCustomers(): Promise<void> {
        let conn: odbc.Connection | null = await odbc.connect(this.connectionString);
        const query = `
      SELECT $Name, $MailingName, $EMail AS email, $Phone, $MobileNo, $GSTIN AS gstin,
             $ClosingBalance, $OpeningBalance, $MasterId, $AlterId
      FROM Ledger
      WHERE $$IsLedOfGrp:$Name:$$GroupSundryDebtors AND $AlterId > ${0}
      ORDER BY $AlterId ASC
    `;

    }

    // INVOICES 
    private async syncInvoices(): Promise<void> {
        let conn: odbc.Connection | null = await odbc.connect(this.connectionString);
        const query = `
      SELECT $Date AS issue_date, 
             $DueDate AS due_date, 
             $VoucherNumber AS invoice_number,
             $Reference AS ref_number, 
             $PartyLedgerName AS customer_name, 
             $BasicLedgerName AS party_ledger,
             $VoucherTypeName AS voucher_type, 
             $Narration, 
             $BasicAccountAmount AS total,
             $EwayBillNo, 
             $TransDate AS eway_date, 
             $FromStateName AS dispatch_from, 
             $ToStateName AS dispatch_to,
             $TransMode AS mode, 
             $VehicleNo AS vehicle_number, 
             $TransporterName AS transport_name,
             $LRNo AS lading_no, 
             $LRDate AS lading_date, 
             $IRN, $AckNo AS acknowledge_no, 
             $AckDate AS ack_date
             $MasterId, $AlterId
      FROM Voucher
      // WHERE $AlterId > ${0}
      ORDER BY $AlterId ASC
    `;
        const result = await conn.query(query);
        const rows = Array.isArray(result) ? result : [];

        console.log(`Fetched ${rows.length} INVOICE(s) from Tally`, JSON.stringify(rows.slice(0, 2), null, 2));  // Log sample for brevity
    }

    // PAYMENTS
    private async syncPayments(): Promise<void> {
        let conn: odbc.Connection | null = await odbc.connect(this.connectionString);
        // const query = `Select $Name from ODBCTables`;
        const query = `SELECT * FROM ODBC_Zoro_Sales WHERE 1 = 1`;

        const result = await conn.query(query);
        console.log('Payment query result:', JSON.stringify(result, null, 2));
        // const rows = Array.isArray(result) ? result : [];

        // console.log(`Fetched ${rows.length} PAYMENT(s) from Tally`, JSON.stringify(rows.slice(0, 2), null, 2));  // Log sample for brevity


    }

    // STOCK ITEMS
    private async syncStockItems(): Promise<void> {
        let conn: odbc.Connection | null = await odbc.connect(this.connectionString);
        const query = `
    SELECT
      $Name,
      $PartNumber,
      $Parent AS group_name,
      $BaseUnits AS uom,
      $AlternateUnits AS alt_unit,
      $HSNSAC AS hsn_code,
      $SetAlterGST AS gst_applicable_date,
      $RateofTaxGST AS gst_rate,
      $MasterId, $AlterId
    FROM StockItem
    WHERE $AlterId > ${0}
    ORDER BY $AlterId ASC
  `;

    }

    // JOURNAL ENTRIES
    private async syncJournalEntries(): Promise<void> {
 let conn: odbc.Connection | null = await odbc.connect(this.connectionString);
        const query = `
      SELECT $Date AS date, $VoucherNumber AS voucher_number, $Reference AS ref_number,
             $Narration AS narration, $AlterId
      FROM Voucher
      WHERE $VoucherTypeName CONTAINS 'Journal' AND $AlterId > ${0}
      ORDER BY $AlterId ASC
    `;

        const result = await conn.query(query);
        console.log('Journal query result:', result);
    }
}