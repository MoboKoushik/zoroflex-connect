// src/services/api/api-logger.service.ts

import axios, { AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { DatabaseService } from '../database/database.service';

export class ApiLoggerService {
  private dbService: DatabaseService;

  constructor(dbService: DatabaseService) {
    this.dbService = dbService;
  }

  /**
   * Setup axios interceptor to log all API requests/responses
   */
  setupInterceptor(axiosInstance: typeof axios): void {
    // Request interceptor
    axiosInstance.interceptors.request.use(
      (config: any) => {
        // Store start time for duration calculation
        config._startTime = Date.now();
        return config;
      },
      (error: AxiosError) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor
    axiosInstance.interceptors.response.use(
      (response: AxiosResponse) => {
        this.logResponse(response);
        return response;
      },
      (error: AxiosError) => {
        this.logError(error);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Log successful API response
   */
  private logResponse(response: AxiosResponse): void {
    const config = response.config as any;
    const startTime = config._startTime || Date.now();
    const duration = Date.now() - startTime;

    const endpoint = this.getEndpoint(config);
    const method = config.method?.toUpperCase() || 'GET';
    const requestPayload = this.sanitizePayload(config.data);
    const responsePayload = this.sanitizePayload(response.data);
    const statusCode = response.status;

    this.dbService.logApiRequest(
      endpoint,
      method,
      requestPayload,
      responsePayload,
      statusCode,
      'SUCCESS',
      null,
      duration
    ).catch(err => {
      console.error('Failed to log API request:', err);
    });
  }

  /**
   * Log API error
   */
  private logError(error: AxiosError): void {
    const config = error.config as any;
    const startTime = config?._startTime || Date.now();
    const duration = Date.now() - startTime;

    const endpoint = this.getEndpoint(config || {});
    const method = config?.method?.toUpperCase() || 'GET';
    const requestPayload = this.sanitizePayload(config?.data);
    const responsePayload = this.sanitizePayload(error.response?.data);
    const statusCode = error.response?.status || null;
    const errorMessage = error.message || 'Unknown error';

    this.dbService.logApiRequest(
      endpoint,
      method,
      requestPayload,
      responsePayload,
      statusCode,
      'ERROR',
      errorMessage,
      duration
    ).catch(err => {
      console.error('Failed to log API error:', err);
    });
  }

  /**
   * Get endpoint URL from config
   */
  private getEndpoint(config: AxiosRequestConfig): string {
    if (config.url) {
      const baseURL = config.baseURL || '';
      return baseURL ? `${baseURL}${config.url}` : config.url;
    }
    return 'unknown';
  }

  /**
   * Sanitize payload to avoid logging sensitive data
   * For now, just return the payload as-is, but this can be enhanced
   * to remove sensitive fields like passwords, tokens, etc.
   */
  private sanitizePayload(payload: any): any {
    if (!payload) return null;
    
    // If it's already a string, try to parse it
    if (typeof payload === 'string') {
      try {
        return JSON.parse(payload);
      } catch {
        return payload;
      }
    }
    
    // If it's an object, create a copy and potentially sanitize sensitive fields
    if (typeof payload === 'object') {
      const sanitized = JSON.parse(JSON.stringify(payload));
      
      // Remove sensitive fields (can be enhanced)
      const sensitiveFields = ['password', 'token', 'authorization', 'apikey', 'api_key'];
      const removeSensitive = (obj: any): any => {
        if (Array.isArray(obj)) {
          return obj.map(removeSensitive);
        }
        if (obj && typeof obj === 'object') {
          const result: any = {};
          for (const key in obj) {
            if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
              result[key] = '[REDACTED]';
            } else {
              result[key] = removeSensitive(obj[key]);
            }
          }
          return result;
        }
        return obj;
      };
      
      return removeSensitive(sanitized);
    }
    
    return payload;
  }

  /**
   * Manually log an API call (for non-axios requests)
   */
  async logManualApiCall(
    endpoint: string,
    method: string,
    requestPayload: any,
    responsePayload: any,
    statusCode: number | null,
    status: 'SUCCESS' | 'ERROR',
    errorMessage: string | null,
    durationMs: number
  ): Promise<void> {
    await this.dbService.logApiRequest(
      endpoint,
      method,
      requestPayload,
      responsePayload,
      statusCode,
      status,
      errorMessage,
      durationMs
    );
  }
}


