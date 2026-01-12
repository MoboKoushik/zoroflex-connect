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
}

export class CompanyRepository {
    private db: Database.Database;

    constructor(dbService: DatabaseService) {
        this.db = dbService['db'] as Database.Database;
    }

    /**
     * Create or update a company
     */
    async upsertCompany(data: CreateCompanyData): Promise<Company> {
        const stmt = this.db.prepare(`
      INSERT INTO companies (
        biller_id, organization_id, tally_id, name, gstin, address,
        state, country, pin, trn, book_start_from, is_active, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
      ON CONFLICT(biller_id, organization_id) DO UPDATE SET
        tally_id = excluded.tally_id,
        name = excluded.name,
        gstin = excluded.gstin,
        address = excluded.address,
        state = excluded.state,
        country = excluded.country,
        pin = excluded.pin,
        trn = excluded.trn,
        book_start_from = excluded.book_start_from,
        updated_at = datetime('now')
    `);

        stmt.run(
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
            data.book_start_from
        );

        return this.getCompanyByBillerAndOrg(data.biller_id, data.organization_id)!;
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
     * Get all companies for a biller
     */
    getAllCompanies(billerId: string): Company[] {
        const stmt = this.db.prepare(
            'SELECT * FROM companies WHERE biller_id = ? ORDER BY name'
        );
        const rows = stmt.all(billerId) as any[];
        return rows.map(row => this.mapRowToCompany(row));
    }

    /**
     * Set company as active (deactivate others)
     */
    setActiveCompany(companyId: number, billerId: string): void {
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
            created_at: row.created_at,
            updated_at: row.updated_at
        };
    }
}
