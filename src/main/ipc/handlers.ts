// src/main/ipc/handlers.ts
import { ipcMain } from 'electron';
import axios from 'axios';
import { DatabaseService } from '../../services/database/database.service';
import { SyncService } from '../../services/sync/sync.service';
import { OrganizationService } from '../../services/sync/send-to-platfrom/organization.service';
import { CompanyRepository } from '../../services/database/repositories/company.repository';
import { fetchCompanies } from '../../services/sync/fetch-to-tally/fetchCompanies';
import { getApiUrl } from '../../services/config/api-url-helper';
import { getDashboardWindow, createDashboardWindow } from '../windows/dashboard.window';
import { closeCompanySelectorWindow } from '../windows/company-selector.window';
import { createTrayAndStartSync, destroyTray } from '../windows/tray.window';
import { app } from 'electron';

export function setupIpcHandlers(
  dbService: DatabaseService,
  syncService: SyncService,
  organizationService: OrganizationService,
  companyRepository: CompanyRepository
): void {
  // Login handler
  ipcMain.handle('login', async (event, credentials: { email: string; password: string }) => {
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
        const apiKey = profile.apikey || '7061797A6F72726F74616C6C79';
        
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
      app.setLoginItemSettings({ openAtLogin: true });
      
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
      return await dbService.getDashboardStats();
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
    return await dbService.getSetting(key);
  });

  ipcMain.handle('set-setting', async (event, key: string, value: string) => {
    await dbService.setSetting(key, value);
    return { success: true };
  });

  ipcMain.handle('get-all-settings', async () => {
    return await dbService.getAllSettings();
  });

  // Data handlers (for Customers, Invoices, Payments pages)
  ipcMain.handle('get-customers', async (event, limit?: number, offset?: number, search?: string) => {
    return await dbService.getCustomers(limit, offset, search);
  });

  ipcMain.handle('get-vouchers', async (event, limit?: number, offset?: number, search?: string, voucherType?: string) => {
    return await dbService.getVouchers(limit, offset, search, voucherType);
  });

  // API Logs handlers
  ipcMain.handle('get-api-logs', async (event, filters?: any) => {
    return await dbService.getApiLogs(filters);
  });

  // Tally Voucher Logs handlers
  ipcMain.handle('get-tally-voucher-logs', async (event, filters?: any) => {
    return await dbService.getTallyVoucherLogs(filters);
  });
}
