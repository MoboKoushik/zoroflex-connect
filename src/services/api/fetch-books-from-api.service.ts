// src/services/api/fetch-books-from-api.service.ts
import axios from 'axios';
import { getApiUrl } from '../config/api-url-helper';
import { DatabaseService } from '../database/database.service';

export interface BookFromApi {
  id?: number;
  organization_id: string;
  organization_data?: any;
  name?: string;
  biller_id: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Fetch books (organizations) from backend API for a specific biller
 */
export async function fetchBooksFromApi(
  billerId: string,
  apiKey: string,
  dbService?: DatabaseService
): Promise<BookFromApi[]> {
  try {
    const apiUrl = await getApiUrl(dbService);
    
    // Call backend API to get organizations for this biller
    // The endpoint might be: /billers/{billerId}/organizations or similar
    const response = await axios.get(
      `${apiUrl}/billers/${billerId}/organizations`,
      {
        headers: {
          'API-KEY': apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    if (response.data?.success !== false && response.data) {
      // Handle different response formats
      let books: BookFromApi[] = [];
      
      if (Array.isArray(response.data)) {
        books = response.data;
      } else if (response.data.organizations && Array.isArray(response.data.organizations)) {
        books = response.data.organizations;
      } else if (response.data.data && Array.isArray(response.data.data)) {
        books = response.data.data;
      } else if (response.data.ZohoOrganizations && Array.isArray(response.data.ZohoOrganizations)) {
        books = response.data.ZohoOrganizations.map((org: any) => ({
          organization_id: org.organization_id,
          organization_data: org.organization_data,
          biller_id: billerId,
          name: org.organization_data?.company_name || org.organization_data?.name || org.organization_id
        }));
      }

      // Map to BookFromApi format
      const mappedBooks: BookFromApi[] = books.map((book: any) => {
        const orgData = book.organization_data || book;
        return {
          id: book.id,
          organization_id: book.organization_id || orgData.organization_id,
          organization_data: orgData,
          name: book.name || orgData.company_name || orgData.name || book.organization_id,
          biller_id: billerId,
          created_at: book.created_at,
          updated_at: book.updated_at
        };
      });

      if (dbService) {
        dbService.log('INFO', `Fetched ${mappedBooks.length} books from API for biller ${billerId}`);
      }

      return mappedBooks;
    }

    return [];
  } catch (error: any) {
    const errorMsg = error?.response?.data?.message || error?.message || 'Failed to fetch books from API';
    
    if (dbService) {
      dbService.log('ERROR', 'Failed to fetch books from API', {
        error: errorMsg,
        billerId,
        status: error?.response?.status
      });
    }

    // If 404 or no organizations found, return empty array (not an error)
    if (error?.response?.status === 404) {
      return [];
    }

    throw new Error(errorMsg);
  }
}
