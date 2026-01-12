// src/services/sync/send-to-platfrom/organization.service.ts

import axios from 'axios';
import { DatabaseService, UserProfile } from '../../database/database.service';
import { getApiUrl } from '../../config/api-url-helper';

const API_KEY = '7061797A6F72726F74616C6C79';
const ENTITY_TYPE = 'ORGANIZATION';

export class OrganizationService {
  private dbService: DatabaseService;

  constructor(dbService: DatabaseService) {
    this.dbService = dbService;
  }

  async syncOrganization(profile: UserProfile, currentCompany: Record<string, any>): Promise<void> {
    const runId = await this.dbService.logSyncStart('BACKGROUND', ENTITY_TYPE);

    try {
      this.dbService.log('INFO', 'Starting organization sync', { biller_id: profile.biller_id });

      if (!currentCompany || !currentCompany.NAME) {
        throw new Error('No valid company data retrieved from Tally');
      }

      // Extract BILLER data (new format from ZeroFinnCmp report)
      const billerData = currentCompany.BILLER_DATA || currentCompany;
      
      const name = (billerData.NAME || currentCompany.NAME || '').trim();
      const organizationId = (billerData.ORGANIZATION_ID || currentCompany.COMPANYNUMBER || '').trim();
      const tallyId = (billerData.TALLY_ID || currentCompany.BASICCOMPANYFORMALNAME || currentCompany.NAME || 'TALLY_CO').trim();
      const address = (billerData.ADDRESS || currentCompany.ADDRESS || '').trim();
      const state = (billerData.STATE || currentCompany.STATENAME || '').trim();
      const country = (billerData.COUNTRY || currentCompany.COUNTRYNAME || 'India').trim();
      const pin = (billerData.PIN || currentCompany.PINCODE || '').trim();
      
      // Get trn from BILLER data, fallback to existing organization data
      let trn = (billerData.VATNUMBER || currentCompany.VATNUMBER || currentCompany.GSTREGISTRATIONNUMBER || currentCompany.INCOMETAXNUMBER || '').trim();
      
      // If trn is empty, try to get it from existing organization data
      if (!trn || trn === '') {
        const existingOrg = profile?.organization;
        // Check response.trn first
        if (existingOrg?.response?.trn) {
          trn = String(existingOrg.response.trn).trim();
        }
        // Also check if organization_data has trn
        if ((!trn || trn === '') && existingOrg?.organization_data) {
          try {
            const orgData = typeof existingOrg.organization_data === 'string' 
              ? JSON.parse(existingOrg.organization_data) 
              : existingOrg.organization_data;
            if (orgData?.trn) {
              trn = String(orgData.trn).trim();
            }
            // Check nested response.trn in organization_data
            if ((!trn || trn === '') && orgData?.response?.trn) {
              trn = String(orgData.response.trn).trim();
            }
          } catch (e) {
            // Ignore JSON parse errors
          }
        }
      }
      
      // If trn is still empty, log warning and use default value
      if (!trn || trn === '') {
        this.dbService.log('WARN', 'TRN (VATNUMBER) not found in Tally data, using default value', {
          biller_id: profile.biller_id,
          organization_id: organizationId,
          tally_id: tallyId
        });
        trn = '3643527478238'; // Default value when VATNUMBER is not available
      }
      
      // Get gstin from BILLER data, fallback to existing organization data
      let gstin = (billerData.GSTIN || currentCompany.GSTREGISTRATIONNUMBER || '').trim();
      
      // If gstin is empty, try to get it from existing organization data
      if (!gstin || gstin === '') {
        const existingOrg = profile?.organization;
        // Check response.gstin first
        if (existingOrg?.response?.gstin) {
          gstin = String(existingOrg.response.gstin).trim();
        }
        // Also check if organization_data has gstin
        if ((!gstin || gstin === '') && existingOrg?.organization_data) {
          try {
            const orgData = typeof existingOrg.organization_data === 'string' 
              ? JSON.parse(existingOrg.organization_data) 
              : existingOrg.organization_data;
            if (orgData?.gstin) {
              gstin = String(orgData.gstin).trim();
            }
            // Check nested response.gstin in organization_data
            if ((!gstin || gstin === '') && orgData?.response?.gstin) {
              gstin = String(orgData.response.gstin).trim();
            }
          } catch (e) {
            // Ignore JSON parse errors
          }
        }
      }
      
      // If gstin is still empty, it's optional so we can leave it empty
      // (unlike trn which is required by API)

      // Build payload - API requires trn to not be empty
      const billerPayload: any = {
        biller_id: profile.biller_id,
        name: name,
        organization_id: organizationId,
        tally_id: tallyId,
        address: address,
        state: state || 'Haryana',
        country: country || 'India',
        pin: pin,
        trn: trn, // Will have value from above (either from data or default)
        gstin: gstin
      };

      console.log('Organization payload:', billerPayload);

      const payload = {
        biller: [billerPayload]
      };

      this.dbService.log('INFO', 'Sending organization payload to API', { payload });

      const baseUrl = await getApiUrl(this.dbService);
      const response = await axios.post(`${baseUrl}/billers/tally/set-organization`, payload, {
        headers: { 
          'API-KEY': API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      });

      this.dbService.log('INFO', 'Organization API response', {
        status: response.status,
        data: response.data
      });

      await this.dbService.updateOrganization(profile.email, {
        name: tallyId,
        organization_id: organizationId,
        synced_at: new Date().toISOString()
      });

      // Log individual organization record
      await this.dbService.logSyncRecordDetail(
        runId,
        organizationId || profile.biller_id || 'unknown',
        tallyId,
        'ORGANIZATION',
        'SUCCESS',
        null
      );

      await this.dbService.logSyncEnd(runId, 'SUCCESS', 1, 0, undefined, 'Organization synced successfully');
      this.dbService.log('INFO', 'Organization synced successfully', {
        tallyId,
        organizationId,
        companyName: name,
        api_status: response.data.status || 'OK'
      });

      await this.dbService.updateLastSuccessfulSync();

    } catch (error: any) {
      const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
      const statusCode = error.response?.status;

      this.dbService.log('ERROR', 'Organization sync failed', {
        error: errorMsg,
        statusCode,
        stack: error.stack
      });

      // Log failed organization record
      const billerData = currentCompany?.BILLER_DATA || currentCompany;
      const tallyId = billerData?.TALLY_ID || currentCompany?.BASICCOMPANYFORMALNAME || currentCompany?.NAME || 'TALLY_CO';
      const organizationId = billerData?.ORGANIZATION_ID || currentCompany?.COMPANYNUMBER || profile.biller_id || 'unknown';
      await this.dbService.logSyncRecordDetail(
        runId,
        organizationId,
        tallyId,
        'ORGANIZATION',
        'FAILED',
        errorMsg
      );

      await this.dbService.logSyncEnd(runId, 'FAILED', 0, 1, undefined, errorMsg);
      throw error;
    }
  }
}