import axios from 'axios';
import fs from 'fs';
import { parseStringPromise } from 'xml2js';

export async function getMinMaxAlterId() {
    const xml = `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>LedgerAlterIDs</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="LedgerAlterIDs">
            <TYPE>Ledger</TYPE>
            <FETCH>ALTERID</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>
`.trim();

    try {
        const response = await axios.post('http://localhost:9000', xml, {
            headers: { 'Content-Type': 'text/xml' }
        });

        const parsed = await parseStringPromise(response.data);
        const all_ledgers_data = './dump/max_min/max_min.json';
        fs.writeFileSync(all_ledgers_data, JSON.stringify(parsed, null, 2), 'utf8');
        console.log('Parsed Response:', JSON.stringify(parsed, null, 2));

        // Extract all ALTERID values from LEDGER array
        const ledgers = parsed?.ENVELOPE?.BODY?.[0]?.DATA?.[0]?.COLLECTION?.[0]?.LEDGER || [];
        const alterIds = ledgers
            .map((ledger: any) => ledger.ALTERID?.[0]?._ || '0')  // Handle <ALTERID _="123" TYPE="Number">
            .map((id: number) => Number(id))
            .filter((id: any) => !isNaN(id) && id > 0);

        const maxAlterId = alterIds.length > 0 ? Math.max(...alterIds) : 0;
        const minAlterId = alterIds.length > 0 ? Math.min(...alterIds) : 0;

        console.log(`Max ALTERID: ${maxAlterId}`);
        console.log(`Min ALTERID: ${minAlterId}`);

        return { max: maxAlterId, min: minAlterId };
    } catch (error: any) {
        console.error('Error fetching ALTERIDs:', error.message || error);
        throw error;
    }
}
