import { TallyClient } from './tally-client';
import { TallyVoucher, TallyLedger, TallyInventoryItem } from './types';
import { DataType } from '../../types';

export class TallyDataFetcher {
  private client: TallyClient;

  constructor(client: TallyClient) {
    this.client = client;
  }

  /**
   * Fetch vouchers from Tally
   */
  async fetchVouchers(fromDate?: Date, toDate?: Date): Promise<TallyVoucher[]> {
    const fromDateStr = fromDate ? fromDate.toISOString().split('T')[0] : '';
    const toDateStr = toDate ? toDate.toISOString().split('T')[0] : '';

    const body = `
      <EXPORTDATA>
        <REQUESTDESC>
          <REPORTNAME>Vouchers</REPORTNAME>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            ${fromDateStr ? `<SVFROMDATE>${fromDateStr}</SVFROMDATE>` : ''}
            ${toDateStr ? `<SVTODATE>${toDateStr}</SVTODATE>` : ''}
          </STATICVARIABLES>
        </REQUESTDESC>
      </EXPORTDATA>
    `;

    const xmlRequest = this.client.buildEnvelope(body);
    const response = await this.client.sendRequest(xmlRequest);

    // Extract vouchers from response
    const vouchers: TallyVoucher[] = [];
    const envelope = response.ENVELOPE;
    if (envelope?.BODY?.EXPORTDATA?.VOUCHER) {
      const voucherData = envelope.BODY.EXPORTDATA.VOUCHER;
      const voucherArray = Array.isArray(voucherData) ? voucherData : [voucherData];
      vouchers.push(...voucherArray);
    }

    return vouchers;
  }

  /**
   * Fetch ledgers from Tally
   */
  async fetchLedgers(): Promise<TallyLedger[]> {
    const body = `
      <EXPORTDATA>
        <REQUESTDESC>
          <REPORTNAME>Ledgers</REPORTNAME>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          </STATICVARIABLES>
        </REQUESTDESC>
      </EXPORTDATA>
    `;

    const xmlRequest = this.client.buildEnvelope(body);
    const response = await this.client.sendRequest(xmlRequest);

    const ledgers: TallyLedger[] = [];
    const envelope = response.ENVELOPE;
    if (envelope?.BODY?.EXPORTDATA?.LEDGER) {
      const ledgerData = envelope.BODY.EXPORTDATA.LEDGER;
      const ledgerArray = Array.isArray(ledgerData) ? ledgerData : [ledgerData];
      ledgers.push(...ledgerArray);
    }

    return ledgers;
  }

  /**
   * Fetch inventory items from Tally
   */
  async fetchInventory(): Promise<TallyInventoryItem[]> {
    const body = `
      <EXPORTDATA>
        <REQUESTDESC>
          <REPORTNAME>Stock Items</REPORTNAME>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          </STATICVARIABLES>
        </REQUESTDESC>
      </EXPORTDATA>
    `;

    const xmlRequest = this.client.buildEnvelope(body);
    const response = await this.client.sendRequest(xmlRequest);

    const inventory: TallyInventoryItem[] = [];
    const envelope = response.ENVELOPE;
    if (envelope?.BODY?.EXPORTDATA?.STOCKITEM) {
      const stockData = envelope.BODY.EXPORTDATA.STOCKITEM;
      const stockArray = Array.isArray(stockData) ? stockData : [stockData];
      inventory.push(...stockArray);
    }

    return inventory;
  }

  /**
   * Fetch data by type
   */
  async fetchData(dataType: DataType, fromDate?: Date, toDate?: Date): Promise<any[]> {
    switch (dataType) {
      case DataType.VOUCHERS:
        return await this.fetchVouchers(fromDate, toDate);
      case DataType.LEDGERS:
        return await this.fetchLedgers();
      case DataType.INVENTORY:
        return await this.fetchInventory();
      default:
        throw new Error(`Unknown data type: ${dataType}`);
    }
  }
}

