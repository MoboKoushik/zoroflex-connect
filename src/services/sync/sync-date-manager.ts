// src/services/sync/sync-date-manager.ts
import moment from 'moment';
import { DatabaseService } from '../database/database.service';

export type SyncType = 'full' | 'fresh' | 'incremental';
export type EntityType = 'CUSTOMER' | 'INVOICE' | 'PAYMENT' | 'JOURNAL' | 'DEBITNOTE' | 'ALL';

export interface Company {
    id: number;
    biller_id: string;
    organization_id: string;
    tally_id: string;
    name: string;
    book_start_from: string; // YYYY-MM-DD format
    is_active: number;
}

export class SyncDateManager {
    private dbService: DatabaseService;

    constructor(dbService: DatabaseService) {
        this.dbService = dbService;
    }

    /**
     * Get the start date for sync based on sync type
     * @param companyId - The company ID
     * @param entityType - Entity type (CUSTOMER, INVOICE, PAYMENT, etc.)
     * @param syncType - 'full' starts from BOOKSTARTFROM, 'fresh' starts from last_sync_date + 1
     */
    getSyncStartDate(
        companyId: number,
        entityType: EntityType,
        syncType: SyncType
    ): string {
        const company = this.getCompany(companyId);
        if (!company) {
            throw new Error(`Company with id ${companyId} not found`);
        }

        if (syncType === 'full') {
            // Full sync: always start from BOOKSTARTFROM
            return company.book_start_from;
        } else if (syncType === 'fresh') {
            // Fresh sync: start from last_sync_date + 1 day, or BOOKSTARTFROM if no last sync
            const lastSyncDate = this.getLastSyncDate(companyId, entityType);
            if (lastSyncDate) {
                const nextDay = moment(lastSyncDate, 'YYYY-MM-DD').add(1, 'day');
                return nextDay.format('YYYY-MM-DD');
            }
            // If no last sync, use BOOKSTARTFROM from Tally
            return company.book_start_from;
        } else {
            // Incremental sync: use last_sync_date (no +1 day), or BOOKSTARTFROM if no last sync
            const lastSyncDate = this.getLastSyncDate(companyId, entityType);
            if (lastSyncDate) {
                return lastSyncDate;
            }
            // If no last sync, use BOOKSTARTFROM from Tally
            return company.book_start_from;
        }
    }

    /**
     * Get the end date for sync (always current date)
     */
    getSyncEndDate(): string {
        return moment().format('YYYY-MM-DD');
    }

    /**
     * Get company by ID
     */
    private getCompany(companyId: number): Company | null {
        // This will be implemented in database service
        const stmt = this.dbService['db']?.prepare(
            'SELECT * FROM companies WHERE id = ? AND is_active = 1'
        );
        const row = stmt?.get(companyId) as any;
        if (!row) return null;

        return {
            id: row.id,
            biller_id: row.biller_id,
            organization_id: row.organization_id,
            tally_id: row.tally_id,
            name: row.name,
            book_start_from: row.book_start_from,
            is_active: row.is_active
        };
    }

    /**
     * Get last sync date for a company and entity type
     */
    private getLastSyncDate(companyId: number, entityType: EntityType): string | null {
        const db = (this.dbService as any).db;
        if (!db) return null;

        const stmt = db.prepare(
            'SELECT last_sync_date FROM last_sync_dates WHERE company_id = ? AND entity_type = ?'
        );
        const row = stmt.get(companyId, entityType) as any;
        return row?.last_sync_date || null;
    }

    /**
     * Update last sync date for a company and entity type
     */
    updateLastSyncDate(
        companyId: number,
        entityType: EntityType,
        syncDate: string,
        recordsSynced: number = 0
    ): void {
        const db = (this.dbService as any).db;
        if (!db) return;

        const stmt = db.prepare(
            `INSERT OR REPLACE INTO last_sync_dates 
       (company_id, entity_type, last_sync_date, last_sync_timestamp, records_synced)
       VALUES (?, ?, ?, datetime('now'), ?)`
        );
        stmt.run(companyId, entityType, syncDate, recordsSynced);
    }

    /**
     * Format date from Tally format to YYYY-MM-DD
     */
    formatTallyDate(tallyDate: string): string {
        // Handle various Tally date formats
        // Examples: "1-4-2019", "01-04-2019", "2019-04-01"
        if (!tallyDate || tallyDate.trim() === '') {
            return moment().format('YYYY-MM-DD');
        }

        // Try parsing different formats
        const formats = [
            'D-M-YYYY',
            'DD-MM-YYYY',
            'YYYY-MM-DD',
            'D/M/YYYY',
            'DD/MM/YYYY'
        ];

        for (const format of formats) {
            const parsed = moment(tallyDate, format, true);
            if (parsed.isValid()) {
                return parsed.format('YYYY-MM-DD');
            }
        }

        // If all formats fail, try to parse as-is
        const parsed = moment(tallyDate);
        if (parsed.isValid()) {
            return parsed.format('YYYY-MM-DD');
        }

        // Fallback to current date
        return moment().format('YYYY-MM-DD');
    }
}
