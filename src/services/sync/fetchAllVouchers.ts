import axios from 'axios';
import fs from 'fs';
import { parseStringPromise } from 'xml2js';

export async function fetchAllVouchers() {
    const xmlRequest = `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>AllVouchers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="AllVouchers">
            <TYPE>Voucher</TYPE>
            <NATIVEMETHOD>DATE</NATIVEMETHOD>
            <NATIVEMETHOD>VOUCHERNUMBER</NATIVEMETHOD>
            <NATIVEMETHOD>VOUCHERTYPENAME</NATIVEMETHOD>
            <NATIVEMETHOD>PARTYLEDGERNAME</NATIVEMETHOD>
            <NATIVEMETHOD>AMOUNT</NATIVEMETHOD>
            <NATIVEMETHOD>GUID</NATIVEMETHOD>
            <NATIVEMETHOD>MASTERID</NATIVEMETHOD>
            <NATIVEMETHOD>ALTERID</NATIVEMETHOD>
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
        const rawFile = './dump/voucher/all_vouchers_raw.json';
        fs.writeFileSync(rawFile, JSON.stringify(parsed, null, 2), 'utf8');

        // Extract vouchers from the response structure
        const collection = parsed.ENVELOPE?.BODY?.[0]?.DATA?.[0]?.COLLECTION?.[0];
        const vouchersXml = collection?.VOUCHER || [];

        const vouchersJson = vouchersXml.map((voucher: any) => {
            const obj: Record<string, any> = {};

            // Handle attributes on <VOUCHER> tag (e.g., VCHKEY, ACTION, etc.)
            if (voucher.$) {
                Object.keys(voucher.$).forEach(attrKey => {
                    obj[attrKey.toUpperCase()] = voucher.$[attrKey];
                });
            }

            // Handle child elements
            Object.keys(voucher).forEach(key => {
                if (key === '$') return;  // Skip attributes
                const value = voucher[key];

                // Handle repeated list nodes (e.g., ALLLEDGERENTRIES.LIST, ALLINVENTORYENTRIES.LIST)
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

        // Save processed JSON
        const fileName = './dump/voucher/all_vouchers.json';
        fs.writeFileSync(fileName, JSON.stringify(vouchersJson, null, 2), 'utf8');
        console.log(`Vouchers data saved to ${fileName}`);
        console.log(`Total vouchers fetched: ${vouchersJson.length}`);

        return vouchersJson;
    } catch (error: any) {
        console.error('Error fetching vouchers:', error?.message || error);
        throw error;
    }
}