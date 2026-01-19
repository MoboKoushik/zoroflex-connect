// src/services/database/repositories/company.repository.ts
import Database from 'better-sqlite3';
import { DatabaseService } from '../database.service';

export interface Company {
    id: number;
    biller_id: string;
    organization_id: string;
    tally_id: string;
    name: string;
    gstin?: string;
    address?: string;
    state?: string;
    country: string;
    pin?: string;
    trn?: string;
    book_start_from: string; // YYYY-MM-DD format
    is_active: number;
    
    // ✅ NEW FIELDS for multi-book support
    tally_username?: string;
    tally_password_encrypted?: string;
    company_unique_id?: string;
    last_synced_at?: string;
    sync_status?: 'ACTIVE' | 'SYNCING' | 'ERROR' | 'INACTIVE';
    auto_sync_enabled?: number;
    sync_interval_minutes?: number;
    connection_status?: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
    
    created_at: string;
    updated_at: string;
}

export interface CreateCompanyData {
    biller_id: string;
    organization_id: string;
    tally_id: string;
    name: string;
    gstin?: string;
    address?: string;
    state?: string;
    country?: string;
    pin?: string;
    trn?: string;
    book_start_from: string; // YYYY-MM-DD format
    
    // ✅ NEW FIELDS
    tally_username?: string;
    tally_password?: string; // Plain password (will be encrypted)
    auto_sync_enabled?: boolean;
    sync_interval_minutes?: number;
}

export class CompanyRepository {
    private db: Database.Database;
    private crypto: any;
    private dbService: DatabaseService;

    constructor(dbService: DatabaseService) {
        this.dbService = dbService;
        // ✅ Use profile.db instead of main database for companies table
        // Companies table is now centralized in profile.db for all billers
        this.db = (dbService as any).getProfileDatabase();
        // Initialize crypto for password encryption
        try {
            this.crypto = require('crypto');
        } catch (error) {
            console.error('Crypto module not available:', error);
        }
    }

