// src/services/customer/syncCustomers.service.ts

import axios from 'axios';
import fs from 'fs';
import { parseStringPromise } from 'xml2js';
import { DatabaseService, UserProfile } from '../../database/database.service';
import { getApiUrl } from '../../config/api-url-helper';

const db = new DatabaseService();

const ENTITY_TYPE = 'CUSTOMER';
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
    const baseUrl = await getApiUrl(db);
    const API_URL = `${baseUrl}/customer/tally/create`;
    
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
      headers: { 'Content-Type': 'text/xml' },
      timeout: 60000
    });

    // Validate response before parsing
    if (!response.data || typeof response.data !== 'string') {
      throw new Error('Invalid response from Tally: empty or non-string');
    }

    // Check for Tally error messages
    if (response.data.includes('<LINEERROR>') || response.data.includes('<ERROR>') || response.data.includes('ERROR')) {
      db.log('ERROR', 'Tally returned error in XML', { response: response.data.substring(0, 500) });
      throw new Error('Tally returned an error response');
    }

    const parsed = await parseStringPromise(response.data);
    fs.mkdirSync('./dump/customer', { recursive: true });
    fs.writeFileSync('./dump/customer/raw_response.json', JSON.stringify(parsed, null, 2));

    // Safe parsing with validation
    if (!parsed || !parsed.ENVELOPE || !parsed.ENVELOPE.BODY || !Array.isArray(parsed.ENVELOPE.BODY)) {
      db.log('ERROR', 'Invalid XML structure from Tally', { parsed: JSON.stringify(parsed).substring(0, 500) });
      throw new Error('Invalid XML structure returned by Tally');
    }

    const body = parsed.ENVELOPE.BODY[0];
    if (!body || !body.DATA || !Array.isArray(body.DATA)) {
      db.log('INFO', 'No DATA section in Tally response - no new customers');
      await db.logSyncEnd(runId, 'SUCCESS', 0, 0, cleanLastAlterId, 'No DATA section in response');
      return;
    }

    const data = body.DATA[0];
    if (!data || !data.COLLECTION || !Array.isArray(data.COLLECTION)) {
      db.log('INFO', 'No COLLECTION section in Tally response - no new customers');
      await db.logSyncEnd(runId, 'SUCCESS', 0, 0, cleanLastAlterId, 'No COLLECTION section in response');
      return;
    }

    const collection = data.COLLECTION[0];
    const ledgersXml = (collection && collection.LEDGER) ? (Array.isArray(collection.LEDGER) ? collection.LEDGER : [collection.LEDGER]) : [];

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

    // Store customers in local SQLite database first
    db.log('INFO', 'Storing customers in local database');
    db.execInTransaction((tx) => {
      for (let idx = 0; idx < customers.length; idx++) {
        const customer = customers[idx];
        try {
          // Find corresponding ledger XML to get AlterID
          const ledgerXml = ledgersXml[idx] || ledgersXml.find((l: any) => getText(l, 'MASTERID') === customer.customer_id);
          const alterId = ledgerXml ? getText(ledgerXml, 'ALTERID') : '0';

          db.upsertCustomer({
            customer_id: customer.customer_id,
            alter_id: alterId || '0',
            name: customer.name,
            contact_person: customer.contact_person,
            email: customer.email,
            email_cc: customer.email_cc,
            phone: customer.phone,
            mobile: customer.mobile,
            whatsapp_number: customer.whatsapp_number,
            company_name: customer.company_name,
            additional_address_lines: customer.additional_address_lines || [],
            gstin: customer.gstin,
            gst_registration_type: customer.gst_registration_type,
            gst_state: customer.gst_state,
            bank_details: customer.bank_details || [],
            opening_balance: customer.opening_balance,
            current_balance: customer.current_balance,
            current_balance_at: customer.current_balance_at,
            biller_id: customer.biller_id
          }, tx);
        } catch (err: any) {
          db.log('ERROR', `Failed to store customer ${customer.customer_id}`, { error: err.message });
        }
      }
    });
    db.log('INFO', 'Customers stored in local database');

    // Then sync to API
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
        db.log('INFO', 'Customer batch synced to API successfully', { batch_index: i / BATCH_SIZE + 1, count: batch.length });
        
        // Mark as synced in database
        const customerIds = batch.map(c => c.customer_id).filter(id => id);
        if (customerIds.length > 0) {
          db.markRecordsAsSynced('CUSTOMER', customerIds);
        }
        
        // Log individual customer records as successful
        for (const customer of batch) {
          const customerId = customer.customer_id || 'unknown';
          const customerName = customer.name || 'Unknown Customer';
          await db.logSyncRecordDetail(
            runId,
            customerId,
            customerName,
            'CUSTOMER',
            'SUCCESS',
            null
          );
        }
      } catch (err: any) {
        failedCount += batch.length;
        const errorMsg = err.response?.data || err.message || 'Unknown error';
        db.log('ERROR', 'Customer batch API sync failed', { batch_index: i / BATCH_SIZE + 1, error: errorMsg });
        fs.writeFileSync(`./dump/customer/failed_batch_${Date.now()}_${i}.json`, JSON.stringify(payload, null, 2));
        
        // Log individual customer records as failed
        const errorMessage = typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg);
        for (const customer of batch) {
          const customerId = customer.customer_id || 'unknown';
          const customerName = customer.name || 'Unknown Customer';
          await db.logSyncRecordDetail(
            runId,
            customerId,
            customerName,
            'CUSTOMER',
            'FAILED',
            errorMessage
          );
        }
      }
    }

    const status = failedCount === 0 ? 'SUCCESS' : (successCount > 0 ? 'PARTIAL' : 'FAILED');
    const summary = { success: successCount, failed: failedCount, total: customers.length };

    // Update AlterID only if we successfully processed at least some customers
    if (successCount > 0 && newMaxAlterId !== '0') {
      await db.updateEntityMaxAlterId(ENTITY_TYPE, newMaxAlterId);
      db.log('INFO', `Updated AlterID for ${ENTITY_TYPE} to ${newMaxAlterId}`);
    } else if (customers.length > 0) {
      // Even if API sync failed, update AlterID if we processed customers locally
      // This prevents re-processing same customers on next sync
      await db.updateEntityMaxAlterId(ENTITY_TYPE, newMaxAlterId);
      db.log('INFO', `Updated AlterID for ${ENTITY_TYPE} to ${newMaxAlterId} (local processing succeeded, API sync had failures)`);
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