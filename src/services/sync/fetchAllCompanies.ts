import axios from 'axios';
import fs from 'fs';
import { parseStringPromise } from 'xml2js';

export async function fetchAllCompanies() {
    const xmlRequest = `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>AllCompanies</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="AllCompanies">
            <TYPE>Company</TYPE>
            <NATIVEMETHOD>NAME</NATIVEMETHOD>
            <NATIVEMETHOD>GUID</NATIVEMETHOD>
            <NATIVEMETHOD>STARTINGFROM</NATIVEMETHOD>
            <NATIVEMETHOD>BOOKSFROM</NATIVEMETHOD>
            <NATIVEMETHOD>FINANCIALYEARFROM</NATIVEMETHOD>
            <NATIVEMETHOD>ENDINGAT</NATIVEMETHOD>
            <NATIVEMETHOD>COMPANYADDRESS</NATIVEMETHOD>
            <NATIVEMETHOD>COMPANYEMAIL</NATIVEMETHOD>
            <NATIVEMETHOD>COMPANYPHONE</NATIVEMETHOD>
            <NATIVEMETHOD>GSTIN</NATIVEMETHOD>
            <NATIVEMETHOD>PAN</NATIVEMETHOD>
            <NATIVEMETHOD>*</NATIVEMETHOD>  <!-- Fetches all other available fields -->
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

        // Save raw parsed XML structure for debugging
        const rawFile = './dump/company/all_companies_raw.json';
        fs.writeFileSync(rawFile, JSON.stringify(parsed, null, 2), 'utf8');

        // Extract companies from the response structure
        const collection = parsed.ENVELOPE?.BODY?.[0]?.DATA?.[0]?.COLLECTION?.[0];
        const companiesXml = collection?.COMPANY || [];

        const companiesJson = companiesXml.map((company: any) => {
            const obj: Record<string, any> = {};

            // Handle attributes on <COMPANY> tag (if any)
            if (company.$) {
                Object.keys(company.$).forEach(attrKey => {
                    obj[attrKey.toUpperCase()] = company.$[attrKey];
                });
            }

            // Handle child elements
            Object.keys(company).forEach(key => {
                if (key === '$') return;  // Skip attributes
                const value = company[key];

                // Handle lists (e.g., ADDRESS.LIST if multi-line address)
                if (key.endsWith('.LIST') && Array.isArray(value)) {
                    const baseKey = key.replace('.LIST', '');
                    obj[baseKey] = value.map((item: any) => {
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
                    obj[key] = value[0];
                }
            });

            return obj;
        });

        // Save processed JSON
        const fileName = './dump/company/all_companies.json';
        fs.writeFileSync(fileName, JSON.stringify(companiesJson, null, 2), 'utf8');
        console.log(`Companies data saved to ${fileName}`);
        console.log(`Total companies fetched: ${companiesJson.length}`);

        return companiesJson;
    } catch (error: any) {
        console.error('Error fetching companies:', error?.message || error);
        throw error;
    }
}