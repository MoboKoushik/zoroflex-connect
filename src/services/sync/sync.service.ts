import { DatabaseService, UserProfile } from '../../services/database/database.service';
import { fetchCurrentCompany } from './fetch-to-tally/fetchCurrentCompany';
import { OrganizationService } from './send-to-platfrom/organization.service';
import { syncCustomers } from './fetch-to-tally/fetchLedgers';
import { syncVouchers } from './fetch-to-tally/fetchVouchers';

export class SyncService {
  private dbService: DatabaseService;
  private organizationService: OrganizationService;
  private isRunning = false;

  constructor(dbService: DatabaseService, organizationService: OrganizationService) {
    this.dbService = dbService;
    this.organizationService = organizationService;
  }

  private async fullSync(profile: UserProfile, type: 'MANUAL' | 'BACKGROUND' = 'BACKGROUND'): Promise<void> {
    if (this.isRunning) {
      this.dbService.log('WARN', 'Sync already in progress; skipping this run');
      return;
    }

    this.isRunning = true;

    try {
      this.dbService.log('INFO', `${type} sync initiated`);

      // Fetch current company data from Tally
      const companyData = await fetchCurrentCompany();
      if (!companyData) {
        this.dbService.log('ERROR', 'No company data received from Tally');
        throw new Error('Please select your company in Tally Prime software');
      }

      // Get updated profile with organization data
      const prof = await this.dbService.getProfile();

      
      // Validate organization ID matches COMPANYNUMBER if both exist
      const profileOrganizationId = prof?.organization?.response?.organization_id?.trim() || '';
      const tallyCompanyNumber = (companyData.COMPANYNUMBER || '').trim();

      // If organization_id exists in profile, it must match COMPANYNUMBER from Tally
      if (profileOrganizationId && tallyCompanyNumber) {
        if (profileOrganizationId !== tallyCompanyNumber) {
          const errorMessage = 'Please select your company in Tally Prime software';
          this.dbService.log('ERROR', errorMessage, {
            profile_organization_id: profileOrganizationId,
            tally_company_number: tallyCompanyNumber
          });
          throw new Error(errorMessage);
        }
      } else if (profileOrganizationId && !tallyCompanyNumber) {
        // If profile has organization_id but Tally doesn't have COMPANYNUMBER
        const errorMessage = 'Please select your company in Tally Prime software';
        this.dbService.log('ERROR', errorMessage, {
          profile_organization_id: profileOrganizationId,
          tally_company_number: 'missing'
        });
        throw new Error(errorMessage);
      }

      // Sync organization if needed (first time or manual sync)
      if (type === 'MANUAL' || !prof?.organization?.synced_at) {
        this.dbService.log('INFO', 'Syncing organization data');
        await this.organizationService.syncOrganization(profile, companyData);
      }

      // Sync customers and vouchers using the working functions
      this.dbService.log('INFO', 'Starting customer sync');
      await syncCustomers(profile);
      
      this.dbService.log('INFO', 'Starting voucher sync');
      await syncVouchers(profile);


      await this.dbService.updateLastSuccessfulSync();
      this.dbService.log('INFO', `${type} sync completed successfully`);

    } catch (error: any) {
      this.dbService.log('ERROR', `${type} sync failed`, {
        error: error?.message || error
      });
    } finally {
      this.isRunning = false;
    }
  }


  async manualSync(profile: UserProfile): Promise<void> {
    this.dbService.log('INFO', 'Manual sync requested by user');
    await this.fullSync(profile, 'MANUAL');
  }


  startBackgroundSync(profile: UserProfile): void {
    this.dbService.log('INFO', 'Starting background sync (initial run + every 5 minutes)');
    this.fullSync(profile, 'BACKGROUND');

    setInterval(() => {
      this.fullSync(profile, 'BACKGROUND');
    }, 5 * 60 * 1000);
  }

  stop(): void {
    this.isRunning = false;
    this.dbService.log('INFO', 'Background sync stopped');
  }
}