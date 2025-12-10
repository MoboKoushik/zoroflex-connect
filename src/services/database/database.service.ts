// src/services/database/database.service.ts

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

    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.init();
  }

  private init(): void {
    this.db = new sqlite3.Database(this.dbPath, (err) => {
      if (err) {
        console.error('Failed to connect to database:', err);
        return;
      }
      console.log('Connected to SQLite database:', this.dbPath);
      this.createTables();
    });
  }

  private createTables(): void {
    const sql = `
      CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        token TEXT NOT NULL,
        biller_id TEXT,
        apikey TEXT,
        organization TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS sync_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_type TEXT NOT NULL,
        status TEXT NOT NULL,
        data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;

    this.db?.exec(sql, (err) => {
      if (err) {
        console.error('Error creating tables:', err);
      } else {
        console.log('Database tables ready');
      }
    });
  }

  async saveProfile(
    email: string,
    token: string,
    billerId?: string,
    apikey?: string,
    organization?: any
  ): Promise<void> {
    const orgJson = organization ? JSON.stringify(organization) : null;

    return new Promise((resolve, reject) => {
      this.db?.run(
        `INSERT OR REPLACE INTO profiles (email, token, biller_id, apikey, organization, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        [email.toLowerCase(), token, billerId || null, apikey || null, orgJson],
        (err) => {
          if (err) {
            console.error('saveProfile error:', err);
            reject(err);
          } else {
            console.log('Profile saved for:', email.toLowerCase());
            resolve();
          }
        }
      );
    });
  }

  async getProfile(): Promise<UserProfile | null> {
    return new Promise((resolve, reject) => {
      this.db?.get('SELECT * FROM profiles LIMIT 1', (err, row: any) => {
        if (err) {
          console.error('getProfile error:', err);
          reject(err);
        } else {
          if (row && row.organization) {
            try {
              row.organization = JSON.parse(row.organization);
            } catch (e) {
              console.warn('Invalid JSON in organization field');
              row.organization = {};
            }
          }
          resolve(row || null);
        }
      });
    });
  }

  async clearProfile(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db?.run('DELETE FROM profiles', function (err) {
        if (err) {
          console.error('clearProfile error:', err);
          reject(err);
        } else {
          console.log(`Profile cleared (rows deleted: ${this.changes})`);
          resolve();
        }
      });
    });
  }

  async logSync(type: string, status: 'SUCCESS' | 'FAILED' | 'STARTED' | 'INFO', data?: any): Promise<void> {
    const dataStr = data ? JSON.stringify(data) : null;
    return new Promise((resolve) => {
      this.db?.run(
        'INSERT INTO sync_history (sync_type, status, data) VALUES (?, ?, ?)',
        [type, status, dataStr],
        () => resolve()
      );
    });
  }

  log(level: 'INFO' | 'ERROR' | 'WARN' | 'DEBUG', message: string): void {
    this.db?.run(
      'INSERT INTO logs (level, message) VALUES (?, ?)',
      [level, message],
      (err) => {
        if (err) console.error('Log insert failed:', err);
      }
    );
  }

  close(): void {
    if (this.db) {
      this.db.close((err) => {
        if (err) console.error('Error closing database:', err);
        else console.log('Database connection closed');
      });
      this.db = null;
    }
  }
}