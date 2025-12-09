import axios, { AxiosInstance } from 'axios';
import { parseString } from 'xml2js';
import { TallyResponse } from './types';

export class TallyClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:9000') {
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/xml',
      },
    });
  }

  /**
   * Send XML request to Tally and parse response
   */
  async sendRequest(xmlRequest: string): Promise<any> {
    try {
      const response = await this.client.post('', xmlRequest, {
        headers: {
          'Content-Type': 'application/xml',
        },
      });

      // Parse XML response
      return new Promise((resolve, reject) => {
        parseString(response.data, { explicitArray: false }, (err, result) => {
          if (err) {
            reject(new Error(`Failed to parse Tally XML response: ${err.message}`));
            return;
          }
          resolve(result);
        });
      });
    } catch (error: any) {
      throw new Error(`Tally API request failed: ${error.message}`);
    }
  }

  /**
   * Build XML envelope for Tally request
   */
  buildEnvelope(body: string): string {
    return `<?xml version="1.0"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
  </HEADER>
  <BODY>
    ${body}
  </BODY>
</ENVELOPE>`;
  }

  /**
   * Test connection to Tally
   */
  async testConnection(): Promise<boolean> {
    try {
      const xmlRequest = this.buildEnvelope(`
        <DESC>
          <STATICVARIABLES>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          </STATICVARIABLES>
        </DESC>
      `);
      
      await this.sendRequest(xmlRequest);
      return true;
    } catch (error) {
      console.error('Tally connection test failed:', error);
      return false;
    }
  }
}

