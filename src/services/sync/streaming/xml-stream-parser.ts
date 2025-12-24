import * as sax from 'sax';
import { Readable } from 'stream';

export interface ParsedRecord {
  type: 'CUSTOMER' | 'INVOICE' | 'RECEIPT' | 'JOURNAL';
  data: any;
  alterId: string;
}

export class StreamingXMLParser {
  private parser: any;
  private currentRecord: any = {};
  private currentPath: string[] = [];
  private records: ParsedRecord[] = [];
  private recordCount = 0;
  private maxRecords: number;
  private resolvePromise?: (records: ParsedRecord[]) => void;
  private rejectPromise?: (error: Error) => void;
  private currentTagStack: any[] = [];
  private inCollection = false;

  constructor(maxRecords: number = 100) {
    this.maxRecords = maxRecords;
    this.parser = sax.parser(true, {
      trim: true,
      normalize: true,
      lowercase: false
    });
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.parser.onopentag = (node: any) => {
      this.currentPath.push(node.name);
      this.currentTagStack.push({ name: node.name, attributes: node.attributes, parent: this.currentTagStack[this.currentTagStack.length - 1] || null });

      if (node.name === 'LEDGER' || node.name === 'VOUCHER') {
        this.currentRecord = { _type: node.name };
        this.inCollection = true;
      } else if (this.inCollection && this.currentRecord) {
        // Initialize nested objects
        const currentPathStr = this.currentPath.join('.');
        this.ensurePath(this.currentRecord, currentPathStr);
      }
    };

    this.parser.ontext = (text: string) => {
      if (this.currentRecord && this.currentPath.length > 0) {
        const key = this.currentPath[this.currentPath.length - 1];
        const path = this.currentPath.join('.');
        
        // Handle list items (items ending with .LIST)
        if (path.includes('.LIST')) {
          const listPath = path.replace(/\.LIST$/, '');
          if (!this.currentRecord[listPath]) {
            this.currentRecord[listPath] = [];
          }
          // For list items, we'll handle them in onclosetag
        } else {
          this.setNestedValue(this.currentRecord, path, text);
        }
      }
    };

    this.parser.onclosetag = (tagName: string) => {
      if (tagName === 'LEDGER' || tagName === 'VOUCHER') {
        if (this.currentRecord && Object.keys(this.currentRecord).length > 1) {
          const alterId = this.extractAlterId(this.currentRecord);
          this.records.push({
            type: this.mapType(tagName),
            data: this.currentRecord,
            alterId: alterId
          });
          this.recordCount++;

          if (this.recordCount >= this.maxRecords) {
            this.parser.close();
            if (this.resolvePromise) {
              this.resolvePromise(this.records);
            }
          }
        }
        this.currentRecord = {};
        this.inCollection = false;
      }
      this.currentPath.pop();
      this.currentTagStack.pop();
    };

    this.parser.onend = () => {
      if (this.resolvePromise) {
        this.resolvePromise(this.records);
      }
    };

    this.parser.onerror = (err: Error) => {
      if (this.rejectPromise) {
        this.rejectPromise(err);
      }
    };
  }

  async parse(xmlStream: Readable): Promise<ParsedRecord[]> {
    return new Promise((resolve, reject) => {
      this.records = [];
      this.recordCount = 0;
      this.currentRecord = {};
      this.currentPath = [];
      this.resolvePromise = resolve;
      this.rejectPromise = reject;

      xmlStream.on('data', (chunk: Buffer) => {
        this.parser.write(chunk.toString());
      });

      xmlStream.on('end', () => {
        this.parser.end();
      });

      xmlStream.on('error', (err: Error) => {
        reject(err);
      });
    });
  }

  private extractAlterId(record: any): string {
    // Try different possible paths for AlterID
    if (record.ALTERID) return String(record.ALTERID).trim();
    if (record._type === 'LEDGER' && record.LEDGER && record.LEDGER.ALTERID) {
      return String(record.LEDGER.ALTERID).trim();
    }
    if (record._type === 'VOUCHER' && record.VOUCHER && record.VOUCHER.ALTERID) {
      return String(record.VOUCHER.ALTERID).trim();
    }
    return '0';
  }

  private mapType(tagName: string): ParsedRecord['type'] {
    if (tagName === 'LEDGER') return 'CUSTOMER';
    if (tagName === 'VOUCHER') {
      // Determine voucher type from data if available
      // This will be handled by the caller based on VoucherTypeName
      return 'INVOICE'; // Default, caller will override based on VoucherTypeName
    }
    return 'CUSTOMER';
  }

  private ensurePath(obj: any, path: string): void {
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }
  }

  private setNestedValue(obj: any, path: string, value: any): void {
    const parts = path.split('.');
    let current = obj;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }
    
    const lastPart = parts[parts.length - 1];
    
    // Handle arrays (for list items)
    if (lastPart.endsWith('.LIST') || lastPart.includes('LIST')) {
      const listKey = lastPart.replace(/\.LIST$/, '');
      if (!current[listKey]) {
        current[listKey] = [];
      }
      // For now, store as text - will be parsed properly by transformation layer
      if (!current[lastPart]) {
        current[lastPart] = [];
      }
    } else {
      // Store value directly
      if (current[lastPart] && typeof current[lastPart] === 'string') {
        // Append if already exists (for multi-line text)
        current[lastPart] += '\n' + value;
      } else {
        current[lastPart] = value;
      }
    }
  }
}

