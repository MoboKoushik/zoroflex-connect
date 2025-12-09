import * as odbc from 'odbc';
import axios from 'axios';
import { DatabaseService, UserProfile } from '../database/database.service';

export class SyncService {
  private dbService = new DatabaseService();
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private connectionString = 'DSN=TallyODBC_9000;';

  startBackground(profile?: UserProfile): void {
    if (this.isRunning || !profile) return;
    this.isRunning = true;
    console.log('Background sync started');
    this.intervalId = setInterval(() => this.fullSync(profile), 300000); // 5min
    this.fullSync(profile);
  }

  manualSync(profile?: UserProfile): void {
    if (profile) this.fullSync(profile);
  }

  private async fullSync(profile: UserProfile): Promise<void> {
    let conn: odbc.Connection | null = null;
    try {
      this.isRunning = true;

      // ODBC Fetch from Tally
      conn = await odbc.connect(this.connectionString);
      const vouchers = await conn.query('SELECT $Date AS date, $VoucherNumber AS number, $BasicAmount AS amount FROM CompanyVouchers WHERE $Date > \'2025-01-01\'');
      
      const syncData = vouchers.map((v: any) => ({
        biller_id: profile.biller_id,
        date: v.date,
        number: v.number,
        amount: parseFloat(v.amount || 0)
      }));

      // POST to Backend 3000
      await axios.post('http://localhost:3000/api/sync', { data: syncData }, {
        headers: { Authorization: `Bearer ${profile.token}`, 'X-API-Key': profile.apikey }
      });

      this.dbService.logSync('odbc', 'success', { count: syncData.length });

      // Push from Backend to Tally
      const updates = await axios.get('http://localhost:3000/api/data-updates', { headers: { Authorization: `Bearer ${profile.token}` } });
      for (const update of updates.data) {
        await conn.query(`INSERT INTO CompanyVouchers ($Date, $VoucherNumber, $BasicAmount) VALUES ('${update.date}', '${update.number}', ${update.amount})`);
      }

    } catch (error: any) {
      console.error('Sync error:', error);
      this.dbService.logSync('odbc', 'error', { error: error.message });
    } finally {
      if (conn) await conn.close();
      this.isRunning = false;
    }
  }

  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    this.isRunning = false;
  }
}