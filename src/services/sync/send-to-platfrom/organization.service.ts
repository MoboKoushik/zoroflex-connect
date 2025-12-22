// src/services/sync/send-to-platfrom/organization.service.ts

import axios from 'axios';
import { DatabaseService, UserProfile } from '../../database/database.service';

const BASE_URL = 'https://uatarmapi.a10s.in';
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

      const tallyId = (currentCompany.BASICCOMPANYFORMALNAME || currentCompany.NAME || 'TALLY_CO').trim();
      const organizationId = (currentCompany.COMPANYNUMBER || '').trim();
      const trn = (currentCompany.GSTREGISTRATIONNUMBER || currentCompany.INCOMETAXNUMBER || '').trim();

      const payload = {
        biller: [{
          biller_id: profile.biller_id,
          organization_id: organizationId,
          tally_id: tallyId,
          state: currentCompany.STATENAME || 'Haryana',
          country: currentCompany.COUNTRYNAME || 'India',
          trn: trn || '75634959458'
        }]
      };

      this.dbService.log('INFO', 'Sending organization payload to API', { payload });

      const response = await axios.post(`${BASE_URL}/billers/tally/set-organization`, payload, {
        headers: { 'API-KEY': API_KEY },
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

      await this.dbService.logSyncEnd(runId, 'SUCCESS', 1, 0, undefined, 'Organization synced successfully');
      this.dbService.log('INFO', 'Organization synced successfully', {
        tallyId,
        organizationId,
        companyName: currentCompany.NAME,
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

      await this.dbService.logSyncEnd(runId, 'FAILED', 0, 1, undefined, errorMsg);
      throw error;
    }
  }
}