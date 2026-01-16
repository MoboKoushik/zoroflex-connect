// src/services/sync/fetch-to-tally/fetchCompanies.ts
import {
    fetchOrganizationFromReport,
    extractBillersFromReport,
    getReportText
} from '../../tally/batch-fetcher';
import { DatabaseService } from '../../database/database.service';
import moment from 'moment';

export interface TallyBiller {
    BILLER_ID: string;
    NAME: string;
    ORGANIZATION_ID: string;
    TALLY_ID: string;
    ADDRESS: string;
    STATE: string;
    COUNTRY: string;
    PIN: string;
    VATNUMBER: string;
    GSTIN: string;
    TAXUNITNAME: string;
    BOOKSTARTFROM: string;
}

export interface CompanyData {
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
}

/**
 * Format date from Tally format to YYYY-MM-DD
 */
function formatTallyDate(tallyDate: string): string {
    if (!tallyDate || tallyDate.trim() === '') {
        return moment().format('YYYY-MM-DD');
    }

    // Handle formats like "1-4-2019", "01-04-2019"
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

    // Try parsing as-is
    const parsed = moment(tallyDate);
    if (parsed.isValid()) {
        return parsed.format('YYYY-MM-DD');
    }

    // Fallback to current date
    return moment().format('YYYY-MM-DD');
}

/**
 * Fetch all companies (BILLER entries) from Tally using ZeroFinnCmp report
 */
export async function fetchCompanies(dbService?: DatabaseService): Promise<CompanyData[]> {
    const db = dbService || new DatabaseService();
    try {
        db.log('INFO', 'Fetching companies from Tally using ZeroFinnCmp report');

        // Fetch organization data using ZeroFinnCmp report
        const parsed = await fetchOrganizationFromReport();
        console.log('fetchCompanies - Parsed response received, extracting billers...');
        
        const billers = extractBillersFromReport(parsed);
        console.log(`fetchCompanies - Extracted ${billers.length} billers`);

        if (billers.length === 0) {
            db.log('WARN', 'No companies found in Tally');
            console.warn('fetchCompanies - No billers found. Parsed structure:', JSON.stringify(parsed, null, 2).substring(0, 1000));
            return [];
        }

        db.log('INFO', `Found ${billers.length} companies in Tally`);

        // Map BILLER entries to CompanyData
        const companies: CompanyData[] = billers.map((biller: any) => {
            const bookStartFrom = getReportText(biller, 'BOOKSTARTFROM');
            const formattedDate = formatTallyDate(bookStartFrom);

            const companyData = {
                biller_id: getReportText(biller, 'BILLER_ID'),
                organization_id: getReportText(biller, 'ORGANIZATION_ID'),
                tally_id: getReportText(biller, 'TALLY_ID'),
                name: getReportText(biller, 'NAME'),
                gstin: getReportText(biller, 'GSTIN') || undefined,
                address: getReportText(biller, 'ADDRESS') || undefined,
                state: getReportText(biller, 'STATE') || undefined,
                country: getReportText(biller, 'COUNTRY') || 'India',
                pin: getReportText(biller, 'PIN') || undefined,
                trn: getReportText(biller, 'VATNUMBER') || undefined,
                book_start_from: formattedDate
            };
            
            console.log('fetchCompanies - Mapped company:', {
                name: companyData.name,
                biller_id: companyData.biller_id,
                organization_id: companyData.organization_id
            });
            
            return companyData;
        });

        // If multiple entries have same ORGANIZATION_ID, prefer the one with GSTIN
        const companiesByOrg = new Map<string, CompanyData[]>();
        companies.forEach(company => {
            const key = company.organization_id;
            if (!companiesByOrg.has(key)) {
                companiesByOrg.set(key, []);
            }
            companiesByOrg.get(key)!.push(company);
        });

        // For each organization, if there are multiple entries, prefer one with GSTIN
        const finalCompanies: CompanyData[] = [];
        companiesByOrg.forEach((orgCompanies, orgId) => {
            if (orgCompanies.length === 1) {
                finalCompanies.push(orgCompanies[0]);
            } else {
                // Multiple entries - prefer one with GSTIN
                const withGstin = orgCompanies.find(c => c.gstin && c.gstin.trim() !== '');
                finalCompanies.push(withGstin || orgCompanies[0]);
            }
        });

        db.log('INFO', `Processed ${finalCompanies.length} unique companies`);
        console.log(`fetchCompanies - Final companies count: ${finalCompanies.length}`);
        return finalCompanies;

    } catch (error: any) {
        const errorMsg = error?.message || 'Unknown error while fetching companies';
        console.error('fetchCompanies - Error:', errorMsg, error);
        db.log('ERROR', 'Failed to fetch companies from Tally', { 
            error: errorMsg,
            stack: error.stack,
            code: error.code
        });
        throw error;
    }
}

/**
 * Fetch companies and save to database
 */
export async function fetchAndSaveCompanies(billerId: string, dbService?: DatabaseService): Promise<CompanyData[]> {
    const companies = await fetchCompanies(dbService);

    // Filter companies by biller_id if provided
    const filteredCompanies = billerId
        ? companies.filter(c => c.biller_id === billerId)
        : companies;

    // Save to database (will be done via repository in main process)
    return filteredCompanies;
}
