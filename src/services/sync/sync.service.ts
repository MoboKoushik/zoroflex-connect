// src/services/sync/sync.service.ts
import * as odbc from 'odbc';
import axios from 'axios';
import { DatabaseService, UserProfile } from '../database/database.service';

export class SyncService {
  private dbService = new DatabaseService();
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private connectionString = 'DSN=TallyODBC64_9000;'; 
  // private connectionString = 'DRIVER={Tally ODBC Driver};SERVER=localhost;PORT=9000;';

  startBackground(profile?: UserProfile): void {
    if (this.isRunning || !profile) {
      console.log('Sync already running or no profile');
      return;
    }

    this.isRunning = true;
    console.log('Background sync started (every 5 minutes)');

    this.fullSync(profile);
    this.intervalId = setInterval(() => {
      this.fullSync(profile);
    }, 5 * 60 * 1000);
  }

  manualSync(profile?: UserProfile): void {
    if (!profile) {
      console.log('Cannot sync: No profile');
      return;
    }
    console.log('Manual sync triggered by user');
    this.fullSync(profile);
  }

  private async fullSync(profile: UserProfile): Promise<void> {
    if (this.isRunning) {
      console.log('Sync already in progress, skipping...');
      return;
    }

    this.isRunning = true;
    let conn: odbc.Connection | null = null;

    try {
      console.log('Connecting to Tally via ODBC...');
      conn = await odbc.connect(this.connectionString);
      console.log('Connected to Tally ODBC');

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const dateFilter = sevenDaysAgo.toISOString().split('T')[0]; // YYYY-MM-DD

      const query = `
        SELECT 
          $Date AS date,
          $VoucherNumber AS number,
          $VoucherTypeName AS type,
          $PartyLedgerName AS party,
          $BasicAmount AS amount
        FROM CompanyVouchers 
        WHERE $Date >= '${dateFilter}'
        ORDER BY $Date DESC
      `;

      const result = await conn.query(query);
      const vouchers: any[] = Array.isArray(result) ? result : [];

      console.log(`Fetched ${vouchers.length} vouchers from Tally`);

      if (vouchers.length === 0) {
        this.dbService.logSync('odbc-pull', 'INFO', { message: 'No new vouchers' });
        return;
      }

      const payload = {
        biller_id: profile.biller_id,
        data: vouchers.map(v => ({
          date: v.date,
          number: v.number || '',
          type: v.type || 'Sales',
          party: v.party || '',
          amount: Number(v.amount) || 0
        }))
      };

      await axios.post('http://localhost:3000/api/sync', payload, {
        headers: {
          'Authorization': `Bearer ${profile.token}`,
          'X-API-Key': profile.apikey || '',
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      console.log('Data successfully sent to backend');
      this.dbService.logSync('odbc-pull', 'SUCCESS', { count: vouchers.length });

    } catch (error: any) {
      console.error('Sync Failed:', error.message || error);

      let msg = 'Unknown error';
      if (error.odbcErrors) {
        msg = error.odbcErrors[0]?.message || 'ODBC Connection Failed';
      } else if (error.code === 'ECONNREFUSED') {
        msg = 'Backend not running (port 3000)';
      } else if (error.response?.status === 401) {
        msg = 'Invalid token – login again';
      }

      this.dbService.logSync('odbc-pull', 'FAILED', { error: msg });
    } finally {
      if (conn) {
        try { await conn.close(); } catch (e) { }
      }
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