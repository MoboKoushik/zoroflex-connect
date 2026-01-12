// src/services/tally/tally-connectivity.service.ts
import axios from 'axios';
import { DatabaseService } from '../database/database.service';
import { getApiUrl } from '../config/api-url-helper';

export interface TallyConnectivityStatus {
  isOnline: boolean;
  lastCheckTime: Date | null;
  lastSuccessTime: Date | null;
  errorMessage: string | null;
  port: number;
}

export class TallyConnectivityService {
  private dbService: DatabaseService;
  private checkInterval: NodeJS.Timeout | null = null;
  private isChecking = false;
  private currentStatus: TallyConnectivityStatus = {
    isOnline: false,
    lastCheckTime: null,
    lastSuccessTime: null,
    errorMessage: null,
    port: 9000
  };
  private statusChangeCallbacks: Array<(status: TallyConnectivityStatus) => void> = [];

  constructor(dbService: DatabaseService) {
    this.dbService = dbService;
  }

  /**
   * Get Tally URL from settings
   */
  private async getTallyUrl(): Promise<string> {
    // First try to get port from settings
    const port = await this.dbService.getSetting('tallyPort');
    if (port) {
      const portNumber = parseInt(port, 10);
      if (!isNaN(portNumber) && portNumber > 0 && portNumber <= 65535) {
        this.currentStatus.port = portNumber;
        return `http://localhost:${portNumber}`;
      }
    }
    
    // Fallback to tallyUrl setting
    const tallyUrl = await this.dbService.getSetting('tallyUrl');
    if (tallyUrl) {
      try {
        const url = new URL(tallyUrl);
        const portNumber = parseInt(url.port || '9000', 10);
        this.currentStatus.port = portNumber;
        return tallyUrl;
      } catch {
        // Invalid URL, use default
      }
    }
    
    // Default
    const portNumber = 9000;
    this.currentStatus.port = portNumber;
    return `http://localhost:${portNumber}`;
  }

  /**
   * Check Tally connectivity
   */
  async checkConnectivity(): Promise<boolean> {
    if (this.isChecking) {
      return this.currentStatus.isOnline;
    }

    this.isChecking = true;
    const checkTime = new Date();
    const wasOnline = this.currentStatus.isOnline;

    try {
      const tallyUrl = await this.getTallyUrl();
      const url = new URL(tallyUrl);
      const port = parseInt(url.port || '9000', 10);
      
      // Simple XML request to check if Tally is responding
      const xmlRequest = `<?xml version="1.0"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>CompanyInfo</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>`;

      const response = await axios.post(tallyUrl, xmlRequest, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/xml'
        }
      });

      const isOnline = response.status === 200 && response.data;
      
      this.currentStatus = {
        isOnline,
        lastCheckTime: checkTime,
        lastSuccessTime: isOnline ? checkTime : this.currentStatus.lastSuccessTime,
        errorMessage: isOnline ? null : 'Tally responded but with invalid data',
        port
      };

      // Notify if status changed
      if (wasOnline !== isOnline) {
        this.notifyStatusChange();
      }

      this.dbService.log(isOnline ? 'INFO' : 'WARN', 
        `Tally connectivity check: ${isOnline ? 'Online' : 'Offline'}`,
        { port, url: tallyUrl }
      );

      return isOnline;
    } catch (error: any) {
      const isOnline = false;
      const errorMessage = error.message || 'Connection failed';
      
      this.currentStatus = {
        isOnline,
        lastCheckTime: checkTime,
        lastSuccessTime: this.currentStatus.lastSuccessTime,
        errorMessage,
        port: this.currentStatus.port
      };

      // Notify if status changed
      if (wasOnline !== isOnline) {
        this.notifyStatusChange();
      }

      this.dbService.log('WARN', 'Tally connectivity check failed', {
        error: errorMessage,
        port: this.currentStatus.port
      });

      return false;
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Start periodic connectivity monitoring
   */
  startMonitoring(intervalSeconds: number = 30): void {
    if (this.checkInterval) {
      this.stopMonitoring();
    }

    // Initial check
    this.checkConnectivity();

    // Periodic checks
    this.checkInterval = setInterval(() => {
      this.checkConnectivity();
    }, intervalSeconds * 1000);

    this.dbService.log('INFO', `Started Tally connectivity monitoring (interval: ${intervalSeconds}s)`);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      this.dbService.log('INFO', 'Stopped Tally connectivity monitoring');
    }
  }

  /**
   * Get current status
   */
  getStatus(): TallyConnectivityStatus {
    return { ...this.currentStatus };
  }

  /**
   * Subscribe to status changes
   */
  onStatusChange(callback: (status: TallyConnectivityStatus) => void): void {
    this.statusChangeCallbacks.push(callback);
  }

  /**
   * Unsubscribe from status changes
   */
  offStatusChange(callback: (status: TallyConnectivityStatus) => void): void {
    this.statusChangeCallbacks = this.statusChangeCallbacks.filter(cb => cb !== callback);
  }

  /**
   * Notify all subscribers of status change
   */
  private notifyStatusChange(): void {
    const status = this.getStatus();
    this.statusChangeCallbacks.forEach(callback => {
      try {
        callback(status);
      } catch (error) {
        console.error('Error in status change callback:', error);
      }
    });
  }
}
