// src/services/customer/syncCustomers.service.ts

import axios from 'axios';
import fs from 'fs';
import { DatabaseService, UserProfile, CustomerData } from '../../database/database.service';
import { getApiUrl } from '../../config/api-url-helper';
import { fetchCustomersBatch, fetchCustomersBatchByDateRange, extractLedgersFromBatch } from '../../tally/batch-fetcher';

const db = new DatabaseService();

const ENTITY_TYPE = 'CUSTOMER';
const API_KEY = '7061797A6F72726F74616C6C79';
const BATCH_SIZE = 20; // API batch size (for sending to API)
const TALLY_BATCH_SIZE = 100; // Tally fetch batch size

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

/**
 * Generate monthly batches from date range
 * @param fromDate Date range start (YYYY-MM-DD format)
 * @param toDate Date range end (YYYY-MM-DD format)
 * @returns Array of monthly batches with formatted dates
 */
function generateMonthlyBatches(fromDate: string, toDate: string): Array<{
  month: string;
  fromDate: string;
  toDate: string;
  tallyFromDate: string;
  tallyToDate: string;
}> {
  const batches: Array<{
    month: string;
    fromDate: string;
    toDate: string;
    tallyFromDate: string;
    tallyToDate: string;
  }> = [];

  const start = new Date(fromDate);
  const end = new Date(toDate);

  let current = new Date(start.getFullYear(), start.getMonth(), 1);

  while (current <= end) {
    const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
    const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);

    const actualStart = monthStart < start ? start : monthStart;
    const actualEnd = monthEnd > end ? end : monthEnd;

    // Format for display (YYYY-MM-DD)
    const displayFrom = actualStart.toISOString().split('T')[0];
    const displayTo = actualEnd.toISOString().split('T')[0];

    // Format for Tally (YYYYMMDD)
    const tallyFrom = displayFrom.replace(/-/g, '');
    const tallyTo = displayTo.replace(/-/g, '');

    batches.push({
      month: `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`,
      fromDate: displayFrom,
      toDate: displayTo,
      tallyFromDate: tallyFrom,
      tallyToDate: tallyTo
    });

    current.setMonth(current.getMonth() + 1);
  }

  return batches;
}

