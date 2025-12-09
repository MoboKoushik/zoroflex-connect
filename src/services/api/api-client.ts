import axios, { AxiosInstance, AxiosError } from 'axios';
import { DataType } from '../../types';
import { getEndpointForDataType, API_ENDPOINTS } from './endpoints';

export class NestApiClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        config.headers.Authorization = `Bearer ${this.apiKey}`;
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          throw new Error('Authentication failed. Please check your API key.');
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Update API key
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
    this.client.defaults.headers.Authorization = `Bearer ${apiKey}`;
  }

  /**
   * Update base URL
   */
  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl;
    this.client.defaults.baseURL = baseUrl;
  }

  /**
   * Sync data to Nest backend
   */
  async syncData(dataType: DataType, data: any[]): Promise<any> {
    const endpoint = getEndpointForDataType(this.baseUrl, dataType);
    
    try {
      const response = await this.client.post(endpoint, { data });
      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to sync ${dataType}: ${error.message}`);
    }
  }

  /**
   * Check sync status
   */
  async checkStatus(): Promise<any> {
    try {
      const response = await this.client.get(API_ENDPOINTS.status(this.baseUrl));
      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to check status: ${error.message}`);
    }
  }

  /**
   * Test connection to Nest backend
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.checkStatus();
      return true;
    } catch (error) {
      console.error('Nest backend connection test failed:', error);
      return false;
    }
  }
}

