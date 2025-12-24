import axios, { AxiosResponse } from 'axios';
import { StreamingXMLParser, ParsedRecord } from './xml-stream-parser';

export interface BatchFetchResult {
  records: ParsedRecord[];
  toAlterId: string;
  actualCount: number;
}

export class BatchFetcher {
  private readonly BATCH_SIZE = 100;
  private readonly MAX_ALTER_ID_INCREMENT = 100;
  private readonly TALLY_URL = 'http://localhost:9000';

  async fetchBatch(
    entityType: string,
    fromAlterId: string
  ): Promise<BatchFetchResult> {
    // Calculate toAlterId (fromAlterId + 100)
    const fromIdNum = parseInt(fromAlterId || '0', 10);
    const toAlterId = (fromIdNum + this.MAX_ALTER_ID_INCREMENT).toString();

    // Build XML with batch window
    const xml = this.buildBatchXML(entityType, fromAlterId, toAlterId);

    try {
      // Fetch from Tally with streaming response
      const response: AxiosResponse = await axios.post(this.TALLY_URL, xml, {
        headers: { 'Content-Type': 'text/xml' },
        responseType: 'stream',
        timeout: 30000
      });

      // Parse stream
      const parser = new StreamingXMLParser(this.BATCH_SIZE);
      const records = await parser.parse(response.data);

      // Determine actual voucher type if needed
      const processedRecords = records.map(record => {
        if (record.type === 'INVOICE' && record.data.VOUCHERTYPENAME) {
          const voucherType = String(record.data.VOUCHERTYPENAME).toLowerCase();
          if (voucherType.includes('receipt')) {
            record.type = 'RECEIPT';
          } else if (voucherType.includes('journal') || voucherType.includes('jv')) {
            record.type = 'JOURNAL';
          } else {
            record.type = 'INVOICE';
          }
        }
        return record;
      });

      return {
        records: processedRecords,
        toAlterId,
        actualCount: processedRecords.length
      };
    } catch (error: any) {
      throw new Error(`Batch fetch failed for ${entityType}: ${error.message}`);
    }
  }

  private buildBatchXML(entityType: string, from: string, to: string): string {
    switch (entityType.toUpperCase()) {
      case 'CUSTOMER':
        return this.buildCustomerBatchXML(from, to);
      case 'INVOICE':
        return this.buildSalesVoucherBatchXML(from, to, 'Sales');
      case 'RECEIPT':
        return this.buildReceiptVoucherBatchXML(from, to);
      case 'JOURNAL':
        return this.buildJournalVoucherBatchXML(from, to);
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }
  }

  private buildCustomerBatchXML(fromAlterId: string, toAlterId: string): string {
    return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>ARCUSTOMERS_BATCH</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVFromAlterID>${fromAlterId}</SVFromAlterID>
        <SVToAlterID>${toAlterId}</SVToAlterID>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="ARCUSTOMERS_BATCH" ISINITIALIZE="Yes">
            <TYPE>Ledger</TYPE>
            <BELONGSTO>Yes</BELONGSTO>
            <CHILDOF>$$GroupSundryDebtors</CHILDOF>
            <FILTERS>BatchFilter</FILTERS>
            <NATIVEMETHOD>Name</NATIVEMETHOD>
            <NATIVEMETHOD>MasterID</NATIVEMETHOD>
            <NATIVEMETHOD>AlterID</NATIVEMETHOD>
            <NATIVEMETHOD>LedgerContact</NATIVEMETHOD>
            <NATIVEMETHOD>Email</NATIVEMETHOD>
            <NATIVEMETHOD>EmailCC</NATIVEMETHOD>
            <NATIVEMETHOD>LedgerPhone</NATIVEMETHOD>
            <NATIVEMETHOD>LedgerMobile</NATIVEMETHOD>
            <NATIVEMETHOD>OpeningBalance</NATIVEMETHOD>
            <NATIVEMETHOD>ClosingBalance</NATIVEMETHOD>
            <NATIVEMETHOD>Address.List</NATIVEMETHOD>
            <NATIVEMETHOD>PartyGSTIN</NATIVEMETHOD>
            <NATIVEMETHOD>GSTRegistrationType</NATIVEMETHOD>
            <NATIVEMETHOD>LedgerState</NATIVEMETHOD>
            <NATIVEMETHOD>BankAllocations.List</NATIVEMETHOD>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="BatchFilter">
            ($$Number:$AlterID >= $$Number:##SVFromAlterID) AND 
            ($$Number:$AlterID <= $$Number:##SVToAlterID)
          </SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
  }

  private buildSalesVoucherBatchXML(fromAlterId: string, toAlterId: string, voucherType: string): string {
    return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>SALES_VOUCHERS_BATCH</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVFromAlterID>${fromAlterId}</SVFromAlterID>
        <SVToAlterID>${toAlterId}</SVToAlterID>
        <SVVoucherType>${voucherType}</SVVoucherType>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="SALES_VOUCHERS_BATCH" ISINITIALIZE="Yes">
            <TYPE>Voucher</TYPE>
            <FILTERS>BatchSalesFilter</FILTERS>
            <NATIVEMETHOD>Date</NATIVEMETHOD>
            <NATIVEMETHOD>VoucherNumber</NATIVEMETHOD>
            <NATIVEMETHOD>VoucherTypeName</NATIVEMETHOD>
            <NATIVEMETHOD>PartyLedgerName</NATIVEMETHOD>
            <NATIVEMETHOD>MasterID</NATIVEMETHOD>
            <NATIVEMETHOD>AlterID</NATIVEMETHOD>
            <NATIVEMETHOD>AllLedgerEntries.List</NATIVEMETHOD>
            <NATIVEMETHOD>AllLedgerEntries.LedgerName</NATIVEMETHOD>
            <NATIVEMETHOD>AllLedgerEntries.MasterID</NATIVEMETHOD>
            <NATIVEMETHOD>AllLedgerEntries.Amount</NATIVEMETHOD>
            <NATIVEMETHOD>InventoryEntries.List</NATIVEMETHOD>
            <NATIVEMETHOD>InventoryEntries.StockItemName</NATIVEMETHOD>
            <NATIVEMETHOD>InventoryEntries.BilledQty</NATIVEMETHOD>
            <NATIVEMETHOD>InventoryEntries.Rate</NATIVEMETHOD>
            <NATIVEMETHOD>InventoryEntries.Amount</NATIVEMETHOD>
            <NATIVEMETHOD>Narration</NATIVEMETHOD>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="BatchSalesFilter">
            ($$String:$VoucherTypeName = ##SVVoucherType) AND
            ($$Number:$AlterID >= $$Number:##SVFromAlterID) AND 
            ($$Number:$AlterID <= $$Number:##SVToAlterID)
          </SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
  }

  private buildReceiptVoucherBatchXML(fromAlterId: string, toAlterId: string): string {
    return this.buildSalesVoucherBatchXML(fromAlterId, toAlterId, 'Receipt');
  }

  private buildJournalVoucherBatchXML(fromAlterId: string, toAlterId: string): string {
    return this.buildSalesVoucherBatchXML(fromAlterId, toAlterId, 'Journal');
  }
}

