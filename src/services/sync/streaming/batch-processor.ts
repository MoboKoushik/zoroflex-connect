import { DatabaseService } from '../../database/database.service';
import { ParsedRecord } from './xml-stream-parser';
import Database from 'better-sqlite3';

export class BatchProcessor {
  constructor(private db: DatabaseService) {}

  async processBatch(
    entityType: string,
    records: ParsedRecord[],
    batchAlterId: string
  ): Promise<{ successCount: number; failedCount: number }> {
    let successCount = 0;
    let failedCount = 0;

    // Get profile once before transaction
    const profile = await this.db.getProfile();

    // Use transaction for atomic batch processing
    this.db.execInTransaction((tx: Database.Database) => {
      for (const record of records) {
        try {
          switch (entityType.toUpperCase()) {
            case 'CUSTOMER':
              this.upsertCustomer(record, profile, tx);
              successCount++;
              break;
            case 'INVOICE':
            case 'RECEIPT':
            case 'JOURNAL':
              this.upsertVoucher(record, entityType, tx);
              successCount++;
              break;
            default:
              throw new Error(`Unknown entity type: ${entityType}`);
          }
        } catch (error: any) {
          this.db.log('ERROR', `Failed to process ${entityType} record`, {
            alterId: record.alterId,
            error: error.message
          });
          failedCount++;
        }
      }

      // Update checkpoint after successful batch processing
      this.db.updateEntityMaxAlterId(entityType, batchAlterId, tx);
    });

    return { successCount, failedCount };
  }

  private upsertCustomer(record: ParsedRecord, profile: any, tx: Database.Database): void {
    const data = record.data;
    const getText = (key: string): string => {
      const value = data[key];
      return value ? String(value).trim() : '';
    };

    const getAddresses = (): { company_name: string; additional_address: string[] } => {
      const addressList = data['ADDRESS.LIST'] || [];
      if (!Array.isArray(addressList) || addressList.length === 0) {
        return { company_name: '', additional_address: [] };
      }
      const lines: string[] = [];
      addressList.forEach((block: any) => {
        if (Array.isArray(block.ADDRESS)) {
          block.ADDRESS.forEach((addr: any) => {
            const text = typeof addr === 'string' ? addr.trim() : String(addr || '').trim();
            if (text) lines.push(text);
          });
        } else if (typeof block === 'string') {
          lines.push(block);
        }
      });
      return {
        company_name: lines[0] || '',
        additional_address: lines.slice(1)
      };
    };

    const getBankDetails = (): any[] => {
      const bankList = data['BANKALLOCATIONS.LIST'] || [];
      if (!Array.isArray(bankList)) return [];
      return bankList.map((bank: any) => ({
        bank_name: bank.BANKNAME ? String(bank.BANKNAME).trim() : '',
        account_number: bank.ACCOUNTNUMBER ? String(bank.ACCOUNTNUMBER).trim() : '',
        ifsc_code: bank.IFSCCODE ? String(bank.IFSCCODE).trim() : '',
        branch: bank.BRANCHNAME ? String(bank.BRANCHNAME).trim() : ''
      }));
    };

    const addressInfo = getAddresses();
    const bankDetails = getBankDetails();
    
    this.db.upsertCustomer({
      customer_id: getText('MASTERID') || getText('MasterID') || '',
      alter_id: record.alterId,
      name: getText('NAME') || data.$?.NAME || '',
      contact_person: getText('LEDGERCONTACT') || getText('LedgerContact'),
      email: getText('EMAIL') || getText('Email'),
      email_cc: getText('EMAILCC') || getText('EmailCC'),
      phone: getText('LEDGERPHONE') || getText('LedgerPhone'),
      mobile: getText('LEDGERMOBILE') || getText('LedgerMobile'),
      whatsapp_number: getText('LEDGERMOBILE') || getText('LedgerMobile'),
      company_name: addressInfo.company_name,
      additional_address_lines: addressInfo.additional_address,
      gstin: getText('PARTYGSTIN') || getText('PartyGSTIN'),
      gst_registration_type: getText('GSTREGISTRATIONTYPE') || getText('GSTRegistrationType'),
      gst_state: getText('LEDGERSTATE') || getText('LedgerState'),
      bank_details: bankDetails,
      opening_balance: parseFloat((getText('OPENINGBALANCE') || getText('OpeningBalance') || '0').replace(/,/g, '')),
      current_balance: parseFloat((getText('CLOSINGBALANCE') || getText('ClosingBalance') || '0').replace(/,/g, '')),
      current_balance_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      biller_id: profile?.biller_id || null
    }, tx);
  }

