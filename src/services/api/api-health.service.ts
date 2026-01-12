// src/services/api/api-health.service.ts
import axios from 'axios';
import { DatabaseService } from '../database/database.service';
import { getApiUrl } from '../config/api-url-helper';

export interface ApiHealthStatus {
  isOnline: boolean;
  lastCheckTime: Date | null;
  lastSuccessTime: Date | null;
  errorMessage: string | null;
  responseTime: number | null;
}

export class ApiHealthService {
  private dbService: DatabaseService;
  private checkInterval: NodeJS.Timeout | null = null;
  private isChecking = false;
  private currentStatus: ApiHealthStatus = {
    isOnline: false,
    lastCheckTime: null,
    lastSuccessTime: null,
    errorMessage: null,
    responseTime: null
  };
  private statusChangeCallbacks: Array<(status: ApiHealthStatus) => void> = [];

  constructor(dbService: DatabaseService) {
    this.dbService = dbService;
  }

  /**
   * Check API health
   */
  async checkHealth(): Promise<boolean> {
    if (this.isChecking) {
      return this.currentStatus.isOnline;
    }

    this.isChecking = true;
    const checkTime = new Date();
    const wasOnline = this.currentStatus.isOnline;
    const startTime = Date.now();

    try {
      const apiUrl = await getApiUrl(this.dbService);
      
      // Try health endpoint first, fallback to a simple API call
      let healthUrl = `${apiUrl}/health`;
      let response;
      
      try {
        response = await axios.get(healthUrl, {
          timeout: 10000,
          validateStatus: (status) => status < 500 // Accept 4xx as "API is up"
        });
      } catch (error: any) {
        // If /health doesn't exist, try a simple endpoint
        healthUrl = `${apiUrl}/billers/tally/health`;
        try {
          response = await axios.get(healthUrl, {
            timeout: 10000,
            validateStatus: (status) => status < 500
          });
        } catch (fallbackError: any) {
          // Last resort: try login endpoint (will fail but confirms API is up)
          healthUrl = `${apiUrl}/billers/tally/login`;
          response = await axios.post(healthUrl, {}, {
            timeout: 10000,
            validateStatus: () => true // Accept any status
          });
        }
      }

      const responseTime = Date.now() - startTime;
      // Consider API online if status < 500 (4xx = API is up but endpoint wrong, which is fine)
      // 404 specifically means API is up but endpoint doesn't exist - still consider online
      const isOnline = response.status < 500;
      
      this.currentStatus = {
        isOnline,
        lastCheckTime: checkTime,
        lastSuccessTime: isOnline ? checkTime : this.currentStatus.lastSuccessTime,
        errorMessage: isOnline ? null : `API returned status ${response.status}`,
        responseTime: isOnline ? responseTime : null
      };

      // Notify if status changed
      if (wasOnline !== isOnline) {
        this.notifyStatusChange();
      }

      // Only log if status changed or if there's an actual error (5xx)
      if (wasOnline !== isOnline || response.status >= 500) {
        this.dbService.log(isOnline ? 'INFO' : 'WARN',
          `API health check: ${isOnline ? 'Online' : 'Offline'}`,
          { url: healthUrl, responseTime, status: response.status, note: response.status === 404 ? 'Endpoint not found (API is up)' : undefined }
        );
      }

      return isOnline;
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      const isOnline = false;
      const errorMessage = error.message || 'Connection failed';
      
      this.currentStatus = {
        isOnline,
        lastCheckTime: checkTime,
        lastSuccessTime: this.currentStatus.lastSuccessTime,
        errorMessage,
        responseTime: null
      };

      // Notify if status changed
      if (wasOnline !== isOnline) {
        this.notifyStatusChange();
      }

      this.dbService.log('WARN', 'API health check failed', {
        error: errorMessage,
        responseTime
      });

      return false;
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Start periodic health monitoring
   */
  startMonitoring(intervalSeconds: number = 60): void {
    if (this.checkInterval) {
      this.stopMonitoring();
    }

    // Initial check
    this.checkHealth();

    // Periodic checks
    this.checkInterval = setInterval(() => {
      this.checkHealth();
    }, intervalSeconds * 1000);

    this.dbService.log('INFO', `Started API health monitoring (interval: ${intervalSeconds}s)`);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      this.dbService.log('INFO', 'Stopped API health monitoring');
    }
  }

  /**
   * Get current status
   */
  getStatus(): ApiHealthStatus {
    return { ...this.currentStatus };
  }

  /**
   * Subscribe to status changes
   */
  onStatusChange(callback: (status: ApiHealthStatus) => void): void {
    this.statusChangeCallbacks.push(callback);
  }

  /**
   * Unsubscribe from status changes
   */
  offStatusChange(callback: (status: ApiHealthStatus) => void): void {
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