export async function syncCustomers(
  profile: UserProfile,
  syncMode: 'first' | 'incremental' = 'incremental',
  dateRangeFrom?: string,
  dateRangeTo?: string
): Promise<void> {
  const runId = await db.logSyncStart('BACKGROUND', ENTITY_TYPE);
  let successCount = 0;
  let failedCount = 0;
  let newMaxAlterId = '0';

  try {
    const baseUrl = await getApiUrl(db);
    const API_URL = `${baseUrl}/customer/tally/create`;

    db.log('INFO', 'Customer sync started', { sync_mode: syncMode, date_range: dateRangeFrom && dateRangeTo ? `${dateRangeFrom} to ${dateRangeTo}` : 'none' });

    let batchNumber = 0;

    // BRANCHING LOGIC: First Sync vs Incremental
    if (syncMode === 'first' && dateRangeFrom && dateRangeTo) {
      // ===== FIRST SYNC PATH: Monthly Date Range Batching =====
      const monthlyBatches = generateMonthlyBatches(dateRangeFrom, dateRangeTo);
      db.log('INFO', `First sync: Processing ${monthlyBatches.length} months`, { from: dateRangeFrom, to: dateRangeTo });

      for (const monthBatch of monthlyBatches) {
        const { month, fromDate, toDate, tallyFromDate, tallyToDate } = monthBatch;
        db.log('INFO', `Processing month: ${month} (${fromDate} to ${toDate})`);

        let monthAlterId = '0';
        let monthBatchNumber = 0;
        let hasMoreInMonth = true;

        while (hasMoreInMonth) {
          monthBatchNumber++;
          batchNumber++;
          const fromAlterId = monthAlterId; // Start from last processed AlterID within this month

          // Create batch tracking record with month information
          const batchId = await db.createSyncBatch(
            runId,
            ENTITY_TYPE,
            batchNumber,
            TALLY_BATCH_SIZE,
            fromAlterId,
            fromAlterId,
            month,
            fromDate,
            toDate,
            'first_sync'
          );

          let ledgersXml: any[] = [];
          try {
            // Fetch batch from Tally with DATE RANGE filter
            console.log(`[First Sync] Month ${month}, Batch ${monthBatchNumber}: Date ${tallyFromDate}-${tallyToDate}, AlterID > ${fromAlterId}`);
            const parsed = await fetchCustomersBatchByDateRange(tallyFromDate, tallyToDate, fromAlterId, TALLY_BATCH_SIZE);
            fs.mkdirSync('./dump/customer', { recursive: true });
            fs.writeFileSync(`./dump/customer/first_sync_${month}_batch_${monthBatchNumber}.json`, JSON.stringify(parsed, null, 2));

            ledgersXml = extractLedgersFromBatch(parsed);

            if (ledgersXml.length === 0) {
              hasMoreInMonth = false;
              await db.updateSyncBatchStatus(batchId, 'COMPLETED', 0);
              db.log('INFO', `Month ${month} completed: No more records`);
              break;
            }

            // Filter and sort by AlterID
            const fromAlterIdNum = parseInt(fromAlterId, 10);
            ledgersXml = ledgersXml
              .filter((ledger: any) => {
                const alterId = parseInt(getText(ledger, 'ALTERID') || '0', 10);
                return alterId > fromAlterIdNum;
              })
              .sort((a: any, b: any) => {
                const idA = parseInt(getText(a, 'ALTERID') || '0', 10);
                const idB = parseInt(getText(b, 'ALTERID') || '0', 10);
                return idA - idB;
              })
              .slice(0, TALLY_BATCH_SIZE);

            if (ledgersXml.length === 0) {
              hasMoreInMonth = false;
              await db.updateSyncBatchStatus(batchId, 'COMPLETED', 0);
              db.log('INFO', `Month ${month} completed: No records after filtering`);
              break;
            }

            await db.updateSyncBatchStatus(batchId, 'FETCHED', ledgersXml.length);

            // Store customers and prepare for API (same logic as incremental)
            const customersForAPI: Customer[] = [];
            let batchHighestAlterId = parseInt(monthAlterId, 10);

            for (const ledger of ledgersXml) {
              const alterIdStr = getText(ledger, 'ALTERID');
              const alterId = parseInt(alterIdStr || '0', 10);
              if (alterId > batchHighestAlterId) batchHighestAlterId = alterId;

              const addressInfo = getAddresses(ledger['ADDRESS.LIST'] || []);
              const bankDetails = getBankDetails(ledger['BANKALLOCATIONS.LIST'] || []);
              const ledgerName = getText(ledger, 'NAME') || ledger?.$?.NAME || '';
              const masterId = getText(ledger, 'MASTERID');
              const openingBalance = parseFloat(getText(ledger, 'OPENINGBALANCE').replace(/,/g, '') || '0');
              const currentBalance = parseFloat(getText(ledger, 'CLOSINGBALANCE').replace(/,/g, '') || '0');
              const currentBalanceAt = new Date().toISOString().slice(0, 19).replace('T', ' ');

              // Store in SQLite
              const customerData: CustomerData = {
                tally_master_id: masterId,
                ledger_name: ledgerName,
                ledger_name_lower: ledgerName.toLowerCase(),
                contact_person: getText(ledger, 'LEDGERCONTACT') || undefined,
                email: getText(ledger, 'EMAIL') || undefined,
                email_cc: getText(ledger, 'EMAILCC') || undefined,
                phone: getText(ledger, 'LEDGERPHONE') || undefined,
                mobile: getText(ledger, 'LEDGERMOBILE') || undefined,
                company_name: addressInfo.company_name || undefined,
                address_json: JSON.stringify(addressInfo.additional_address),
                gstin: getText(ledger, 'PARTYGSTIN') || undefined,
                gst_registration_type: getText(ledger, 'GSTREGISTRATIONTYPE') || undefined,
                gst_state: getText(ledger, 'LEDGERSTATE') || undefined,
                bank_details_json: JSON.stringify(bankDetails),
                opening_balance: openingBalance,
                current_balance: currentBalance,
                current_balance_at: currentBalanceAt,
                tally_alter_id: alterIdStr
              };

              await db.insertCustomer(customerData);

              // Prepare for API
              const customer: Customer = {
                name: ledgerName,
                contact_person: getText(ledger, 'LEDGERCONTACT'),
                email: getText(ledger, 'EMAIL'),
                email_cc: getText(ledger, 'EMAILCC'),
                phone: getText(ledger, 'LEDGERPHONE'),
                mobile: getText(ledger, 'LEDGERMOBILE'),
                whatsapp_number: getText(ledger, 'LEDGERMOBILE'),
                company_name: addressInfo.company_name,
                additional_address_lines: addressInfo.additional_address,
                customer_id: masterId,
                biller_id: profile?.biller_id || '',
                gstin: getText(ledger, 'PARTYGSTIN'),
                gst_registration_type: getText(ledger, 'GSTREGISTRATIONTYPE'),
                gst_state: getText(ledger, 'LEDGERSTATE'),
                bank_details: bankDetails,
                opening_balance: openingBalance,
                current_balance: currentBalance,
                current_balance_at: currentBalanceAt,
                invoice_details: []
              };

              customersForAPI.push(customer);
            }

            await db.updateSyncBatchStatus(batchId, 'STORED', ledgersXml.length, ledgersXml.length);

            // Update monthAlterId for next batch within this month
            monthAlterId = batchHighestAlterId.toString();
            if (batchHighestAlterId > parseInt(newMaxAlterId, 10)) {
              newMaxAlterId = batchHighestAlterId.toString();
            }

            // Send to API in batches of 20
            let apiSuccessCount = 0;
            let apiFailedCount = 0;

            for (let i = 0; i < customersForAPI.length; i += BATCH_SIZE) {
              const apiBatch = customersForAPI.slice(i, i + BATCH_SIZE);
              const payload = { customer: apiBatch };

              try {
                await axios.post(API_URL, payload, {
                  headers: {
                    'API-KEY': API_KEY,
                    'Content-Type': 'application/json'
                  },
                  timeout: 30000
                });
                apiSuccessCount += apiBatch.length;
                successCount += apiBatch.length;

                for (const customer of apiBatch) {
                  await db.logSyncRecordDetail(runId, customer.customer_id || 'unknown', customer.name || 'Unknown Customer', 'CUSTOMER', 'SUCCESS', null);
                }
              } catch (err: any) {
                apiFailedCount += apiBatch.length;
                failedCount += apiBatch.length;
                const errorMsg = err.response?.data || err.message || 'Unknown error';
                db.log('ERROR', `Customer API batch failed (Month ${month})`, { batch_index: i / BATCH_SIZE + 1, error: errorMsg });
                fs.writeFileSync(`./dump/customer/failed_${month}_${Date.now()}_${i}.json`, JSON.stringify(payload, null, 2));

                const errorMessage = typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg);
                for (const customer of apiBatch) {
                  await db.logSyncRecordDetail(runId, customer.customer_id || 'unknown', customer.name || 'Unknown Customer', 'CUSTOMER', 'FAILED', errorMessage);
                }
              }
            }

            await db.updateSyncBatchStatus(
              batchId,
              apiFailedCount === 0 ? 'API_SUCCESS' : 'API_FAILED',
              ledgersXml.length,
              ledgersXml.length,
              apiSuccessCount,
              apiFailedCount > 0 ? `API failed for ${apiFailedCount} records` : undefined
            );

            // Check if we should continue within this month
            if (ledgersXml.length < TALLY_BATCH_SIZE) {
              hasMoreInMonth = false;
              db.log('INFO', `Month ${month} completed: Fetched ${ledgersXml.length} < ${TALLY_BATCH_SIZE}`);
            }

          } catch (error: any) {
            await db.updateSyncBatchStatus(batchId, 'API_FAILED', 0, 0, 0, error.message);
            db.log('ERROR', `Customer batch failed (Month ${month}, Batch ${monthBatchNumber})`, { error: error.message });
            if (ledgersXml?.length < TALLY_BATCH_SIZE) {
              hasMoreInMonth = false;
            }
          }
        }
      }

    } else {
      // ===== INCREMENTAL SYNC PATH: ALTER_ID Only (Existing Logic) =====
      const lastMaxAlterId = await db.getEntityMaxAlterId(ENTITY_TYPE);
      console.log('Last Max AlterID for Customer:', lastMaxAlterId);
      const cleanLastAlterId = lastMaxAlterId.trim();
      let currentAlterId = parseInt(cleanLastAlterId || '0', 10);

      db.log('INFO', 'Customer incremental sync', { from_alter_id: cleanLastAlterId });

      let hasMoreBatches = true;

      while (hasMoreBatches) {
      batchNumber++;
      const fromAlterId = currentAlterId.toString(); // Start from last processed AlterID

      // Create batch tracking record
      const batchId = await db.createSyncBatch(
        runId,
        ENTITY_TYPE,
        batchNumber,
        TALLY_BATCH_SIZE,
        fromAlterId,
        fromAlterId+TALLY_BATCH_SIZE // No upper bound
      );

      let ledgersXml: any[] = [];
      try {
        // Fetch batch from Tally
        // Pass TALLY_BATCH_SIZE as sizeMax to limit the number of records returned
        console.log(`Fetching customers batch ${batchNumber}: AlterID > ${fromAlterId} (max ${TALLY_BATCH_SIZE} records)`);
        const parsed = await fetchCustomersBatch(fromAlterId, TALLY_BATCH_SIZE);
        fs.mkdirSync('./dump/customer', { recursive: true });
        fs.writeFileSync(`./dump/customer/raw_batch_${batchNumber}.json`, JSON.stringify(parsed, null, 2));

        ledgersXml = extractLedgersFromBatch(parsed);

        if (ledgersXml.length === 0) {
          hasMoreBatches = false;
          await db.updateSyncBatchStatus(batchId, 'COMPLETED', 0);
          break;
        }

        // Filter and sort by AlterID
        // Fetch records with AlterID > fromAlterId (exclusive)
        const fromAlterIdNum = parseInt(fromAlterId, 10);
        ledgersXml = ledgersXml
          .filter((ledger: any) => {
            const alterId = parseInt(getText(ledger, 'ALTERID') || '0', 10);
            return alterId > fromAlterIdNum;
          })
          .sort((a: any, b: any) => {
            const idA = parseInt(getText(a, 'ALTERID') || '0', 10);
            const idB = parseInt(getText(b, 'ALTERID') || '0', 10);
            return idA - idB;
          })
          .slice(0, TALLY_BATCH_SIZE);

        if (ledgersXml.length === 0) {
          hasMoreBatches = false;
          await db.updateSyncBatchStatus(batchId, 'COMPLETED', 0);
          break;
        }

        await db.updateSyncBatchStatus(batchId, 'FETCHED', ledgersXml.length);

        // Store customers in SQLite FIRST (before API send)
        const customersForAPI: Customer[] = [];
        let batchHighestAlterId = currentAlterId;

        for (const ledger of ledgersXml) {
          const alterIdStr = getText(ledger, 'ALTERID');
          const alterId = parseInt(alterIdStr || '0', 10);
          if (alterId > batchHighestAlterId) batchHighestAlterId = alterId;

          const addressInfo = getAddresses(ledger['ADDRESS.LIST'] || []);
          const bankDetails = getBankDetails(ledger['BANKALLOCATIONS.LIST'] || []);
          const ledgerName = getText(ledger, 'NAME') || ledger?.$?.NAME || '';
          const masterId = getText(ledger, 'MASTERID');
          const openingBalance = parseFloat(getText(ledger, 'OPENINGBALANCE').replace(/,/g, '') || '0');
          const currentBalance = parseFloat(getText(ledger, 'CLOSINGBALANCE').replace(/,/g, '') || '0');
          const currentBalanceAt = new Date().toISOString().slice(0, 19).replace('T', ' ');

          // Store in SQLite
          const customerData: CustomerData = {
            tally_master_id: masterId,
            ledger_name: ledgerName,
            ledger_name_lower: ledgerName.toLowerCase(),
            contact_person: getText(ledger, 'LEDGERCONTACT') || undefined,
            email: getText(ledger, 'EMAIL') || undefined,
            email_cc: getText(ledger, 'EMAILCC') || undefined,
            phone: getText(ledger, 'LEDGERPHONE') || undefined,
            mobile: getText(ledger, 'LEDGERMOBILE') || undefined,
            company_name: addressInfo.company_name || undefined,
            address_json: JSON.stringify(addressInfo.additional_address),
            gstin: getText(ledger, 'PARTYGSTIN') || undefined,
            gst_registration_type: getText(ledger, 'GSTREGISTRATIONTYPE') || undefined,
            gst_state: getText(ledger, 'LEDGERSTATE') || undefined,
            bank_details_json: JSON.stringify(bankDetails),
            opening_balance: openingBalance,
            current_balance: currentBalance,
            current_balance_at: currentBalanceAt,
            tally_alter_id: alterIdStr
          };

          await db.insertCustomer(customerData);

          // Prepare for API (using existing Customer interface)
          const customer: Customer = {
            name: ledgerName,
            contact_person: getText(ledger, 'LEDGERCONTACT'),
            email: getText(ledger, 'EMAIL'),
            email_cc: getText(ledger, 'EMAILCC'),
            phone: getText(ledger, 'LEDGERPHONE'),
            mobile: getText(ledger, 'LEDGERMOBILE'),
            whatsapp_number: getText(ledger, 'LEDGERMOBILE'),
            company_name: addressInfo.company_name,
            additional_address_lines: addressInfo.additional_address,
            customer_id: masterId,
            biller_id: profile?.biller_id || '',
            gstin: getText(ledger, 'PARTYGSTIN'),
            gst_registration_type: getText(ledger, 'GSTREGISTRATIONTYPE'),
            gst_state: getText(ledger, 'LEDGERSTATE'),
            bank_details: bankDetails,
            opening_balance: openingBalance,
            current_balance: currentBalance,
            current_balance_at: currentBalanceAt,
            invoice_details: []
          };

          customersForAPI.push(customer);
        }

        await db.updateSyncBatchStatus(batchId, 'STORED', ledgersXml.length, ledgersXml.length);

        // Update current AlterID for next batch
        currentAlterId = batchHighestAlterId;
        newMaxAlterId = currentAlterId.toString();

        // Send to API in batches of 20
        let apiSuccessCount = 0;
        let apiFailedCount = 0;

        for (let i = 0; i < customersForAPI.length; i += BATCH_SIZE) {
          const apiBatch = customersForAPI.slice(i, i + BATCH_SIZE);
          const payload = { customer: apiBatch };

          try {
            await axios.post(API_URL, payload, {
              headers: {
                'API-KEY': API_KEY,
                'Content-Type': 'application/json'
              },
              timeout: 30000
            });
            apiSuccessCount += apiBatch.length;
            successCount += apiBatch.length;

            // Log individual customer records as successful
            for (const customer of apiBatch) {
              await db.logSyncRecordDetail(
                runId,
                customer.customer_id || 'unknown',
                customer.name || 'Unknown Customer',
                'CUSTOMER',
                'SUCCESS',
                null
              );
            }
          } catch (err: any) {
            apiFailedCount += apiBatch.length;
            failedCount += apiBatch.length;
            const errorMsg = err.response?.data || err.message || 'Unknown error';
            db.log('ERROR', 'Customer API batch failed', { batch_index: i / BATCH_SIZE + 1, error: errorMsg });
            fs.writeFileSync(`./dump/customer/failed_batch_${Date.now()}_${i}.json`, JSON.stringify(payload, null, 2));

            // Log individual customer records as failed
            const errorMessage = typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg);
            for (const customer of apiBatch) {
              await db.logSyncRecordDetail(
                runId,
                customer.customer_id || 'unknown',
                customer.name || 'Unknown Customer',
                'CUSTOMER',
                'FAILED',
                errorMessage
              );
            }
          }
        }

        await db.updateSyncBatchStatus(
          batchId,
          apiFailedCount === 0 ? 'API_SUCCESS' : 'API_FAILED',
          ledgersXml.length,
          ledgersXml.length,
          apiSuccessCount,
          apiFailedCount > 0 ? `API failed for ${apiFailedCount} records` : undefined
        );

        // Check if we should continue (if we got less than batch size, we're done)
        if (ledgersXml.length < TALLY_BATCH_SIZE) {
          hasMoreBatches = false;
        }

      } catch (error: any) {
        await db.updateSyncBatchStatus(batchId, 'API_FAILED', 0, 0, 0, error.message);
        db.log('ERROR', `Customer batch ${batchNumber} failed`, { error: error.message });
        // Continue with next batch even if this one failed
        if (ledgersXml?.length < TALLY_BATCH_SIZE) {
          hasMoreBatches = false;
        }
      }
    }
    } // End of incremental sync else block

    const status = failedCount === 0 ? 'SUCCESS' : (successCount > 0 ? 'PARTIAL' : 'FAILED');
    const summary = { success: successCount, failed: failedCount };

    if (successCount > 0 || newMaxAlterId !== '0') {
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