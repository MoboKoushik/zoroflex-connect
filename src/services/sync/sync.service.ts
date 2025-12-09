import axios from 'axios';
import * as xml2js from 'xml2js';
import { DatabaseService, UserProfile } from '../database/database.service';

export class SyncService {
  private dbService = new DatabaseService();
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  // Background start: Poll every 5min
  startBackground(profile?: UserProfile): void {
    if (this.isRunning || !profile) return;
    this.isRunning = true;
    console.log('Background sync started');
    this.intervalId = setInterval(() => this.syncTallyToBackend(profile), 5 * 60 * 1000);  // 5min
    // Initial sync
    this.syncTallyToBackend(profile);
  }

  // Manual sync from tray
  manualSync(profile?: UserProfile): void {
    if (!profile) {
      console.error('No profile for manual sync');
      return;
    }
    this.syncTallyToBackend(profile);
  }

  // Core sync: Tally XML (port 9000) → Backend (port 300)
  private async syncTallyToBackend(profile: UserProfile): Promise<void> {
    if (!profile || this.isRunning) return;

    try {
      this.isRunning = true;
      console.log('Syncing Tally data...');

      // Step 1: Fetch from Tally XML API (port 9000, ODBC-like via XML)
      const tallyXmlRequest = `
        <ENVELOPE>
          <HEADER>
            <VERSION>1</VERSION>
            <TALLYREQUEST>Export</TALLYREQUEST>
            <TYPE>Data</TYPE>
            <ID>Vouchers</ID>  <!-- e.g., invoices; adjust for your data -->
          </HEADER>
          <BODY>
            <DESC>
              <STATICVARIABLES>
                <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
              </STATICVARIABLES>
            </DESC>
          </BODY>
        </ENVELOPE>
      `;
      const tallyResponse = await axios.post('http://localhost:9000', tallyXmlRequest, {
        headers: { 'Content-Type': 'text/xml' },
        timeout: 30000  // 30s for Tally
      });

      // Step 2: Parse XML
      const parser = new xml2js.Parser();
      const parsedData = await parser.parseStringPromise(tallyResponse.data);
      const vouchers = parsedData.ENVELOPE?.BODY?.[0].DATA?.[0].VOUCHERLIST?.[0].VOUCHER || [];
      console.log(`Fetched ${vouchers.length} vouchers from Tally`);

      if (vouchers.length === 0) return;

      // Step 3: Map to JSON (example: extract key fields)
      const syncData = vouchers.map((v: any) => ({
        biller_id: profile.biller_id,
        voucher_type: v.$.NAME || 'Sales',
        date: v.DATE?.[0] || '',
        amount: parseFloat(v.BASICAMOUNT?.[0] || '0'),
        // Add more: party_name, narration, etc.
      }));

      // Step 4: POST to backend (port 3000) with apikey/token
      const backendResponse = await axios.post('http://localhost:3000/api/sync', {
        data: syncData,
        organization: profile.organization
      }, {
        headers: {
          'Authorization': `Bearer ${profile.token}`,
          'X-API-Key': profile.apikey,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      console.log('Sync success:', backendResponse.status);
      this.dbService.logSync('full', 'success', { count: syncData.length });

    } catch (error: any) {
      console.error('Sync error:', error.message);
      this.dbService.logSync('full', 'error', { error: error.message });
    } finally {
      this.isRunning = false;
    }
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('Background sync stopped');
  }
}