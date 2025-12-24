import axios, { AxiosError } from 'axios';

export class ApiClient {
  async sendRequest(url: string, method: string, data: any, token: string): Promise<any> {
    try {
      const response = await axios({
        method,
        url,
        data,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        timeout: 60000
      });
      return response.data;
    } catch (error: any) {
      if (error.response) {
        throw new Error(`API request failed: ${error.response.status} - ${error.response.statusText}`);
      } else if (error.request) {
        throw new Error('API request failed: No response from server');
      } else {
        throw new Error(`API request failed: ${error.message}`);
      }
    }
  }
}

