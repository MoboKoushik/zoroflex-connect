// src/services/api/staging-status.service.ts
import axios from 'axios';
import { getApiUrl } from '../config/api-url-helper';
import { DatabaseService, UserProfile } from '../database/database.service';

export interface StagingStatus {
  total_records: number;
  successful_records: number;
  failed_records: number;
  unprocessed_records: number;
  is_processing_complete: boolean;
  message: string;
}

export interface StagingStatusResponse {
  status: boolean;
  biller_id: string;
  total_records: number;
  successful_records: number;
  failed_records: number;
  unprocessed_records: number;
  is_processing_complete: boolean;
  message: string;
}

export interface AllStagingStatus {
  customers: StagingStatus;
  invoices: StagingStatus;
  payments: StagingStatus;
}

/**
 * Fetch staging status for customers from backend API
 */
export async function fetchCustomerStagingStatus(
  billerId: string,
  apiKey: string,
  dbService?: DatabaseService
): Promise<StagingStatus | null> {
  try {
    const apiUrl = await getApiUrl(dbService);
    
    const response = await axios.get(
      `${apiUrl}/customer/tally-customer-status`,
      {
        params: {
          biller_id: billerId
        },
        headers: {
          'API-KEY': apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    if (response.data?.status === true) {
      return {
        total_records: response.data.total_records || 0,
        successful_records: response.data.successful_records || 0,
        failed_records: response.data.failed_records || 0,
        unprocessed_records: response.data.unprocessed_records || 0,
        is_processing_complete: response.data.is_processing_complete || false,
        message: response.data.message || ''
      };
    }

    return null;
  } catch (error: any) {
    const errorMsg = error?.response?.data?.message || error?.message || 'Failed to fetch customer staging status';
    
    if (dbService) {
      dbService.log('ERROR', 'Failed to fetch customer staging status', {
        error: errorMsg,
        billerId,
        status: error?.response?.status
      });
    }

    // If no records found (404), return empty status
    if (error?.response?.status === 404) {
      return {
        total_records: 0,
        successful_records: 0,
        failed_records: 0,
        unprocessed_records: 0,
        is_processing_complete: true,
        message: 'No customer records found'
      };
    }

    throw new Error(errorMsg);
  }
}

/**
 * Fetch staging status for invoices from backend API
 */
export async function fetchInvoiceStagingStatus(
  billerId: string,
  apiKey: string,
  dbService?: DatabaseService
): Promise<StagingStatus | null> {
  try {
    const apiUrl = await getApiUrl(dbService);
    
    const response = await axios.get(
      `${apiUrl}/invoice/tally-invoice-status`,
      {
        params: {
          biller_id: billerId
        },
        headers: {
          'API-KEY': apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    if (response.data?.status === true) {
      return {
        total_records: response.data.total_records || 0,
        successful_records: response.data.successful_records || 0,
        failed_records: response.data.failed_records || 0,
        unprocessed_records: response.data.unprocessed_records || 0,
        is_processing_complete: response.data.is_processing_complete || false,
        message: response.data.message || ''
      };
    }

    return null;
  } catch (error: any) {
    const errorMsg = error?.response?.data?.message || error?.message || 'Failed to fetch invoice staging status';
    
    if (dbService) {
      dbService.log('ERROR', 'Failed to fetch invoice staging status', {
        error: errorMsg,
        billerId,
        status: error?.response?.status
      });
    }

    // If no records found (404), return empty status
    if (error?.response?.status === 404) {
      return {
        total_records: 0,
        successful_records: 0,
        failed_records: 0,
        unprocessed_records: 0,
        is_processing_complete: true,
        message: 'No invoice records found'
      };
    }

    throw new Error(errorMsg);
  }
}

/**
 * Fetch staging status for payments from backend API
 */
export async function fetchPaymentStagingStatus(
  billerId: string,
  apiKey: string,
  dbService?: DatabaseService
): Promise<StagingStatus | null> {
  try {
    const apiUrl = await getApiUrl(dbService);
    
    const response = await axios.get(
      `${apiUrl}/billers/tally-payment-status`,
      {
        params: {
          biller_id: billerId
        },
        headers: {
          'API-KEY': apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    if (response.data?.status === true) {
      return {
        total_records: response.data.total_records || 0,
        successful_records: response.data.successful_records || 0,
        failed_records: response.data.failed_records || 0,
        unprocessed_records: response.data.unprocessed_records || 0,
        is_processing_complete: response.data.is_processing_complete || false,
        message: response.data.message || ''
      };
    }

    return null;
  } catch (error: any) {
    const errorMsg = error?.response?.data?.message || error?.message || 'Failed to fetch payment staging status';
    
    if (dbService) {
      dbService.log('ERROR', 'Failed to fetch payment staging status', {
        error: errorMsg,
        billerId,
        status: error?.response?.status
      });
    }

    // If no records found (404), return empty status
    if (error?.response?.status === 404) {
      return {
        total_records: 0,
        successful_records: 0,
        failed_records: 0,
        unprocessed_records: 0,
        is_processing_complete: true,
        message: 'No payment records found'
      };
    }

    throw new Error(errorMsg);
  }
}

/**
 * Fetch all staging statuses (customers, invoices, payments) in parallel
 */
export async function fetchAllStagingStatus(
  billerId: string,
  apiKey: string,
  dbService?: DatabaseService
): Promise<AllStagingStatus> {
  try {
    const [customers, invoices, payments] = await Promise.allSettled([
      fetchCustomerStagingStatus(billerId, apiKey, dbService),
      fetchInvoiceStagingStatus(billerId, apiKey, dbService),
      fetchPaymentStagingStatus(billerId, apiKey, dbService)
    ]);

    const defaultStatus: StagingStatus = {
      total_records: 0,
      successful_records: 0,
      failed_records: 0,
      unprocessed_records: 0,
      is_processing_complete: true,
      message: 'No data available'
    };

    return {
      customers: customers.status === 'fulfilled' && customers.value 
        ? customers.value 
        : defaultStatus,
      invoices: invoices.status === 'fulfilled' && invoices.value 
        ? invoices.value 
        : defaultStatus,
      payments: payments.status === 'fulfilled' && payments.value 
        ? payments.value 
        : defaultStatus
    };
  } catch (error: any) {
    if (dbService) {
      dbService.log('ERROR', 'Failed to fetch all staging statuses', {
        error: error?.message,
        billerId
      });
    }

    // Return default empty status on error
    const defaultStatus: StagingStatus = {
      total_records: 0,
      successful_records: 0,
      failed_records: 0,
      unprocessed_records: 0,
      is_processing_complete: true,
      message: 'Failed to fetch status'
    };

    return {
      customers: defaultStatus,
      invoices: defaultStatus,
      payments: defaultStatus
    };
  }
}