  private upsertVoucher(record: ParsedRecord, entityType: string, tx: Database.Database): void {
    const data = record.data;
    const getText = (key: string): string => {
      const value = data[key];
      return value ? String(value).trim() : '';
    };

    const getLedgerEntries = (): any[] => {
      const entries = data['ALLLEDGERENTRIES.LIST'] || data['AllLedgerEntries.List'] || [];
      if (!Array.isArray(entries)) return [];
      return entries.map((entry: any) => ({
        ledger_name: entry.LEDGERNAME || entry.LedgerName || '',
        master_id: entry.MASTERID || entry.MasterID || '',
        amount: parseFloat((entry.AMOUNT || entry.Amount || '0').replace(/,/g, '')),
        is_deemed_positive: entry.ISDEEMEDPOSITIVE || entry.IsDeemedPositive || ''
      }));
    };

    const getLineItems = (): any[] => {
      const items = data['ALLINVENTORYENTRIES.LIST'] || data['InventoryEntries.List'] || [];
      if (!Array.isArray(items)) return [];
      return items.map((item: any, index: number) => ({
        line_number: index + 1,
        stock_item_name: item.STOCKITEMNAME || item.StockItemName || '',
        billed_qty: parseFloat((item.BILLEDQTY || item.BilledQty || '0').replace(/,/g, '')),
        rate: parseFloat((item.RATE || item.Rate || '0').replace(/,/g, '')),
        amount: parseFloat((item.AMOUNT || item.Amount || '0').replace(/,/g, '')),
        basic_unit: item.BASICUNIT || item.BasicUnit || '',
        alt_unit: item.ALTUNIT || item.AltUnit || '',
        taxable_percentage: parseFloat((item.TAXABLEPERCENTAGE || item.TaxablePercentage || '0').replace(/,/g, '')),
        discount: parseFloat((item.DISCOUNT || item.Discount || '0').replace(/,/g, '')),
        batch_allocations: item['BATCHALLOCATIONS.LIST'] || item['BatchAllocations.List'] || []
      }));
    };

    const ledgerEntries = getLedgerEntries();
    const lineItems = getLineItems();
    
    // Calculate total amount from ledger entries
    let totalAmount = 0;
    for (const entry of ledgerEntries) {
      totalAmount += Math.abs(entry.amount || 0);
    }

    // Determine voucher type
    const voucherTypeName = (getText('VOUCHERTYPENAME') || getText('VoucherTypeName') || '').toUpperCase();
    let voucherType = 'SALES';
    if (voucherTypeName.includes('RECEIPT')) {
      voucherType = 'RECEIPT';
    } else if (voucherTypeName.includes('JOURNAL') || voucherTypeName.includes('JV')) {
      voucherType = 'JVENTRY';
    }

    const voucherId = getText('MASTERID') || getText('MasterID') || '';
    const customerId = ledgerEntries.length > 0 ? (ledgerEntries[0].master_id || '') : '';
    const customerName = getText('PARTYLEDGERNAME') || getText('PartyLedgerName') || '';

    // Upsert voucher
    this.db.upsertVoucher({
      voucher_id: voucherId,
      alter_id: record.alterId,
      voucher_type: voucherType,
      voucher_number: getText('VOUCHERNUMBER') || getText('VoucherNumber') || '',
      date: getText('DATE') || getText('Date') || '',
      customer_id: customerId || null,
      customer_name: customerName,
      party_ledger_name: customerName,
      total_amount: totalAmount,
      balance_amount: 0, // Can be calculated later if needed
      narration: getText('NARRATION') || getText('Narration') || '',
      voucher_data: data // Store full data as JSON
    }, tx);

    // Upsert line items
    if (lineItems.length > 0) {
      this.db.upsertVoucherLineItems(voucherId, lineItems, tx);
    }
  }
}

