// src/services/customer/syncCustomers.service.ts

import axios from 'axios';
import fs from 'fs';
import { parseStringPromise } from 'xml2js';
import { DatabaseService, UserProfile } from '../../database/database.service';

const db = new DatabaseService();

const ENTITY_TYPE = 'CUSTOMER';
const API_URL = 'https://uatarmapi.a10s.in/customer/tally/create';
const API_KEY = '7061797A6F72726F74616C6C79';
const BATCH_SIZE = 20;

interface Customer {
  name: string;
  contact_person: string;
  email: string;
  email_cc: string;
  phone: string;
  mobile: string;
  whatsapp_number: string;
  company_name: string;
  additional_address_lines: string[];
  customer_id: string;
  biller_id: string;
  gstin: string;
  gst_registration_type: string;
  gst_state: string;
  bank_details: Array<{
    bank_name: string;
    account_number: string;
    ifsc_code: string;
    branch: string;
  }>;
  opening_balance: number;
  current_balance: number;
  current_balance_at: string;
  invoice_details: any[];
}


const getText = (obj: any, key: string): string => {
  const value = obj?.[key]?.[0];
  if (!value) return '';
  return (typeof value === 'string' ? value.trim() : value._?.trim() || '');
};

const getAddresses = (addressList: any[]): { company_name: string; additional_address: string[] } => {
  if (!Array.isArray(addressList) || addressList.length === 0) {
    return { company_name: '', additional_address: [] };
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
    company_name: lines[0] || '',
    additional_address: lines.slice(1)
  };
};

const getBankDetails = (bankList: any[]): Customer['bank_details'] => {
  if (!Array.isArray(bankList) || bankList.length === 0) return [];
  return bankList.map(bank => ({
    bank_name: getText(bank, 'BANKNAME') || '',
    account_number: getText(bank, 'ACCOUNTNUMBER') || '',
    ifsc_code: getText(bank, 'IFSCCODE') || '',
    branch: getText(bank, 'BRANCHNAME') || ''
  }));
};

export async function syncCustomers(profile: UserProfile): Promise<void> {
  const runId = await db.logSyncStart('BACKGROUND', ENTITY_TYPE);
  let successCount = 0;
  let failedCount = 0;
  let newMaxAlterId = '0';

  try {
    const lastMaxAlterId = await db.getEntityMaxAlterId(ENTITY_TYPE);
    const cleanLastAlterId = lastMaxAlterId.trim();

    db.log('INFO', 'Customer sync started', { from_alter_id: cleanLastAlterId });

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
          <SYSTEM TYPE="Formulae" NAME="IncrementalFilter">
            $$Number:$AlterID > $$Number:##SVLastMaxAlterID
          </SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`.trim();

    const response = await axios.post('http://localhost:9000', xmlRequest, {
      headers: { 'Content-Type': 'text/xml' }
    });

    const parsed = await parseStringPromise(response.data);
    fs.mkdirSync('./dump/customer', { recursive: true });
    fs.writeFileSync('./dump/customer/raw_response.json', JSON.stringify(parsed, null, 2));

    const ledgersXml = parsed.ENVELOPE?.BODY?.[0]?.DATA?.[0]?.COLLECTION?.[0]?.LEDGER || [];

    if (ledgersXml.length === 0) {
      await db.logSyncEnd(runId, 'SUCCESS', 0, 0, cleanLastAlterId, 'No new customers');
      db.log('INFO', 'No new/updated customers found');
      return;
    }

    const customers: Customer[] = [];
    let highestAlterId = parseInt(cleanLastAlterId || '0', 10);

    for (const ledger of ledgersXml) {
      const alterIdStr = getText(ledger, 'ALTERID');
      const alterId = parseInt(alterIdStr || '0', 10);
      if (alterId > highestAlterId) highestAlterId = alterId;

      const addressInfo = getAddresses(ledger['ADDRESS.LIST'] || []);
      const bankDetails = getBankDetails(ledger['BANKALLOCATIONS.LIST'] || []);

      const customer: Customer = {
        name: getText(ledger, 'NAME') || ledger?.$?.NAME || '',
        contact_person: getText(ledger, 'LEDGERCONTACT'),
        email: getText(ledger, 'EMAIL'),
        email_cc: getText(ledger, 'EMAILCC'),
        phone: getText(ledger, 'LEDGERPHONE'),
        mobile: getText(ledger, 'LEDGERMOBILE'),
        whatsapp_number: getText(ledger, 'LEDGERMOBILE'),
        company_name: addressInfo.company_name,
        additional_address_lines: addressInfo.additional_address,
        customer_id: getText(ledger, 'MASTERID'),
        biller_id: profile?.biller_id || '',
        gstin: getText(ledger, 'PARTYGSTIN'),
        gst_registration_type: getText(ledger, 'GSTREGISTRATIONTYPE'),
        gst_state: getText(ledger, 'LEDGERSTATE'),
        bank_details: bankDetails,
        opening_balance: parseFloat(getText(ledger, 'OPENINGBALANCE').replace(/,/g, '') || '0'),
        current_balance: parseFloat(getText(ledger, 'CLOSINGBALANCE').replace(/,/g, '') || '0'),
        current_balance_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
        invoice_details: []
      };

      customers.push(customer);
    }

    newMaxAlterId = highestAlterId.toString();

    fs.writeFileSync('./dump/customer/transformed_customers.json', JSON.stringify(customers, null, 2));
    db.log('INFO', 'Customers transformed', { count: customers.length, highest_alter_id: newMaxAlterId });

    for (let i = 0; i < customers.length; i += BATCH_SIZE) {
      const batch = customers.slice(i, i + BATCH_SIZE);
      const payload = { customer: batch };

      try {
        await axios.post(API_URL, payload, {
          headers: {
            'API-KEY': API_KEY,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        });
        successCount += batch.length;
        db.log('INFO', 'Customer batch synced successfully', { batch_index: i / BATCH_SIZE + 1, count: batch.length });
      } catch (err: any) {
        failedCount += batch.length;
        const errorMsg = err.response?.data || err.message || 'Unknown error';
        db.log('ERROR', 'Customer batch failed', { batch_index: i / BATCH_SIZE + 1, error: errorMsg });
        fs.writeFileSync(`./dump/customer/failed_batch_${Date.now()}_${i}.json`, JSON.stringify(payload, null, 2));
      }
    }

    const status = failedCount === 0 ? 'SUCCESS' : (successCount > 0 ? 'PARTIAL' : 'FAILED');
    const summary = { success: successCount, failed: failedCount, total: customers.length };

    if (successCount > 0) {
      await db.updateEntityMaxAlterId(ENTITY_TYPE, newMaxAlterId);
    }

    await db.logSyncEnd(runId, status, successCount, failedCount, newMaxAlterId, `${successCount} customers synced`, summary);
    await db.updateLastSuccessfulSync();

    db.log('INFO', 'Customer sync completed', summary);

  } catch (error: any) {
    await db.logSyncEnd(runId, 'FAILED', successCount, failedCount, undefined, error.message || 'Unknown error');
    db.log('ERROR', 'Customer sync crashed', { error: error.message });
    throw error;
  }
}