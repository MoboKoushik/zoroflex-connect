import * as path from 'path';
import * as fs from 'fs';
import sqlite3 from 'sqlite3';
import { app } from 'electron';

export interface UserProfile {
  id?: number;
  email: string;
  token: string;
  biller_id?: string;
  apikey?: string;
  organization?: any;
  created_at?: string;
}

export class DatabaseService {
  private db: sqlite3.Database | null = null;
  private dbPath: string;

  constructor() {
    this.dbPath = path.join(app.getPath('userData'), 'tally-sync.db');
    if (!fs.existsSync(path.dirname(this.dbPath))) fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    this.init();
  }

  private init(): void {
    this.db = new sqlite3.Database(this.dbPath, (err) => {
      if (err) console.error('DB init error:', err);
      else {
        console.log('DB connected');
        this.createTables();
      }
    });
  }

  private createTables(): void {
    // Existing
    this.db?.run(`CREATE TABLE IF NOT EXISTS sync_history (id INTEGER PRIMARY KEY, sync_type TEXT, status TEXT, data TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    this.db?.run(`CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY, level TEXT, message TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

    // New profiles
    this.db?.run(`CREATE TABLE IF NOT EXISTS profiles (id INTEGER PRIMARY KEY, email TEXT UNIQUE, token TEXT, biller_id TEXT, apikey TEXT, organization TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  }

  getProfile(): Promise<UserProfile | null> {
    return new Promise((resolve, reject) => {
      this.db?.get('SELECT * FROM profiles LIMIT 1', (err, row: any) => {
        if (err) reject(err);
        else {
          if (row?.organization) row.organization = JSON.parse(row.organization);
          resolve(row || null);
        }
      });
    });
  }

  saveProfile(email: string, token: string, billerId?: string, apikey?: string, organization?: any): Promise<void> {
    const orgJson = organization ? JSON.stringify(organization) : null;
    return new Promise((resolve, reject) => {
      this.db?.run('INSERT OR REPLACE INTO profiles (email, token, biller_id, apikey, organization) VALUES (?, ?, ?, ?, ?)', 
        [email, token, billerId || null, apikey || null, orgJson], 
        (err) => err ? reject(err) : resolve()
      );
    });
  }

  logSync(type: string, status: string, data?: any): void {
    const dataStr = data ? JSON.stringify(data) : null;
    this.db?.run('INSERT INTO logs (level, message) VALUES (?, ?)', [`SYNC_${status}`, `${type}: ${dataStr || 'Done'}`]);
  }

  close(): void {
    this.db?.close();
  }
}