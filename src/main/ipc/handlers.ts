// src/main/ipc/handlers.ts
import { ipcMain } from 'electron';
import axios from 'axios';
import { DatabaseService } from '../../services/database/database.service';
import { SyncService } from '../../services/sync/sync.service';
import { OrganizationService } from '../../services/sync/send-to-platfrom/organization.service';
import { CompanyRepository } from '../../services/database/repositories/company.repository';
import { fetchCompanies } from '../../services/sync/fetch-to-tally/fetchCompanies';
import { getApiUrl } from '../../services/config/api-url-helper';
import { getAppApiKey } from '../../config/app-config';
import { getTallyUrl } from '../../services/config/tally-url-helper';
import { setTallyUrl } from '../../services/tally/batch-fetcher';
import { getDashboardWindow, createDashboardWindow } from '../windows/dashboard.window';
import { closeCompanySelectorWindow } from '../windows/company-selector.window';
import { createTrayAndStartSync, destroyTray } from '../windows/tray.window';
import { app } from 'electron';
import {
  validateEmail,
  validatePassword,
  validatePositiveInteger,
  validateIntegerRange,
  validateSettingKey,
  validateSettingValue,
  validateSearchQuery,
  validateEnum,
  validateOptionalPositiveInteger,
  validateFilters
} from '../../utils/ipc-validators';

