import axios from 'axios';
import fs from 'fs';
import { parseStringPromise } from 'xml2js';

export async function fetchCurrentCompany() {
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
            <!-- Explicitly fetch the Tally Serial Number (License ID) -->
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

    try {
        const response = await axios.post('http://localhost:9000', xmlRequest, {
            headers: { 'Content-Type': 'text/xml' }
        });

        const parsed = await parseStringPromise(response.data);

        // Save raw response for debugging
        const rawFile = './dump/company/current_company_raw.json';
        fs.writeFileSync(rawFile, JSON.stringify(parsed, null, 2), 'utf8');

        // Extract the current company (only one due to BELONGSTO>Yes)
        const collection = parsed.ENVELOPE?.BODY?.[0]?.DATA?.[0]?.COLLECTION?.[0];
        const companiesXml = collection?.COMPANY || [];

        if (companiesXml.length === 0) {
            console.log('No company is currently loaded in Tally Prime.');
            return null;
        }

        const companyInfo = companiesXml[0];

        const currentCompany: Record<string, any> = {};

        // Handle attributes (rare for Company object, but kept for completeness)
        if (companyInfo.$) {
            Object.keys(companyInfo.$).forEach(attrKey => {
                currentCompany[attrKey.toUpperCase()] = companyInfo.$[attrKey];
            });
        }

        // Handle child elements and lists
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

        const fileName = './dump/company/current_company.json';
        fs.writeFileSync(fileName, JSON.stringify(currentCompany, null, 2), 'utf8');

        return currentCompany;
    } catch (error: any) {
        console.error('Error fetching current company:', error?.message || error);
        throw error;
    }
}