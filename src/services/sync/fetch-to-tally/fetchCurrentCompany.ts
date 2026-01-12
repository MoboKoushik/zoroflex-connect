import { DatabaseService } from '../../database/database.service';
import {
    fetchOrganizationFromReport,
    extractBillersFromReport,
    getReportText
} from '../../tally/batch-fetcher';

const db = new DatabaseService();

const ENTITY_TYPE = 'ORGANIZATION';

export async function fetchCurrentCompany(): Promise<Record<string, any> | null> {
    const runId = await db.logSyncStart('BACKGROUND', ENTITY_TYPE);

    try {
        db.log('INFO', 'Fetching current company from Tally using ZeroFinnCmp report');

        // Fetch organization data using ZeroFinnCmp report
        const parsed = await fetchOrganizationFromReport();
        const billers = extractBillersFromReport(parsed);

        if (billers.length === 0) {
            const message = 'No company is currently loaded in Tally Prime.';
            db.log('WARN', message);
            await db.logSyncEnd(runId, 'FAILED', 0, 0, undefined, message);
            return null;
        }

        // Get existing organization data from profile
        const profile = await db.getProfile();
        const profileBillerId = profile?.biller_id?.trim() || '';

        // Handle multiple BILLER entries
        let selectedBiller: any = null;
        let gstinFromOtherBiller: string = '';

        if (billers.length === 1) {
            selectedBiller = billers[0];
        } else {
            // Multiple entries - need to select the right one
            // First, try to match by BILLER_ID from profile
            if (profileBillerId) {
                selectedBiller = billers.find((biller: any) => {
                    const billerId = getReportText(biller, 'BILLER_ID');
                    return billerId && billerId.trim() === profileBillerId;
                });
            }

            // If no match found, prefer entry with GSTIN
            if (!selectedBiller) {
                selectedBiller = billers.find((biller: any) => {
                    const gstin = getReportText(biller, 'GSTIN');
                    return gstin && gstin.trim() !== '';
                });
            }

            // If still no match, use first entry
            if (!selectedBiller) {
                selectedBiller = billers[0];
            }

            // If selected BILLER has empty GSTIN, check other entries with same ORGANIZATION_ID for GSTIN
            const selectedOrgId = getReportText(selectedBiller, 'ORGANIZATION_ID');
            const selectedGstin = getReportText(selectedBiller, 'GSTIN');

            if ((!selectedGstin || selectedGstin.trim() === '') && selectedOrgId) {
                const otherBillerWithGstin = billers.find((biller: any) => {
                    const orgId = getReportText(biller, 'ORGANIZATION_ID');
                    const gstin = getReportText(biller, 'GSTIN');
                    return orgId === selectedOrgId && gstin && gstin.trim() !== '';
                });

                if (otherBillerWithGstin) {
                    gstinFromOtherBiller = getReportText(otherBillerWithGstin, 'GSTIN');
                }
            }
        }

        // Get GSTIN - use from other BILLER if selected one doesn't have it
        const selectedGstin = getReportText(selectedBiller, 'GSTIN');
        const finalGstin = gstinFromOtherBiller || selectedGstin;

        // Map BILLER fields to company data structure
        const currentCompany: Record<string, any> = {
            NAME: getReportText(selectedBiller, 'NAME'),
            COMPANYNUMBER: getReportText(selectedBiller, 'ORGANIZATION_ID'),
            BASICCOMPANYFORMALNAME: getReportText(selectedBiller, 'TALLY_ID'),
            ADDRESS: getReportText(selectedBiller, 'ADDRESS'),
            STATENAME: getReportText(selectedBiller, 'STATE'),
            COUNTRYNAME: getReportText(selectedBiller, 'COUNTRY'),
            PINCODE: getReportText(selectedBiller, 'PIN'),
            GSTREGISTRATIONNUMBER: finalGstin, // Use GSTIN from other BILLER if available
            VATNUMBER: getReportText(selectedBiller, 'VATNUMBER'),
            TAXUNITNAME: getReportText(selectedBiller, 'TAXUNITNAME'),
            BOOKSTARTFROM: getReportText(selectedBiller, 'BOOKSTARTFROM'),
            // Store BILLER data for reference
            BILLER_DATA: {
                BILLER_ID: getReportText(selectedBiller, 'BILLER_ID'),
                NAME: getReportText(selectedBiller, 'NAME'),
                ORGANIZATION_ID: getReportText(selectedBiller, 'ORGANIZATION_ID'),
                TALLY_ID: getReportText(selectedBiller, 'TALLY_ID'),
                ADDRESS: getReportText(selectedBiller, 'ADDRESS'),
                STATE: getReportText(selectedBiller, 'STATE'),
                COUNTRY: getReportText(selectedBiller, 'COUNTRY'),
                PIN: getReportText(selectedBiller, 'PIN'),
                VATNUMBER: getReportText(selectedBiller, 'VATNUMBER'),
                GSTIN: finalGstin, // Use GSTIN from other BILLER if available
                TAXUNITNAME: getReportText(selectedBiller, 'TAXUNITNAME'),
                BOOKSTARTFROM: getReportText(selectedBiller, 'BOOKSTARTFROM')
            }
        };

        // Set TALLY_LICENSE_ID (use TALLY_ID from BILLER)
        currentCompany.TALLY_LICENSE_ID = currentCompany.BASICCOMPANYFORMALNAME || '';

        db.log('INFO', 'Current company fetched successfully', {
            company_name: currentCompany.NAME,
            organization_id: currentCompany.COMPANYNUMBER,
            tally_id: currentCompany.BASICCOMPANYFORMALNAME,
            biller_id: getReportText(selectedBiller, 'BILLER_ID'),
            selected_from: billers.length > 1 ? `${billers.length} entries (matched by ${profileBillerId ? 'biller_id' : 'GSTIN'})` : 'single entry'
        });

        await db.logSyncEnd(runId, 'SUCCESS', 1, 0, undefined, 'Company data fetched');
        await db.updateLastSuccessfulSync();

        return currentCompany;

    } catch (error: any) {
        const errorMsg = error?.message || 'Unknown error while fetching company';
        db.log('ERROR', 'Failed to fetch current company', { error: errorMsg });
        await db.logSyncEnd(runId, 'FAILED', 0, 0, undefined, errorMsg);
        throw error;
    }
}