export function setupIpcHandlers(
  dbService: DatabaseService,
  syncService: SyncService,
  organizationService: OrganizationService,
  companyRepository: CompanyRepository
): void {
  // Login handler
  ipcMain.handle('login', async (event, credentials: { email: string; password: string }) => {
    // Validate input parameters
    const emailValidation = validateEmail(credentials?.email);
    if (!emailValidation.isValid) {
      return { success: false, message: emailValidation.error };
    }

    const passwordValidation = validatePassword(credentials?.password);
    if (!passwordValidation.isValid) {
      return { success: false, message: passwordValidation.error };
    }

    console.log('Login attempt:', credentials.email);

    try {
      const apiUrl = await getApiUrl(dbService);
      const { data } = await axios.post(`${apiUrl}/billers/tally/login`, credentials, {
        timeout: 15000,
      });

      if (data.success) {
        const { token, biller_id, apikey, organization } = data;
        await dbService.saveProfile(credentials.email, token, biller_id, apikey, organization);
        console.log('Profile saved successfully, sending login-success event');
        // Send login-success event to trigger navigation
        event.sender.send('login-success');
        return { success: true };
      } else {
        return { success: false, message: data.message || 'Login failed' };
      }
    } catch (error: any) {
      console.error('Login error:', error.message);
      return {
        success: false,
        message: error.response?.data?.message || 'Server not reachable',
      };
    }
  });

  // Company handlers
  ipcMain.handle('fetch-companies', async (event) => {
    try {
      const profile = await dbService.getProfile();
      if (!profile || !profile.biller_id) {
        return { success: false, error: 'No profile or biller_id found' };
      }

      // Initialize Tally URL from settings (supports both HTTP and HTTPS)
      console.log('[fetch-companies] Getting Tally URL from settings...');
      const tallyUrl = await getTallyUrl(dbService);
      console.log('[fetch-companies] Got Tally URL:', tallyUrl);
      setTallyUrl(tallyUrl);
      console.log('[fetch-companies] Set TALLY_URL to:', tallyUrl);
      dbService.log('INFO', `Tally URL initialized for fetch-companies: ${tallyUrl}`);

      const companies = await fetchCompanies(dbService);
      const filteredCompanies = companies.filter(c => c.biller_id === profile.biller_id);
      
      // Save companies to database
      for (const companyData of filteredCompanies) {
        await companyRepository.upsertCompany(companyData);
      }

      const savedCompanies = companyRepository.getAllCompanies(profile.biller_id);
      
      // Check for matching company by organization_id or name
      const profileOrgId = (profile?.organization?.response?.organization_id || '').toString().trim();
      const profileOrgName = (profile?.organization?.response?.name || 
                           profile?.organization?.organization_data?.name || '').toString().trim();
      
      let autoSelectedCompanyId: number | null = null;
      
      // Try to match by organization_id first
      if (profileOrgId) {
        const matched = savedCompanies.find(c => 
          c.organization_id && c.organization_id.trim() === profileOrgId
        );
        if (matched) {
          autoSelectedCompanyId = matched.id;
        }
      }
      
      // If no match by organization_id, try by name
      if (!autoSelectedCompanyId && profileOrgName) {
        const matched = savedCompanies.find(c => 
          c.name && c.name.trim().toLowerCase() === profileOrgName.toLowerCase()
        );
        if (matched) {
          autoSelectedCompanyId = matched.id;
        }
      }
      
      return { 
        success: true, 
        companies: savedCompanies,
        autoSelectedCompanyId: autoSelectedCompanyId || undefined
      };
    } catch (error: any) {
      console.error('Error fetching companies:', error);
      return { success: false, error: error.message || 'Failed to fetch companies' };
    }
  });

  ipcMain.handle('select-company', async (event, companyId: number) => {
    // Validate company ID
    const companyIdValidation = validatePositiveInteger(companyId, 'Company ID');
    if (!companyIdValidation.isValid) {
      return { success: false, error: companyIdValidation.error };
    }

    try {
      const profile = await dbService.getProfile();
      if (!profile || !profile.biller_id) {
        return { success: false, error: 'No profile found' };
      }

      const company = companyRepository.getCompanyById(companyId);
      if (!company) {
        return { success: false, error: 'Company not found' };
      }

      // Set company as active (don't send to backend yet - wait for Continue button)
      companyRepository.setActiveCompany(companyId, profile.biller_id);

      dbService.log('INFO', 'Company selected and set as active', {
        company_id: companyId,
        company_name: company.name
      });

      return { success: true };
    } catch (error: any) {
      console.error('Error selecting company:', error);
      return { success: false, error: error.message || 'Failed to select company' };
    }
  });

  ipcMain.handle('continue-to-dashboard', async (event) => {
    try {
      const profile = await dbService.getProfile();
      if (!profile || !profile.biller_id) {
        return { success: false, error: 'No profile found' };
      }

      // Verify active company exists
      const activeCompany = companyRepository.getActiveCompany(profile.biller_id);
      if (!activeCompany) {
        return { success: false, error: 'No active company selected' };
      }

      // Send company data to backend before continuing
      try {
        const apiUrl = await getApiUrl(dbService);
        const apiKey = getAppApiKey();
        
        await axios.post(
          `${apiUrl}/billers/tally/set-organization`,
          {
            biller: [{
              biller_id: activeCompany.biller_id,
              name: activeCompany.name,
              organization_id: activeCompany.organization_id,
              tally_id: activeCompany.tally_id,
              address: activeCompany.address || '',
              state: activeCompany.state || '',
              country: activeCompany.country || 'India',
              pin: activeCompany.pin || '',
              trn: activeCompany.trn || '',
              gstin: activeCompany.gstin || ''
            }]
          },
          {
            headers: {
              'API-KEY': apiKey,
              'Content-Type': 'application/json'
            },
            timeout: 15000
          }
        );

        dbService.log('INFO', 'Company data sent to backend successfully', {
          company_id: activeCompany.id,
          company_name: activeCompany.name
        });
      } catch (error: any) {
        console.error('Error sending company to backend:', error);
        dbService.log('ERROR', 'Failed to send company data to backend', {
          error: error.message,
          company_id: activeCompany.id
        });
        // Continue anyway - backend sync will retry
      }

      // Start background sync and create tray
      // Note: auto-start is managed by applyAutoStartSettings() in main.ts based on user's Settings preference

      // Destroy existing tray if any
      destroyTray();
      
      // Create tray and start background sync
      await createTrayAndStartSync(profile, syncService, dbService);
      
      // Open dashboard window
      createDashboardWindow(profile);
      
      // Close company selector window
      closeCompanySelectorWindow();

      return { success: true };
    } catch (error: any) {
      console.error('Error continuing to dashboard:', error);
      return { success: false, error: error.message || 'Failed to continue to dashboard' };
    }
  });

  ipcMain.handle('get-active-company', async () => {
    try {
      const profile = await dbService.getProfile();
      if (!profile || !profile.biller_id) {
        return null;
      }
      return companyRepository.getActiveCompany(profile.biller_id);
    } catch (error: any) {
      console.error('Error getting active company:', error);
      return null;
    }
  });

  ipcMain.handle('get-all-companies', async () => {
    try {
      const profile = await dbService.getProfile();
      if (!profile || !profile.biller_id) {
        return [];
      }
      return companyRepository.getAllCompanies(profile.biller_id);
    } catch (error: any) {
      console.error('Error getting all companies:', error);
      return [];
    }
  });

  // Sync handlers
  ipcMain.handle('manual-sync', async (event, syncType: 'full' | 'fresh' = 'full') => {
    // Validate sync type
    const syncTypeValidation = validateEnum(syncType, ['full', 'fresh'], 'Sync type');
    if (!syncTypeValidation.isValid) {
      return { success: false, error: syncTypeValidation.error };
    }

    try {
      const profile = await dbService.getProfile();
      if (!profile) {
        return { success: false, error: 'No profile found' };
      }
      
      const dashboardWindow = getDashboardWindow();
      if (dashboardWindow && !dashboardWindow.isDestroyed()) {
        try {
          dashboardWindow.webContents.send('sync-started', { syncType });
        } catch (err) {
          console.error('Error sending sync-started event:', err);
        }
      }
      
      if (syncType === 'full') {
        await syncService.forceFullSync(profile);
      } else {
        await syncService.forceFreshSync(profile);
      }
      
      if (dashboardWindow && !dashboardWindow.isDestroyed()) {
        try {
          dashboardWindow.webContents.send('sync-completed');
        } catch (err) {
          console.error('Error sending sync-completed event:', err);
        }
      }
      return { success: true };
    } catch (error: any) {
      console.error('Manual sync error:', error);
      const dashboardWindow = getDashboardWindow();
      if (dashboardWindow && !dashboardWindow.isDestroyed()) {
        try {
          dashboardWindow.webContents.send('sync-completed', { error: error.message });
        } catch (err) {
          console.error('Error sending sync-completed event:', err);
        }
      }
      return { success: false, error: error.message || 'Sync failed' };
    }
  });

  ipcMain.handle('force-full-sync', async (event) => {
    try {
      const profile = await dbService.getProfile();
      if (!profile) {
        return { success: false, error: 'No profile found' };
      }
      await syncService.forceFullSync(profile);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Sync failed' };
    }
  });

  ipcMain.handle('force-fresh-sync', async (event) => {
    try {
      const profile = await dbService.getProfile();
      if (!profile) {
        return { success: false, error: 'No profile found' };
      }
      await syncService.forceFreshSync(profile);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Sync failed' };
    }
  });

  // Profile handlers
  ipcMain.handle('get-profile', async () => {
    try {
      const profile = await dbService.getProfile();
      return profile;
    } catch (error: any) {
      console.error('Error getting profile:', error);
      return null;
    }
  });

  ipcMain.handle('logout', async () => {
    syncService.stop();
    await dbService.logoutAndClearProfile();
    return { success: true };
  });

  // Dashboard data handlers
  ipcMain.handle('get-dashboard-stats', async () => {
    try {
      const profile = await dbService.getProfile();
      const billerId = profile?.biller_id;
      return await dbService.getDashboardStats(billerId);
    } catch (error: any) {
      console.error('get-dashboard-stats error:', error);
      return {
        totalCustomers: 0,
        totalVouchers: 0,
        invoiceCount: 0,
        receiptCount: 0,
        jvCount: 0,
        lastSyncTime: null
      };
    }
  });

  ipcMain.handle('get-sync-history', async () => {
    return await dbService.getSyncHistory();
  });

  ipcMain.handle('get-logs', async () => {
    return await dbService.getLogs();
  });

  ipcMain.handle('get-last-sync', async () => {
    return await dbService.getLastSync();
  });

  ipcMain.handle('get-recent-sync-logs', async (event, limit: number = 20) => {
    // Validate limit parameter
    const limitValidation = validateIntegerRange(limit, 1, 1000, 'Limit');
    if (!limitValidation.isValid) {
      console.error('Invalid limit parameter:', limitValidation.error);
      return [];
    }

    try {
      const profile = await dbService.getProfile();
      if (!profile || !profile.biller_id) {
        return [];
      }
      const activeCompany = companyRepository.getActiveCompany(profile.biller_id);
      if (!activeCompany) {
        return [];
      }
      return await dbService.getRecentSyncLogs(limit);
    } catch (error: any) {
      console.error('Error getting recent sync logs:', error);
      return [];
    }
  });

  // Window control handlers
  ipcMain.handle('window-minimize', () => {
    try {
      const dashboardWindow = getDashboardWindow();
      if (dashboardWindow && !dashboardWindow.isDestroyed()) {
        dashboardWindow.minimize();
        return { success: true };
      }
      return { success: false, error: 'Window not available' };
    } catch (error: any) {
      console.error('Error minimizing window:', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  });

  ipcMain.handle('window-maximize', () => {
    try {
      const dashboardWindow = getDashboardWindow();
      if (dashboardWindow && !dashboardWindow.isDestroyed()) {
        if (dashboardWindow.isMaximized()) {
          dashboardWindow.unmaximize();
        } else {
          dashboardWindow.maximize();
        }
        return { success: true };
      }
      return { success: false, error: 'Window not available' };
    } catch (error: any) {
      console.error('Error maximizing window:', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  });

  ipcMain.handle('window-close', () => {
    try {
      const dashboardWindow = getDashboardWindow();
      if (dashboardWindow && !dashboardWindow.isDestroyed()) {
        dashboardWindow.close();
        return { success: true };
      }
      return { success: false, error: 'Window not available' };
    } catch (error: any) {
      console.error('Error closing window:', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  });

  ipcMain.handle('window-is-maximized', () => {
    try {
      const dashboardWindow = getDashboardWindow();
      if (dashboardWindow && !dashboardWindow.isDestroyed()) {
        return dashboardWindow.isMaximized();
      }
      return false;
    } catch (error: any) {
      console.error('Error checking window maximize state:', error);
      return false;
    }
  });

  // Settings handlers
  ipcMain.handle('get-setting', async (event, key: string) => {
    // Validate setting key
    const keyValidation = validateSettingKey(key);
    if (!keyValidation.isValid) {
      console.error('Invalid setting key:', keyValidation.error);
      return null;
    }

    return await dbService.getSetting(key);
  });

  ipcMain.handle('set-setting', async (event, key: string, value: string) => {
    // Validate setting key and value
    const keyValidation = validateSettingKey(key);
    if (!keyValidation.isValid) {
      return { success: false, error: keyValidation.error };
    }

    const valueValidation = validateSettingValue(value);
    if (!valueValidation.isValid) {
      return { success: false, error: valueValidation.error };
    }

    await dbService.setSetting(key, value);
    return { success: true };
  });

  ipcMain.handle('get-all-settings', async () => {
    return await dbService.getAllSettings();
  });

  // Data handlers (for Customers, Invoices, Payments pages)
  ipcMain.handle('get-customers', async (event, limit?: number, offset?: number, search?: string) => {
    // Validate optional parameters
    const limitValidation = validateOptionalPositiveInteger(limit, 'Limit');
    if (!limitValidation.isValid) {
      console.error('Invalid limit parameter:', limitValidation.error);
      return { customers: [], total: 0 };
    }

    const offsetValidation = validateOptionalPositiveInteger(offset, 'Offset');
    if (!offsetValidation.isValid) {
      console.error('Invalid offset parameter:', offsetValidation.error);
      return { customers: [], total: 0 };
    }

    const searchValidation = validateSearchQuery(search);
    if (!searchValidation.isValid) {
      console.error('Invalid search parameter:', searchValidation.error);
      return { customers: [], total: 0 };
    }

    // Get biller_id from profile to ensure org isolation
    const profile = await dbService.getProfile();
    const billerId = profile?.biller_id;

    return await dbService.getCustomers(limit, offset, search, billerId);
  });

  ipcMain.handle('get-vouchers', async (event, limit?: number, offset?: number, search?: string, voucherType?: string) => {
    // Validate optional parameters
    const limitValidation = validateOptionalPositiveInteger(limit, 'Limit');
    if (!limitValidation.isValid) {
      console.error('Invalid limit parameter:', limitValidation.error);
      return { vouchers: [], total: 0 };
    }

    const offsetValidation = validateOptionalPositiveInteger(offset, 'Offset');
    if (!offsetValidation.isValid) {
      console.error('Invalid offset parameter:', offsetValidation.error);
      return { vouchers: [], total: 0 };
    }

    const searchValidation = validateSearchQuery(search);
    if (!searchValidation.isValid) {
      console.error('Invalid search parameter:', searchValidation.error);
      return { vouchers: [], total: 0 };
    }

    if (voucherType !== undefined) {
      const voucherTypeValidation = validateSearchQuery(voucherType);
      if (!voucherTypeValidation.isValid) {
        console.error('Invalid voucherType parameter:', voucherTypeValidation.error);
        return { vouchers: [], total: 0 };
      }
    }

    // Get biller_id from profile to ensure org isolation
    const profile = await dbService.getProfile();
    const billerId = profile?.biller_id;

    return await dbService.getVouchers(limit, offset, search, voucherType, billerId);
  });

  // API Logs handlers
  ipcMain.handle('get-api-logs', async (event, filters?: any) => {
    // Validate filters parameter
    const filtersValidation = validateFilters(filters);
    if (!filtersValidation.isValid) {
      console.error('Invalid filters parameter:', filtersValidation.error);
      return [];
    }

    return await dbService.getApiLogs(filters);
  });

  // Tally Voucher Logs handlers
  ipcMain.handle('get-tally-voucher-logs', async (event, filters?: any) => {
    // Validate filters parameter
    const filtersValidation = validateFilters(filters);
    if (!filtersValidation.isValid) {
      console.error('Invalid filters parameter:', filtersValidation.error);
      return [];
    }

    return await dbService.getTallyVoucherLogs(filters);
  });

  // Log Rotation handlers
  ipcMain.handle('rotate-logs', async (event, retentionDays?: number) => {
    try {
      // Validate retention days parameter
      if (retentionDays !== undefined) {
        const retentionValidation = validateIntegerRange(retentionDays, 1, 365, 'Retention days');
        if (!retentionValidation.isValid) {
          return { success: false, error: retentionValidation.error };
        }
      }

      const stats = await dbService.rotateAllLogs(retentionDays || 30);
      return { success: true, stats };
    } catch (error: any) {
      console.error('Error rotating logs:', error);
      return { success: false, error: error.message || 'Failed to rotate logs' };
    }
  });

  ipcMain.handle('limit-log-size', async (event, maxEntries?: number) => {
    try {
      // Validate max entries parameter
      if (maxEntries !== undefined) {
        const maxEntriesValidation = validateIntegerRange(maxEntries, 100, 100000, 'Max entries');
        if (!maxEntriesValidation.isValid) {
          return { success: false, error: maxEntriesValidation.error };
        }
      }

      const stats = await dbService.limitLogSize(maxEntries || 10000);
      return { success: true, stats };
    } catch (error: any) {
      console.error('Error limiting log size:', error);
      return { success: false, error: error.message || 'Failed to limit log size' };
    }
  });

  ipcMain.handle('get-log-statistics', async () => {
    try {
      return await dbService.getLogStatistics();
    } catch (error: any) {
      console.error('Error getting log statistics:', error);
      return {
        logsCount: 0,
        apiLogsCount: 0,
        tallyVoucherLogsCount: 0,
        tallySyncLogsCount: 0,
        syncLogsCount: 0,
        oldestLog: null,
        newestLog: null
      };
    }
  });
}
