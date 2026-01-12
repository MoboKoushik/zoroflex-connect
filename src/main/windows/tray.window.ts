// src/main/windows/tray.window.ts
import { Tray, Menu, app, dialog } from 'electron';
import * as path from 'path';
import { SyncService } from '../../services/sync/sync.service';
import { DatabaseService } from '../../services/database/database.service';
import { getDashboardWindow, createDashboardWindow } from './dashboard.window';
import { createLoginWindow } from './login.window';

let tray: Tray | null = null;

export function createTrayAndStartSync(
  profile: any,
  syncService: SyncService,
  dbService: DatabaseService
): void {
  if (tray) return;

  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets/icon.png')
    : path.join(__dirname, '../../../assets/icon.png');

  tray = new Tray(iconPath);
  tray.setToolTip('Zorrofin Connect - Connected');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Dashboard',
      click: () => {
        const dashboardWindow = getDashboardWindow();
        if (dashboardWindow) {
          if (dashboardWindow.isVisible()) {
            dashboardWindow.hide();
          } else {
            dashboardWindow.show();
            dashboardWindow.focus();
          }
        } else {
          createDashboardWindow(profile);
        }
      }
    },
    { label: 'Sync Now', click: () => syncService.manualSync(profile) },
    { type: 'separator' },
    {
      label: 'Disconnect',
      click: async () => {
        const { response } = await dialog.showMessageBox({
          type: 'question',
          buttons: ['Cancel', 'Disconnect'],
          defaultId: 1,
          message: 'Disconnect?',
          detail: 'You will be logged out.',
        });

        if (response === 1) {
          syncService.stop();
          await dbService.logoutAndClearProfile();
          destroyTray();
          const dashboardWindow = getDashboardWindow();
          if (dashboardWindow) {
            dashboardWindow.close();
          }
          createLoginWindow();
        }
      },
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    // Default click: Toggle dashboard
    const dashboardWindow = getDashboardWindow();
    if (dashboardWindow) {
      if (dashboardWindow.isVisible()) {
        dashboardWindow.hide();
      } else {
        dashboardWindow.show();
        dashboardWindow.focus();
      }
    } else {
      createDashboardWindow(profile);
    }
  });

  // Start background sync
  syncService.startBackgroundSync(profile);
  console.log('Tray created + Background sync started');
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

export function getTray(): Tray | null {
  return tray;
}
