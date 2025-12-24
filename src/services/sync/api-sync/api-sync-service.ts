import { DatabaseService } from '../../database/database.service';
import { ApiClient } from '../../api/api-client-wrapper';
import { getApiUrl } from '../../config/api-url-helper';

interface Batch {
  id: number;
  entity_type: string;
  batch_number: number;
  record_count: number;
  status: string;
  retry_count: number;
}

export class ApiSyncService {
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 5000;
  private readonly BATCH_SIZE = 100;
  private apiClient: ApiClient;

  constructor(private db: DatabaseService) {
    this.apiClient = new ApiClient();
  }

  async syncToAPI(entityType: string): Promise<void> {
    this.db.log('INFO', `Starting API sync for ${entityType}`);

    try {
      // Get unsynced records in batches of 100
      const records = await this.db.getUnsyncedRecords(entityType, this.BATCH_SIZE);

      if (records.length === 0) {
        this.db.log('INFO', `No unsynced ${entityType} records to sync`);
        return;
      }

      // Process in batches
      let batchNumber = 1;
      for (let i = 0; i < records.length; i += this.BATCH_SIZE) {
        const batchRecords = records.slice(i, i + this.BATCH_SIZE);
        
        // Create batch record
        const batchId = this.db.createApiSyncBatch(entityType, batchNumber, batchRecords.length);

        try {
          await this.syncBatchWithRetry(batchId, entityType, batchRecords);
          batchNumber++;
        } catch (error: any) {
          this.db.log('ERROR', `Failed to sync batch ${batchNumber} for ${entityType}`, {
            batchId,
            error: error.message
          });
          // Continue with next batch
          batchNumber++;
        }
      }

      this.db.log('INFO', `Completed API sync for ${entityType}`);
    } catch (error: any) {
      this.db.log('ERROR', `API sync failed for ${entityType}`, { error: error.message });
      throw error;
    }
  }

  private async syncBatchWithRetry(
    batchId: number,
    entityType: string,
    records: Array<{ id: number; [key: string]: any }>
  ): Promise<void> {
    let retries = 0;
    const batch = this.getBatchById(batchId);

    while (retries < this.MAX_RETRIES) {
      try {
        // Transform records for API
        const transformedRecords = this.transformRecordsForAPI(entityType, records);

        // Send to API
        const baseUrl = await getApiUrl(this.db);
        await this.sendBatchToAPI(entityType, transformedRecords, baseUrl);

        // Mark batch as SUCCESS
        this.db.updateApiSyncBatchStatus(batchId, 'SUCCESS');

        // Mark individual records as synced
        const recordIds = records.map(r => {
          if (entityType.toUpperCase() === 'CUSTOMER') {
            return r.customer_id;
          } else {
            return r.voucher_id;
          }
        }).filter(id => id);

        this.db.markRecordsAsSynced(entityType, recordIds);

        return; // Success
      } catch (error: any) {
        retries++;
        
        if (retries >= this.MAX_RETRIES) {
          this.db.updateApiSyncBatchStatus(batchId, 'FAILED', error.message, retries);
          throw error;
        }

        // Update batch status to RETRYING
        this.db.updateApiSyncBatchStatus(batchId, 'RETRYING', error.message, retries);

        // Exponential backoff
        await this.sleep(this.RETRY_DELAY_MS * retries);
      }
    }
  }

  private getBatchById(batchId: number): Batch {
    // This is a helper method - batch info is already available from createApiSyncBatch
    // We'll get it from the database if needed
    const dbInstance = (this.db as any).db;
    if (!dbInstance) {
      throw new Error('Database not initialized');
    }
    const stmt = dbInstance.prepare('SELECT * FROM api_sync_batches WHERE id = ?');
    return stmt.get(batchId) as Batch;
  }

  private transformRecordsForAPI(entityType: string, records: Array<{ [key: string]: any }>): any[] {
    switch (entityType.toUpperCase()) {
      case 'CUSTOMER':
        return records.map(record => ({
          customer_id: record.customer_id,
          name: record.name,
          contact_person: record.contact_person,
          email: record.email,
          email_cc: record.email_cc,
          phone: record.phone,
          mobile: record.mobile,
          whatsapp_number: record.whatsapp_number,
          company_name: record.company_name,
          additional_address_lines: record.additional_address_lines 
            ? JSON.parse(record.additional_address_lines) 
            : [],
          gstin: record.gstin,
          gst_registration_type: record.gst_registration_type,
          gst_state: record.gst_state,
          bank_details: record.bank_details 
            ? JSON.parse(record.bank_details) 
            : [],
          opening_balance: record.opening_balance,
          current_balance: record.current_balance,
          current_balance_at: record.current_balance_at,
          biller_id: record.biller_id
        }));
      case 'INVOICE':
      case 'RECEIPT':
      case 'JOURNAL':
        return records.map(record => ({
          voucher_id: record.voucher_id,
          voucher_type: record.voucher_type,
          voucher_number: record.voucher_number,
          date: record.date,
          customer_id: record.customer_id,
          customer_name: record.customer_name,
          party_ledger_name: record.party_ledger_name,
          total_amount: record.total_amount,
          balance_amount: record.balance_amount,
          narration: record.narration,
          voucher_data: record.voucher_data 
            ? JSON.parse(record.voucher_data) 
            : null
        }));
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }
  }

  private async sendBatchToAPI(entityType: string, records: any[], baseUrl: string): Promise<void> {
    const profile = await this.db.getProfile();
    if (!profile) {
      throw new Error('User profile not found');
    }

    switch (entityType.toUpperCase()) {
      case 'CUSTOMER':
        await this.apiClient.sendRequest(
          `${baseUrl}/customer/tally/create`,
          'POST',
          { customer: records },
          profile.token
        );
        break;
      case 'INVOICE':
        await this.apiClient.sendRequest(
          `${baseUrl}/invoice/tally/create`,
          'POST',
          { invoices: records },
          profile.token
        );
        break;
      case 'RECEIPT':
        await this.apiClient.sendRequest(
          `${baseUrl}/receipt/tally/create`,
          'POST',
          { receipts: records },
          profile.token
        );
        break;
      case 'JOURNAL':
        await this.apiClient.sendRequest(
          `${baseUrl}/journal/tally/create`,
          'POST',
          { journals: records },
          profile.token
        );
        break;
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

