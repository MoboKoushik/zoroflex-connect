// src/services/sync.service.ts

import * as odbc from 'odbc';
import axios from 'axios';
import { DatabaseService, UserProfile } from '../database/database.service';

const BASE_URL = 'http://localhost:3000';
const API_KEY = '7061797A6F72726F74616C6C79';

export class SyncService {
  private dbService: DatabaseService;
  private isRunning = false;
  private connectionString = 'DSN=TallyODBC64_9000;UID=;PWD=;';

  constructor(dbService: DatabaseService) {
    this.dbService = dbService;
  }

  // ORGANIZATION SYNC
  private async syncOrganization(profile: UserProfile): Promise<void> {
    const runId = await this.dbService.logSyncStart('BACKGROUND', 'ORGANIZATION');
    let conn: odbc.Connection | null = null;
    try {
      conn = await odbc.connect(this.connectionString);
      const result = await conn.query(`
        SELECT $Name AS name, $MailingName AS mailing_name, $StateName AS state,
               $CountryName AS country, $TRN AS trn
        FROM Company
      `);
      const company: any = Array.isArray(result) && result.length > 0 ? result[0] : null;
      console.log('Fetched company info from Tally:', company);
      if (!company) throw new Error('No company in Tally');

      const tallyId = (company.mailing_name || company.name || 'TALLY_CO').trim();

      await axios.post(`${BASE_URL}/billers/tally/set-organization`, {
        biller: [{
          biller_id: profile.biller_id,
          tally_id: tallyId,
          state: company.state || 'West Bengal',
          country: company.country || 'India',
          trn: company.trn || '23406713697'
        }]
      }, { headers: { 'API-KEY': API_KEY } });

      await this.dbService.updateOrganization(profile.email, { name: tallyId, synced_at: new Date().toISOString() });
      await this.dbService.log('INFO', 'Organization synced', { tallyId });
      await this.dbService.logSyncEnd(runId, 'SUCCESS', 1);
    } catch (e: any) {
      await this.dbService.logSyncEnd(runId, 'FAILED', 0, undefined, e.message);
      this.dbService.log('ERROR', 'Organization sync failed', e);
    } finally {
      if (conn) await conn.close().catch(() => { });
    }
  }

  private async executeSync(
    conn: odbc.Connection,
    runId: number,
    entity: string,
    query: string,
    builder: (rows: any[]) => { url: string; payload: any; batchMaxAlter: string }
  ): Promise<void> {
    try {
      const result = await conn.query(query);
      const rows = Array.isArray(result) ? result : [];
      if (rows.length === 0) {
        await this.dbService.logSyncEnd(runId, 'SUCCESS', 0);
        return;
      }
      console.log(`Fetched ${rows.length} ${entity}(s) from Tally`, JSON.stringify(rows, null, 2));
      const { url, payload, batchMaxAlter } = builder(rows);
      console.log(`Syncing ${entity}(s) to server`, url, JSON.stringify(payload, null, 2));
      await axios.post(url, payload, { headers: { 'API-KEY': API_KEY }, timeout: 90000 });
      await this.dbService.logSyncEnd(runId, 'SUCCESS', rows.length, batchMaxAlter);
      await this.dbService.updateGlobalMaxAlterId(batchMaxAlter);
      this.dbService.log('INFO', `${entity} synced`, { count: rows.length, maxAlter: batchMaxAlter });
    } catch (e: any) {
      await this.dbService.logSyncEnd(runId, 'FAILED', 0, undefined, e.message);
      this.dbService.log('ERROR', `${entity} sync failed`, e);
    }
  }

  // CUSTOMERS
  private async syncCustomers(conn: odbc.Connection, profile: UserProfile, type: 'MANUAL' | 'BACKGROUND'): Promise<void> {
    const runId = await this.dbService.logSyncStart(type, 'CUSTOMER');
    const filter = parseInt(await this.dbService.getGlobalMaxAlterId()) || 0;

    const query = `
    SELECT 
      $Name, $MailingName, $EMail AS email, $Phone, $MobileNo,
      $GSTIN AS gstin, $ClosingBalance, $OpeningBalance,
      $MasterId, $AlterId
    FROM Ledger
    WHERE $$IsLedOfGrp:$Name:$$GroupSundryDebtors 
      AND $AlterId > ${filter}
    ORDER BY $AlterId ASC
  `;

    await this.executeSync(conn, runId, 'CUSTOMER', query, (rows: any[]) => {
      const batchMaxAlter = Math.max(...rows.map(r => parseInt(r.$AlterId || '0', 10))).toString();

      return {
        url: `${BASE_URL}/customer/tally/create`,
        payload: {
          customer: rows.map(r => {

            return {
              name: (r.$Name || 'Unknown Customer').trim(),
              company_name: (r.$MailingName || r.$Name || 'Unknown Company').trim(),
              customer_id: r.$MasterId?.toString() || `CUST_${r.$AlterId}`,
              biller_id: profile.biller_id!,
              email: r.email || '',
              phone: r.$Phone || '',
              mobile: r.$MobileNo || '',
              gstin: r.gstin || '',
              current_balance: Number(r.$ClosingBalance) || 0,
              current_balance_at: "2025-11-17 16:48:30",
              opening_balance: Number(r.$OpeningBalance) || 0,
              invoice_details: []
            };
          })
        },
        batchMaxAlter
      };
    });
  }

  private async fullSync(profile: UserProfile, type: 'MANUAL' | 'BACKGROUND' = 'BACKGROUND'): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    let conn: odbc.Connection | null = null;
    try {
      conn = await odbc.connect(this.connectionString);
      this.dbService.log('INFO', `${type} sync started`);

      const prof = await this.dbService.getProfile();
      console.log('Current profile before sync:', prof);
      if (type === 'MANUAL' || !prof?.organization?.synced_at) {
        await this.syncOrganization(profile);
      }

      await this.syncCustomers(conn, profile, type);


      await this.dbService.updateLastSuccessfulSync();
      this.dbService.log('INFO', `${type} sync completed`);
    } catch (e: any) {
      this.dbService.log('ERROR', 'Sync failed', e);
    } finally {
      if (conn) await conn.close().catch(() => { });
      this.isRunning = false;
    }
  }

  async manualSync(profile: UserProfile) { await this.fullSync(profile, 'MANUAL'); }
  startBackgroundSync(profile: UserProfile) {
    this.fullSync(profile, 'BACKGROUND');
    setInterval(() => this.fullSync(profile, 'BACKGROUND'), 300000);
  }
  stop() { this.isRunning = false; }
}