import axios from 'axios';
import fs from 'fs';
import { parseStringPromise } from 'xml2js';
import { DatabaseService } from '../../database/database.service';

const db = new DatabaseService();

const ENTITY_TYPE = 'ORGANIZATION';

export async function fetchCurrentCompany(): Promise<Record<string, any> | null> {
    const runId = await db.logSyncStart('BACKGROUND', ENTITY_TYPE);

    try {
        db.log('INFO', 'Fetching current company from Tally');

        const xmlRequest = `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>CurrentCompany</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="CurrentCompany" ISINITIALIZE="Yes">
            <TYPE>Company</TYPE>
            <BELONGSTO>Yes</BELONGSTO>
            <NATIVEMETHOD>*</NATIVEMETHOD>
            <NATIVEMETHOD>TallySerialNumber</NATIVEMETHOD>
            <NATIVEMETHOD>TallyLicenseID</NATIVEMETHOD>
            <NATIVEMETHOD>SerialNumber</NATIVEMETHOD>
            <NATIVEMETHOD>LicenseID</NATIVEMETHOD>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`.trim();

        const response = await axios.post('http://localhost:9000', xmlRequest, {
            headers: { 'Content-Type': 'text/xml' },
            timeout: 15000
        });

        const parsed = await parseStringPromise(response.data);
        const collection = parsed.ENVELOPE?.BODY?.[0]?.DATA?.[0]?.COLLECTION?.[0];
        const companiesXml = collection?.COMPANY || [];

        if (companiesXml.length === 0) {
            const message = 'No company is currently loaded in Tally Prime.';
            db.log('WARN', message);
            await db.logSyncEnd(runId, 'FAILED', 0, 0, undefined, message);
            return null;
        }

        const companyInfo = companiesXml[0];
        const currentCompany: Record<string, any> = {};

        if (companyInfo.$) {
            Object.keys(companyInfo.$).forEach(attrKey => {
                currentCompany[attrKey.toUpperCase()] = companyInfo.$[attrKey];
            });
        }

        Object.keys(companyInfo).forEach(key => {
            if (key === '$') return;
            const value = companyInfo[key];

            if (key.endsWith('.LIST') && Array.isArray(value)) {
                const baseKey = key.replace('.LIST', '');
                currentCompany[baseKey] = value.map((item: any) => {
                    const subObj: Record<string, any> = {};
                    if (item.$) {
                        Object.keys(item.$).forEach(subAttr => {
                            subObj[subAttr.toUpperCase()] = item.$[subAttr];
                        });
                    }
                    Object.keys(item).forEach(subKey => {
                        if (subKey !== '$' && Array.isArray(item[subKey]) && item[subKey].length > 0) {
                            subObj[subKey] = item[subKey][0];
                        }
                    });
                    return subObj;
                });
            } else if (Array.isArray(value) && value.length > 0) {
                currentCompany[key] = value[0];
            }
        });

        currentCompany.TALLY_LICENSE_ID =
            currentCompany.TALLYSERIALNUMBER ||
            currentCompany.SERIALNUMBER ||
            currentCompany.TALLYLICENSEID ||
            currentCompany.LICENSEID ||
            '';


        db.log('INFO', 'Current company fetched successfully', {
            company_name: currentCompany.NAME,
            tally_id: currentCompany.BASICCOMPANYFORMALNAME || currentCompany.NAME,
            license_id: currentCompany.TALLY_LICENSE_ID
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