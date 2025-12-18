import axios from 'axios';
import fs from 'fs';
import { parseStringPromise } from 'xml2js';  // Correct import for named export

export async function fetchAllLedgersOpening() {
    const xmlRequest = `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>LedgersWithBillwise</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="LedgersWithBillwise">
            <TYPE>Ledger</TYPE>
            <NATIVEMETHOD>NAME</NATIVEMETHOD>
            <NATIVEMETHOD>PARENT</NATIVEMETHOD>
            <NATIVEMETHOD>OPENINGBALANCE</NATIVEMETHOD>
            <NATIVEMETHOD>CLOSINGBALANCE</NATIVEMETHOD>
            <NATIVEMETHOD>GUID</NATIVEMETHOD>
            <NATIVEMETHOD>MASTERID</NATIVEMETHOD>
            <NATIVEMETHOD>ALTERID</NATIVEMETHOD>
            <NATIVEMETHOD>*</NATIVEMETHOD>
            <FETCH>OpeningBalance</FETCH>
            <FETCH>ClosingBalance</FETCH>
            <FETCH>OpeningBillAllocations.*</FETCH>
            <FETCH>BillAllocations.*</FETCH>
            <FETCH>AllBillAllocations.*</FETCH>
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

        const all_ledgers_data = './dump/ledger-opening-and-current-balence/all_ledgers_data.json';
        fs.writeFileSync(all_ledgers_data, JSON.stringify(parsed, null, 2), 'utf8');

        // Extract ledgers from the response structure
        const collection = parsed.ENVELOPE?.BODY?.[0]?.DATA?.[0]?.COLLECTION?.[0];
        const ledgersXml = collection?.LEDGER || [];

        const ledgersJson = ledgersXml.map((ledger: any) => {
            const obj: Record<string, any> = {};

            // Handle attributes on <LEDGER> tag (GUID is often here in some responses)
            if (ledger.$) {
                Object.keys(ledger.$).forEach(attrKey => {
                    obj[attrKey.toUpperCase()] = ledger.$[attrKey];
                });
            }

            // Handle child elements (most fields, including GUID, MASTERID, ALTERID when fetched)
            Object.keys(ledger).forEach(key => {
                if (key === '$') return;  // Skip attributes
                const value = ledger[key];

                // Handle lists (e.g., ADDRESS.LIST, BILLALLOCATIONS.LIST)
                if (key.endsWith('.LIST') && Array.isArray(value)) {
                    const baseKey = key.replace('.LIST', '');
                    obj[baseKey] = value.map((item: any) => {
                        const subObj: Record<string, any> = {};

                        // Attributes on list items
                        if (item.$) {
                            Object.keys(item.$).forEach(subAttr => {
                                subObj[subAttr.toUpperCase()] = item.$[subAttr];
                            });
                        }

                        // Child elements in list items
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

        // Save to file and log
        const fileName = './dump/ledger-opening-and-current-balence/all_ledgers.json';
        fs.writeFileSync(fileName, JSON.stringify(ledgersJson, null, 2), 'utf8');
        console.log(`Ledgers data saved to ${fileName}`);
        console.log(`Total ledgers fetched: ${ledgersJson.length}`);

        return ledgersJson;
    } catch (error: any) {
        console.error('Error fetching ledgers:', error?.message || error);
        throw error;
    }
}