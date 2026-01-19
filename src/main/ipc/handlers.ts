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
import { BookManagerService } from '../../services/book-management/book-manager.service';
import { fetchBooksFromApi } from '../../services/api/fetch-books-from-api.service';
import { createBookSelectorWindow, closeBookSelectorWindow } from '../windows/book-selector.window';
import { createBookLoginWindow, closeBookLoginWindow } from '../windows/book-login.window';
import { fetchAllStagingStatus } from '../../services/api/staging-status.service';

// Global references (will be set from main.ts)
let globalLoginWindow: any = null;
let globalApplyAutoStartSettings: (() => Promise<void>) | null = null;

export function setGlobalReferences(loginWindow: any, applyAutoStartSettingsFn: () => Promise<void>) {
  globalLoginWindow = loginWindow;
  globalApplyAutoStartSettings = applyAutoStartSettingsFn;
}

export function setupIpcHandlers(
  dbService: DatabaseService,
  syncService: SyncService,
  organizationService: OrganizationService,
  companyRepository: CompanyRepository,
  bookManagerService?: BookManagerService
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
        console.log('Profile saved successfully');
        
        // ✅ Only send login-success event if this is from a login window (not from modal)
        // Check if sender is login window by checking webContents URL
        const senderUrl = event.sender.getURL();
        const isFromLoginWindow = senderUrl.includes('login') || senderUrl.includes('login.html');
        
        if (isFromLoginWindow) {
          console.log('Login from login window, sending login-success event');
          event.sender.send('login-success');
        } else {
          console.log('Login from modal/dashboard, skipping login-success event (modal handles its own flow)');
        }
        
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

  // ✅ Book Management handlers
  if (bookManagerService) {
    // Get all books for a biller
    ipcMain.handle('get-all-books', async (event) => {
      try {
        if (!bookManagerService) {
          return { success: false, error: 'BookManagerService not initialized' };
        }
        const profile = await dbService.getProfile();
        if (!profile?.biller_id) {
          return { success: false, error: 'No profile or biller_id found' };
        }
        const books = await bookManagerService.getAllBooks(profile.biller_id);
        return { success: true, books };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // ✅ Get active books
    ipcMain.handle('get-active-books', async (event) => {
      try {
        if (!bookManagerService) {
          return { success: false, error: 'BookManagerService not initialized' };
        }
        const profile = await dbService.getProfile();
        if (!profile?.biller_id) {
          return { success: false, error: 'No profile or biller_id found' };
        }
        const allBooks = await bookManagerService.getAllBooks(profile.biller_id);
        const activeBooks = allBooks.filter((b: any) => b.is_active === 1);
        return { success: true, books: activeBooks };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Add a new book
    ipcMain.handle('add-book', async (event, bookData: {
      organization_id: string;
      tally_id: string;
      name: string;
      tally_username: string;
      tally_password: string;
      gstin?: string;
      address?: string;
      state?: string;
      country?: string;
      pin?: string;
      trn?: string;
      book_start_from?: string;
      auto_sync_enabled?: boolean;
      sync_interval_minutes?: number;
    }) => {
      try {
        if (!bookManagerService) {
          return { success: false, error: 'BookManagerService not initialized' };
        }
        const profile = await dbService.getProfile();
        if (!profile?.biller_id) {
          return { success: false, error: 'No profile or biller_id found' };
        }
        const result = await bookManagerService.addBook(profile.biller_id, bookData);
        return result;
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Switch active book
    ipcMain.handle('switch-book', async (event, companyId: number, makeExclusive: boolean = false) => {
      try {
        if (!bookManagerService) {
          return { success: false, error: 'BookManagerService not initialized' };
        }
        await bookManagerService.switchActiveBook(companyId, makeExclusive);
        
        // ✅ Switch to this book's database
        const company = companyRepository.getCompanyById(companyId);
        if (company) {
          dbService.switchDatabaseForBook(company.biller_id, companyId);
          console.log(`Switched to book database: ${company.name} (ID: ${companyId})`);
          
          // Notify dashboard to reload data
          const dashboardWindow = getDashboardWindow();
          if (dashboardWindow && !dashboardWindow.isDestroyed()) {
            dashboardWindow.webContents.send('book-switched', { bookId: companyId });
          }
        }
        
        event.sender.send('active-book-changed', companyId); // Notify UI
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Sync a specific book
    ipcMain.handle('sync-book', async (event, companyId: number, type: 'MANUAL' | 'BACKGROUND' = 'MANUAL') => {
      try {
        if (!bookManagerService) {
          return { success: false, error: 'BookManagerService not initialized' };
        }
        await bookManagerService.syncBook(companyId, type);
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Remove a book
    ipcMain.handle('remove-book', async (event, companyId: number) => {
      try {
        if (!bookManagerService) {
          return { success: false, error: 'BookManagerService not initialized' };
        }
        await bookManagerService.removeBook(companyId);
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Update book credentials
    ipcMain.handle('update-book-credentials', async (event, companyId: number, credentials: {
      tally_username?: string;
      tally_password?: string;
    }) => {
      try {
        if (!bookManagerService) {
          return { success: false, error: 'BookManagerService not initialized' };
        }
        const company = await bookManagerService.updateBookCredentials(companyId, credentials);
        return { success: true, company };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Get book sync status
    ipcMain.handle('get-book-sync-status', async (event, companyId: number) => {
      try {
        if (!bookManagerService) {
          return { success: false, error: 'BookManagerService not initialized' };
        }
        const status = bookManagerService.getBookSyncStatus(companyId);
        if (!status) {
          return { success: false, error: 'Book not found' };
        }
        return { success: true, status };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // Test book connection
    ipcMain.handle('test-book-connection', async (event, companyId: number) => {
      try {
        if (!bookManagerService) {
          return { success: false, error: 'BookManagerService not initialized' };
        }
        const isConnected = await bookManagerService.testBookConnection(companyId);
        return { success: true, isConnected };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    // ✅ Fetch books from API (for book selector)
    ipcMain.handle('fetch-books-from-api', async (event) => {
      try {
        const profile = await dbService.getProfile();
        if (!profile?.biller_id || !profile?.apikey) {
          return { success: false, error: 'Profile or API key not found' };
        }

        const books = await fetchBooksFromApi(
          profile.biller_id,
          profile.apikey,
          dbService
        );

        return { success: true, books };
      } catch (error: any) {
        console.error('Error fetching books from API:', error);
        return { success: false, error: error.message || 'Failed to fetch books' };
      }
    });

    // ✅ Connect to selected book
    ipcMain.handle('connect-book', async (event, organizationId: string) => {
      try {
        const profile = await dbService.getProfile();
        if (!profile?.biller_id) {
          return { success: false, error: 'Profile not found' };
        }

        if (!bookManagerService) {
          bookManagerService = new BookManagerService(dbService, companyRepository);
        }

        // Check if book already exists locally
        const allBooks = await bookManagerService.getAllBooks(profile.biller_id);
        const existingBook = allBooks.find((b: any) => b.organization_id === organizationId);

        let book;
        if (existingBook) {
          // Book exists, just switch to it
          console.log('Book exists locally, switching to it:', existingBook.name);
          await bookManagerService.switchActiveBook(existingBook.id, false);
          book = existingBook;
        } else {
          // Book doesn't exist, need to create it
          // First, fetch book details from API to get name and other info
          const booksFromApi = await fetchBooksFromApi(
            profile.biller_id,
            profile.apikey || '7061797A6F72726F74616C6C79',
            dbService
          );
          
          const bookFromApi = booksFromApi.find((b: any) => b.organization_id === organizationId);
          
          if (!bookFromApi) {
            return { success: false, error: 'Book not found in API' };
          }

          // Create book entry (user will need to provide Tally credentials later)
          const orgData = bookFromApi.organization_data || {};
          const addBookResult = await bookManagerService.addBook(profile.biller_id, {
            organization_id: organizationId,
            tally_id: orgData.tally_id || organizationId,
            name: bookFromApi.name || orgData.company_name || orgData.name || organizationId,
            tally_username: '', // User needs to add credentials later
            tally_password: '', // User needs to add credentials later
            gstin: orgData.gstin,
            address: orgData.address,
            state: orgData.state,
            country: orgData.country || 'India',
            pin: orgData.pin,
            trn: orgData.trn || orgData.vat_number,
            book_start_from: new Date().toISOString().split('T')[0],
            auto_sync_enabled: false
          });

          if (!addBookResult.success || !addBookResult.company) {
            return { success: false, error: addBookResult.error || 'Failed to create book' };
          }

          book = addBookResult.company;

          // Set as active
          await bookManagerService.switchActiveBook(book.id, false);
        }

        // Initialize database for this book (book is a Company type)
        dbService.switchDatabaseForBook(book.biller_id, book.id);

        // Restore database from backend if available
        const bookDbExists = dbService.databaseExistsForBook(book.biller_id, book.id);
        if (!bookDbExists) {
          console.log('Book database not found locally, attempting restore...');
          try {
            const restored = await dbService.restoreDatabaseFromBackend(
              book.biller_id,
              book.organization_id
            );
            if (restored) {
              console.log('Book database restored from backend');
            } else {
              console.log('Book database not found in backend, creating new');
              dbService.initializeDatabaseForBook(book.biller_id, book.id);
            }
          } catch (dbError: any) {
            console.error('Error initializing book database:', dbError);
            dbService.initializeDatabaseForBook(book.biller_id, book.id);
          }
        }

        // Close book selector and book login windows
        closeBookSelectorWindow();
        closeBookLoginWindow();

        // Hide login window
        if (globalLoginWindow) {
          globalLoginWindow.hide();
          globalLoginWindow = null;
        }

        // Apply auto-start settings
        if (globalApplyAutoStartSettings) {
          await globalApplyAutoStartSettings();
        }

        // ✅ Start background sync for this book
        console.log('Starting background sync for book:', book.name);
        if (profile && syncService) {
          // Switch to this book's database context
          dbService.switchDatabaseForBook(book.biller_id, book.id);
          
          // Start background sync
          syncService.startBackgroundSync(profile).catch((err: any) => {
            console.error('Error starting background sync:', err);
          });
        }

        // Create tray and start sync
        createTrayAndStartSync(profile, syncService, dbService).catch(err => {
          console.error('Error creating tray and starting sync:', err);
        });

        // Refresh dashboard to show new book
        const dashboardWindow = getDashboardWindow();
        if (dashboardWindow && !dashboardWindow.isDestroyed()) {
          dashboardWindow.webContents.send('book-connected', { book });
        } else {
          // Open dashboard if not open
          createDashboardWindow(profile);
        }

        return { success: true, message: 'Book connected successfully', book };
      } catch (error: any) {
        console.error('Error connecting book:', error);
        return { success: false, error: error.message || 'Failed to connect book' };
      }
    });

    // ✅ Open book login window (for connecting new books)
    ipcMain.handle('open-book-login-window', async (event) => {
      try {
        createBookLoginWindow();
        return { success: true };
      } catch (error: any) {
        console.error('Error opening book login window:', error);
        return { success: false, error: error.message || 'Failed to open login window' };
      }
    });
  }

  // ✅ Analytics handler
  ipcMain.handle('get-analytics', async (event) => {
    try {
      const profile = await dbService.getProfile();
      if (!profile || !profile.biller_id || !profile.apikey) {
        return {
          syncStats: {
            totalSyncs: 0,
            successfulSyncs: 0,
            failedSyncs: 0,
            last7Days: []
          },
          apiStats: {
            totalCalls: 0,
            successfulCalls: 0,
            failedCalls: 0,
            last7Days: []
          },
          processingStats: {
            customers: { total: 0, processed: 0, pending: 0, failed: 0 },
            invoices: { total: 0, processed: 0, pending: 0, failed: 0 },
            payments: { total: 0, processed: 0, pending: 0, failed: 0 }
          },
          fetchStats: {
            totalFetched: 0,
            todayFetched: 0,
            successRate: 0,
            lastFetchTime: null
          },
          sendStats: {
            totalSent: 0,
            todaySent: 0,
            successRate: 0,
            failedCount: 0,
            lastSendTime: null
          }
        };
      }

      // Get analytics from database (local logs)
      const analytics = await dbService.getAnalytics();

      // Fetch staging status from backend API
      let stagingStatus;
      try {
        stagingStatus = await fetchAllStagingStatus(profile.biller_id, profile.apikey, dbService);
      } catch (error: any) {
        console.error('Error fetching staging status:', error);
        // Use default empty status on error
        stagingStatus = {
          customers: { total_records: 0, successful_records: 0, unprocessed_records: 0, failed_records: 0, is_processing_complete: true, message: '' },
          invoices: { total_records: 0, successful_records: 0, unprocessed_records: 0, failed_records: 0, is_processing_complete: true, message: '' },
          payments: { total_records: 0, successful_records: 0, unprocessed_records: 0, failed_records: 0, is_processing_complete: true, message: '' }
        };
      }

      // Combine local analytics with staging status
      return {
        ...analytics,
        processingStats: {
          customers: {
            total: stagingStatus.customers.total_records,
            processed: stagingStatus.customers.successful_records,
            pending: stagingStatus.customers.unprocessed_records,
            failed: stagingStatus.customers.failed_records
          },
          invoices: {
            total: stagingStatus.invoices.total_records,
            processed: stagingStatus.invoices.successful_records,
            pending: stagingStatus.invoices.unprocessed_records,
            failed: stagingStatus.invoices.failed_records
          },
          payments: {
            total: stagingStatus.payments.total_records,
            processed: stagingStatus.payments.successful_records,
            pending: stagingStatus.payments.unprocessed_records,
            failed: stagingStatus.payments.failed_records
          }
        }
      };
    } catch (error: any) {
      console.error('Error getting analytics:', error);
      return {
        syncStats: {
          totalSyncs: 0,
          successfulSyncs: 0,
          failedSyncs: 0,
          last7Days: []
        },
        apiStats: {
          totalCalls: 0,
          successfulCalls: 0,
          failedCalls: 0,
          last7Days: []
        },
        processingStats: {
          customers: { total: 0, processed: 0, pending: 0, failed: 0 },
          invoices: { total: 0, processed: 0, pending: 0, failed: 0 },
          payments: { total: 0, processed: 0, pending: 0, failed: 0 }
        },
        fetchStats: {
          totalFetched: 0,
          todayFetched: 0,
          successRate: 0,
          lastFetchTime: null
        },
        sendStats: {
          totalSent: 0,
          todaySent: 0,
          successRate: 0,
          failedCount: 0,
          lastSendTime: null
        }
      };
    }
  });

  // ✅ Staging status handler (for real-time updates)
  ipcMain.handle('get-staging-status', async (event) => {
    try {
      const profile = await dbService.getProfile();
      if (!profile || !profile.biller_id || !profile.apikey) {
        return {
          success: false,
          error: 'No profile or credentials found'
        };
      }

      const stagingStatus = await fetchAllStagingStatus(profile.biller_id, profile.apikey, dbService);
      return {
        success: true,
        data: stagingStatus
      };
    } catch (error: any) {
      console.error('Error getting staging status:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch staging status'
      };
    }
  });
}
