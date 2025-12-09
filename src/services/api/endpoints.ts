import { DataType } from '../../types';

export const API_ENDPOINTS = {
  vouchers: (baseUrl: string) => `${baseUrl}/api/tally/vouchers`,
  ledgers: (baseUrl: string) => `${baseUrl}/api/tally/ledgers`,
  inventory: (baseUrl: string) => `${baseUrl}/api/tally/inventory`,
  status: (baseUrl: string) => `${baseUrl}/api/tally/status`,
};

export function getEndpointForDataType(baseUrl: string, dataType: DataType): string {
  switch (dataType) {
    case DataType.VOUCHERS:
      return API_ENDPOINTS.vouchers(baseUrl);
    case DataType.LEDGERS:
      return API_ENDPOINTS.ledgers(baseUrl);
    case DataType.INVENTORY:
      return API_ENDPOINTS.inventory(baseUrl);
    default:
      throw new Error(`Unknown data type: ${dataType}`);
  }
}

