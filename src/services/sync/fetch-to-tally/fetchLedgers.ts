import axios from 'axios';
import fs from 'fs';
import { parseStringPromise } from 'xml2js';
import { DatabaseService } from '../../database/database.service';


// Inject or instantiate DatabaseService (e.g., singleton or passed in)
const databaseService = new DatabaseService();

// Safe text extraction
const getText = (obj: any, key: string): string => {
  const value = obj?.[key]?.[0];
  if (!value) return 'NAN';
  return (typeof value === 'string' ? value.trim() : value._?.trim() || 'NAN');
};

const getAddresses = (addressList: any[]): { company_name: string; additional_address: string[] } => {
  if (!Array.isArray(addressList) || addressList.length === 0) {
    return { company_name: 'NAN', additional_address: [] };
  }
  const lines: string[] = [];
  addressList.forEach(block => {
    if (Array.isArray(block.ADDRESS)) {
      block.ADDRESS.forEach((addr: any) => {
        const text = typeof addr === 'string' ? addr.trim() : addr._?.trim() || '';
        if (text) lines.push(text);
      });
    }
  });
  return {
    company_name: lines[0] || 'NAN',
    additional_address: lines.slice(1)
  };
};

const getBankDetails = (bankList: any[]): any[] => {
  if (!Array.isArray(bankList) || bankList.length === 0) return [];
  return bankList.map(bank => ({
    bank_name: getText(bank, 'BANKNAME') || 'NAN',
    account_number: getText(bank, 'ACCOUNTNUMBER') || 'NAN',
    ifsc_code: getText(bank, 'IFSCCODE') || 'NAN',
    branch: getText(bank, 'BRANCHNAME') || 'NAN'
  }));
};

export async function fetchAllLedgers(batchSize: number = 50): Promise<void> {
  let newMaxAlterId = '0';

  try {
    const lastMaxAlterId = '1' // await databaseService.getGlobalMaxAlterId();
    const cleanLastAlterId = (lastMaxAlterId || '0').trim();

    console.log(`Starting incremental customer sync from AlterID > ${cleanLastAlterId}`);

    // Critical: Use $$Number on BOTH sides for reliable numeric comparison
    const xmlRequest = `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>ARCUSTOMERS</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVLastMaxAlterID>${cleanLastAlterId}</SVLastMaxAlterID>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="ARCUSTOMERS" ISINITIALIZE="Yes">
            <TYPE>Ledger</TYPE>
            <BELONGSTO>Yes</BELONGSTO>
            <CHILDOF>$$GroupSundryDebtors</CHILDOF>
            <FILTERS>IncrementalFilter</FILTERS>
            <NATIVEMETHOD>Name</NATIVEMETHOD>
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
            <NATIVEMETHOD>MasterID</NATIVEMETHOD>
            <NATIVEMETHOD>AlterID</NATIVEMETHOD>
          </COLLECTION>

          <!-- Proven working formula: Numeric comparison with $$Number -->
          <SYSTEM TYPE="Formulae" NAME="IncrementalFilter">
            $$Number:$AlterID > $$Number:##SVLastMaxAlterID
          </SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>
`.trim();

    const response = await axios.post('http://localhost:9000', xmlRequest, {
      headers: { 'Content-Type': 'text/xml' },
    });

    const parsed = await parseStringPromise(response.data);
    fs.mkdirSync('./dump/customer', { recursive: true });
    fs.writeFileSync('./dump/customer/raw_incremental_response.json', JSON.stringify(parsed, null, 2));

    const ledgersXml = parsed.ENVELOPE?.BODY?.[0]?.DATA?.[0]?.COLLECTION?.[0]?.LEDGER || [];

    if (ledgersXml.length === 0) {
      console.log('No new/changed customers since last sync.');
      await databaseService.updateLastSuccessfulSync(); // Optional: update timestamp
      return;
    }

    const customersForAPI: any[] = [];
    let highestAlterId = parseInt(lastMaxAlterId || '0');

    for (const ledger of ledgersXml) {
      const alterIdStr = getText(ledger, 'ALTERID');
      const alterId = parseInt(alterIdStr || '0');
      if (alterId > highestAlterId) highestAlterId = alterId;

      const addressInfo = getAddresses(ledger['ADDRESS.LIST'] || []);
      const bankDetails = getBankDetails(ledger['BANKALLOCATIONS.LIST'] || []);

      const customer = {
        name: getText(ledger, 'NAME') || ledger?.$?.NAME || 'NAN',
        contact_person: getText(ledger, 'LEDGERCONTACT'),
        email: getText(ledger, 'EMAIL'),
        email_cc: getText(ledger, 'EMAILCC'),
        phone: getText(ledger, 'LEDGERPHONE'),
        mobile: getText(ledger, 'LEDGERMOBILE'),
        whatsapp_number: getText(ledger, 'LEDGERMOBILE'),
        company_name: addressInfo.company_name,
        additional_address_lines: addressInfo.additional_address,
        customer_id: getText(ledger, 'MASTERID'),
        biller_id: 'a6ca7e76-34b7-40db-85e4-481ccc5f662f',
        gstin: getText(ledger, 'PARTYGSTIN'),
        gst_registration_type: getText(ledger, 'GSTREGISTRATIONTYPE'),
        gst_state: getText(ledger, 'LEDGERSTATE'),
        bank_details: bankDetails,
        opening_balance: parseFloat(getText(ledger, 'OPENINGBALANCE').replace(/,/g, '') || '0'),
        current_balance: parseFloat(getText(ledger, 'CLOSINGBALANCE').replace(/,/g, '') || '0'),
        current_balance_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
        invoice_details: []
      };

      customersForAPI.push(customer);
    }

    newMaxAlterId = highestAlterId.toString();

    // Save transformed
    fs.writeFileSync('./dump/customer/transformed_incremental_customers.json', JSON.stringify(customersForAPI, null, 2));
    console.log(`Fetched ${customersForAPI.length} changed/new customers (highest AlterID: ${newMaxAlterId})`);

    // Send in batches
    // const apiUrl = 'https://uatarmapi.a10s.in/customer/tally/create';
    // const apiKey = '7061797A6F72726F74616C6C79';

    // for (let i = 0; i < customersForAPI.length; i += batchSize) {
    //     const batch = customersForAPI.slice(i, i + batchSize);
    //     const payload = { customer: batch };

    //     try {
    //         await axios.post(apiUrl, payload, {
    //             headers: { 'API-KEY': apiKey, 'Content-Type': 'application/json' },
    //         });
    //         console.log(`Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(customersForAPI.length / batchSize)} sent`);
    //     } catch (err: any) {
    //         console.error('Batch failed:', err.response?.data || err.message);
    //         fs.writeFileSync(`./dump/customer/failed_batch_${i}.json`, JSON.stringify(payload, null, 2));
    //     }
    // }

    // SUCCESS: Update last_max_alter_id
    await databaseService.updateGlobalMaxAlterId(newMaxAlterId);
    await databaseService.updateLastSuccessfulSync();
    console.log(`Incremental sync completed. New max_alter_id saved: ${newMaxAlterId}`);

  } catch (error: any) {
    console.error('Incremental customer sync failed:', error?.message || error);
    databaseService.log('ERROR', 'Customer incremental sync failed', { error: error?.message });
    // Do NOT update max_alter_id on failure
    throw error;
  }
}