// src/services/sync.service.ts

import * as odbc from 'odbc';
import axios from 'axios';
import { DatabaseService, UserProfile } from '../../database/database.service';
const BASE_URL = 'http://localhost:3000';
const API_KEY = '7061797A6F72726F74616C6C79';
const BATCH_SIZE = 20;

export class OrganizationService {
  private dbService: DatabaseService;
  constructor(dbService: DatabaseService) {
    this.dbService = dbService;
  }
  
    async syncOrganization(profile: UserProfile, currentCompany: Record<string, any>): Promise<void> {
        const runId = await this.dbService.logSyncStart('BACKGROUND', 'ORGANIZATION');
        try {
            console.log('Syncing organization for profile:', profile);
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

            console.log('payload==>', payload)

            const response = await axios.post(`${BASE_URL}/billers/tally/set-organization`, payload, {
                headers: { 'API-KEY': API_KEY }
            });

            console.log('Organization sync response:', response.data.data);

            await this.dbService.updateOrganization(profile.email, {
                name: tallyId,
                organization_id: organizationId,
                synced_at: new Date().toISOString()
            });

            await this.dbService.logSyncEnd(runId, 'SUCCESS', 1);
            this.dbService.log('INFO', 'Organization synced successfully', {
                tallyId,
                organizationId,
                companyName: currentCompany.NAME,
                status: response.data.status
            });
        } catch (e: any) {
            await this.dbService.logSyncEnd(runId, 'FAILED', 0, undefined, e.message);
            this.dbService.log('ERROR', 'Organization sync failed', e);
            throw e;
        }
    }
}