    /**
     * ✅ Encrypt password
     */
    private encryptPassword(password: string): string {
        if (!this.crypto) {
            // Fallback: simple base64 encoding (NOT secure, but better than plain text)
            return Buffer.from(password).toString('base64');
        }

        try {
            const algorithm = 'aes-256-cbc';
            const key = this.crypto.scryptSync(
                process.env.ENCRYPTION_KEY || 'zorrofin-tally-sync-secret-key-2024',
                'salt',
                32
            );
            const iv = this.crypto.randomBytes(16);
            const cipher = this.crypto.createCipheriv(algorithm, key, iv);
            let encrypted = cipher.update(password, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            return iv.toString('hex') + ':' + encrypted;
        } catch (error) {
            console.error('Encryption error, using base64 fallback:', error);
            return Buffer.from(password).toString('base64');
        }
    }

    /**
     * ✅ Decrypt password
     */
    private decryptPassword(encryptedPassword: string): string {
        if (!this.crypto) {
            // Fallback: base64 decode
            return Buffer.from(encryptedPassword, 'base64').toString('utf8');
        }

        try {
            // Check if it's base64 encoded (old format)
            if (!encryptedPassword.includes(':')) {
                return Buffer.from(encryptedPassword, 'base64').toString('utf8');
            }

            const algorithm = 'aes-256-cbc';
            const key = this.crypto.scryptSync(
                process.env.ENCRYPTION_KEY || 'zorrofin-tally-sync-secret-key-2024',
                'salt',
                32
            );
            const parts = encryptedPassword.split(':');
            const iv = Buffer.from(parts[0], 'hex');
            const encrypted = parts[1];
            const decipher = this.crypto.createDecipheriv(algorithm, key, iv);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (error) {
            console.error('Decryption error:', error);
            // Try base64 as fallback
            try {
                return Buffer.from(encryptedPassword, 'base64').toString('utf8');
            } catch {
                return '';
            }
        }
    }

    /**
     * ✅ Create or update a company with credentials support
     */
    async upsertCompany(data: CreateCompanyData): Promise<Company> {
        const encryptedPassword = data.tally_password 
            ? this.encryptPassword(data.tally_password) 
            : null;

        // Check if company already exists
        const existing = this.getCompanyByBillerAndOrg(data.biller_id, data.organization_id);
        
        let companyId: number;
        if (existing) {
            companyId = existing.id;
            
            // Update existing company
            const stmt = this.db.prepare(`
                UPDATE companies SET
                    tally_id = ?,
                    name = ?,
                    gstin = COALESCE(?, gstin),
                    address = COALESCE(?, address),
                    state = COALESCE(?, state),
                    country = COALESCE(?, country),
                    pin = COALESCE(?, pin),
                    trn = COALESCE(?, trn),
                    book_start_from = ?,
                    tally_username = COALESCE(?, tally_username),
                    tally_password_encrypted = CASE 
                        WHEN ? IS NOT NULL THEN ? 
                        ELSE tally_password_encrypted 
                    END,
                    auto_sync_enabled = COALESCE(?, auto_sync_enabled, 1),
                    sync_interval_minutes = COALESCE(?, sync_interval_minutes, 60),
                    updated_at = datetime('now')
                WHERE id = ?
            `);
            
            stmt.run(
                data.tally_id,
                data.name,
                data.gstin || null,
                data.address || null,
                data.state || null,
                data.country || 'India',
                data.pin || null,
                data.trn || null,
                data.book_start_from,
                data.tally_username || null,
                encryptedPassword,
                encryptedPassword,
                data.auto_sync_enabled !== false ? 1 : 0,
                data.sync_interval_minutes || 60,
                companyId
            );
        } else {
            // Create new company
            const stmt = this.db.prepare(`
                INSERT INTO companies (
                    biller_id, organization_id, tally_id, name, gstin, address,
                    state, country, pin, trn, book_start_from, is_active,
                    tally_username, tally_password_encrypted,
                    auto_sync_enabled, sync_interval_minutes,
                    sync_status, connection_status, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'INACTIVE', 'DISCONNECTED', datetime('now'))
            `);
            
            const result = stmt.run(
                data.biller_id,
                data.organization_id,
                data.tally_id,
                data.name,
                data.gstin || null,
                data.address || null,
                data.state || null,
                data.country || 'India',
                data.pin || null,
                data.trn || null,
                data.book_start_from,
                data.tally_username || null,
                encryptedPassword,
                data.auto_sync_enabled !== false ? 1 : 0,
                data.sync_interval_minutes || 60
            );
            
            companyId = result.lastInsertRowid as number;
            
            // Generate unique_id after insert
            const uniqueId = `${data.biller_id}_${companyId}`;
            const updateUniqueIdStmt = this.db.prepare(`
                UPDATE companies SET company_unique_id = ? WHERE id = ?
            `);
            updateUniqueIdStmt.run(uniqueId, companyId);
        }

        return this.getCompanyById(companyId)!;
    }

    /**
     * Get company by ID
     */
    getCompanyById(id: number): Company | null {
        const stmt = this.db.prepare('SELECT * FROM companies WHERE id = ?');
        const row = stmt.get(id) as any;
        if (!row) return null;
        return this.mapRowToCompany(row);
    }

    /**
     * Get company by biller_id and organization_id
     */
    getCompanyByBillerAndOrg(billerId: string, orgId: string): Company | null {
        const stmt = this.db.prepare(
            'SELECT * FROM companies WHERE biller_id = ? AND organization_id = ?'
        );
        const row = stmt.get(billerId, orgId) as any;
        if (!row) return null;
        return this.mapRowToCompany(row);
    }

    /**
     * Get active company for a biller
     */
    getActiveCompany(billerId: string): Company | null {
        const stmt = this.db.prepare(
            'SELECT * FROM companies WHERE biller_id = ? AND is_active = 1 ORDER BY updated_at DESC LIMIT 1'
        );
        const row = stmt.get(billerId) as any;
        if (!row) return null;
        return this.mapRowToCompany(row);
    }

    /**
     * Get all companies for a biller (or all companies if billerId is not provided)
     */
    getAllCompanies(billerId?: string): Company[] {
        if (billerId) {
            const stmt = this.db.prepare(
                'SELECT * FROM companies WHERE biller_id = ? ORDER BY name'
            );
            const rows = stmt.all(billerId) as any[];
            return rows.map(row => this.mapRowToCompany(row));
        } else {
            const stmt = this.db.prepare(
                'SELECT * FROM companies ORDER BY name'
            );
            const rows = stmt.all() as any[];
            return rows.map(row => this.mapRowToCompany(row));
        }
    }

    /**
     * Set company as active (deactivate others)
     */
    setActiveCompanyLegacy(companyId: number, billerId: string): void {
        const transaction = this.db.transaction(() => {
            // Deactivate all companies for this biller
            const deactivateStmt = this.db.prepare(
                'UPDATE companies SET is_active = 0, updated_at = datetime(\'now\') WHERE biller_id = ?'
            );
            deactivateStmt.run(billerId);

            // Activate the selected company
            const activateStmt = this.db.prepare(
                'UPDATE companies SET is_active = 1, updated_at = datetime(\'now\') WHERE id = ?'
            );
            activateStmt.run(companyId);
        });

        transaction();
    }

    /**
     * Delete company
     */
    deleteCompany(companyId: number): void {
        const stmt = this.db.prepare('DELETE FROM companies WHERE id = ?');
        stmt.run(companyId);
    }

    /**
     * ✅ Get company with decrypted password
     */
    getCompanyWithCredentials(companyId: number): (Company & { tally_password?: string }) | null {
        const company = this.getCompanyById(companyId);
        if (!company) return null;

        const result: Company & { tally_password?: string } = { ...company };
        
        if (company.tally_password_encrypted) {
            try {
                result.tally_password = this.decryptPassword(company.tally_password_encrypted);
            } catch (error) {
                console.error('Error decrypting password:', error);
            }
        }

        return result;
    }

    /**
     * ✅ Get all active companies for a biller (multiple can be active)
     */
    getActiveCompanies(billerId: string): Company[] {
    // Check if database is initialized
    if (!this.db) {
      console.warn('Database not initialized, returning empty array for getActiveCompanies');
      return [];
    }
        const stmt = this.db.prepare(`
            SELECT * FROM companies 
            WHERE biller_id = ? AND is_active = 1 
            ORDER BY updated_at DESC
        `);
        const rows = stmt.all(billerId) as any[];
        return rows.map(row => this.mapRowToCompany(row));
    }

    /**
     * ✅ Update company connection status
     */
    updateConnectionStatus(
        companyId: number, 
        status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR',
        errorMessage?: string
    ): void {
        const stmt = this.db.prepare(`
            UPDATE companies 
            SET connection_status = ?, 
                sync_status = CASE 
                    WHEN ? = 'CONNECTED' THEN 'ACTIVE'
                    WHEN ? = 'ERROR' THEN 'ERROR'
                    ELSE 'INACTIVE'
                END,
                updated_at = datetime('now')
            WHERE id = ?
        `);
        stmt.run(status, status, status, companyId);
    }

    /**
     * ✅ Update company sync status
     */
    updateSyncStatus(
        companyId: number,
        status: 'ACTIVE' | 'SYNCING' | 'ERROR' | 'INACTIVE',
        lastSyncedAt?: string
    ): void {
        const stmt = this.db.prepare(`
            UPDATE companies 
            SET sync_status = ?,
                last_synced_at = COALESCE(?, last_synced_at),
                updated_at = datetime('now')
            WHERE id = ?
        `);
        stmt.run(status, lastSyncedAt || null, companyId);
    }

    /**
     * ✅ Set company as active (allow multiple active books)
     */
    setActiveCompany(companyId: number, billerId: string, makeExclusive: boolean = false): void {
        const transaction = this.db.transaction(() => {
            if (makeExclusive) {
                // Deactivate all companies for this biller (exclusive mode)
                const deactivateStmt = this.db.prepare(`
                    UPDATE companies 
                    SET is_active = 0, updated_at = datetime('now') 
                    WHERE biller_id = ?
                `);
                deactivateStmt.run(billerId);
            }

            // Activate the selected company
            const activateStmt = this.db.prepare(`
                UPDATE companies 
                SET is_active = 1, 
                    connection_status = 'CONNECTED',
                    sync_status = 'ACTIVE',
                    updated_at = datetime('now')
                WHERE id = ?
            `);
            activateStmt.run(companyId);
        });

        transaction();
    }

    /**
     * Map database row to Company object
     */
    private mapRowToCompany(row: any): Company {
        return {
            id: row.id,
            biller_id: row.biller_id,
            organization_id: row.organization_id,
            tally_id: row.tally_id,
            name: row.name,
            gstin: row.gstin || undefined,
            address: row.address || undefined,
            state: row.state || undefined,
            country: row.country || 'India',
            pin: row.pin || undefined,
            trn: row.trn || undefined,
            book_start_from: row.book_start_from,
            is_active: row.is_active,
            tally_username: row.tally_username || undefined,
            tally_password_encrypted: row.tally_password_encrypted || undefined,
            company_unique_id: row.company_unique_id || undefined,
            last_synced_at: row.last_synced_at || undefined,
            sync_status: (row.sync_status as 'ACTIVE' | 'SYNCING' | 'ERROR' | 'INACTIVE') || 'INACTIVE',
            auto_sync_enabled: row.auto_sync_enabled !== undefined ? row.auto_sync_enabled : 1,
            sync_interval_minutes: row.sync_interval_minutes || 60,
            connection_status: (row.connection_status as 'CONNECTED' | 'DISCONNECTED' | 'ERROR') || 'DISCONNECTED',
            created_at: row.created_at,
            updated_at: row.updated_at
        };
    }
}
