// src/main/tray/tray-manager.ts
import { Tray, Menu, app, dialog } from 'electron';
import * as path from 'path';
import { getDashboardWindow } from '../windows/dashboard.window';
import { createDashboardWindow } from '../windows/dashboard.window';
import { createLoginWindow } from '../windows/login.window';
import { DatabaseService } from '../../services/database/database.service';
import { SyncService } from '../../services/sync/sync.service';

let tray: Tray | null = null;

export function createTray(
  profile: any,
  dbService: DatabaseService,
  syncService: SyncService
): Tray | null {
  if (tray) {
    return tray;
  }

  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets/tray-icon.png')
    : path.join(__dirname, '../../../assets/tray-icon.png');

  tray = new Tray(iconPath);
  tray.setToolTip('Zorrofin Connect - Connected');

  const updateTrayMenu = () => {
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
      { 
        label: 'Sync Now', 
        click: () => syncService.manualSync(profile) 
      },
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

    tray?.setContextMenu(contextMenu);
  };

  updateTrayMenu();

  tray.on('click', () => {
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

  return tray;
}

export function getTray(): Tray | null {
  return tray;
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
