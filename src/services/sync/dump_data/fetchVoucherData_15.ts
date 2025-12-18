// import axios from 'axios';
// import fs from 'fs';
// import { parseStringPromise } from 'xml2js';  // Correct import for named export

// export async function fetchAllLedgers() {
//     const xmlRequest = `
// <ENVELOPE>
//   <HEADER>
//     <VERSION>1</VERSION>
//     <TALLYREQUEST>Export</TALLYREQUEST>
//     <TYPE>Collection</TYPE>
//     <ID>AllLedgers</ID>
//   </HEADER>
//   <BODY>
//     <DESC>
//       <STATICVARIABLES>
//         <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
//       </STATICVARIABLES>
//       <TDL>
//         <TDLMESSAGE>
//           <COLLECTION NAME="AllLedgers">
//             <TYPE>Ledger</TYPE>
//             <NATIVEMETHOD>NAME</NATIVEMETHOD>
//             <NATIVEMETHOD>GUID</NATIVEMETHOD>
//             <NATIVEMETHOD>MASTERID</NATIVEMETHOD>
//             <NATIVEMETHOD>ALTERID</NATIVEMETHOD>
//             <NATIVEMETHOD>*</NATIVEMETHOD>  <!-- Fetches all other available fields -->
//           </COLLECTION>
//         </TDLMESSAGE>
//       </TDL>
//     </DESC>
//   </BODY>
// </ENVELOPE>`.trim();

//     try {
//         const response = await axios.post('http://localhost:9000', xmlRequest, {
//             headers: { 'Content-Type': 'text/xml' }
//         });

//         const parsed = await parseStringPromise(response.data);

//         // Extract ledgers from the response structure
//         const collection = parsed.ENVELOPE?.BODY?.[0]?.DATA?.[0]?.COLLECTION?.[0];
//         const ledgersXml = collection?.LEDGER || [];

//         const ledgersJson = ledgersXml.map((ledger: any) => {
//             const obj: Record<string, any> = {};

//             // Handle attributes on <LEDGER> tag (GUID is often here in some responses)
//             if (ledger.$) {
//                 Object.keys(ledger.$).forEach(attrKey => {
//                     obj[attrKey.toUpperCase()] = ledger.$[attrKey];
//                 });
//             }

//             // Handle child elements (most fields, including GUID, MASTERID, ALTERID when fetched)
//             Object.keys(ledger).forEach(key => {
//                 if (key === '$') return;  // Skip attributes
//                 const value = ledger[key];

//                 // Handle lists (e.g., ADDRESS.LIST, BILLALLOCATIONS.LIST)
//                 if (key.endsWith('.LIST') && Array.isArray(value)) {
//                     const baseKey = key.replace('.LIST', '');
//                     obj[baseKey] = value.map((item: any) => {
//                         const subObj: Record<string, any> = {};

//                         // Attributes on list items
//                         if (item.$) {
//                             Object.keys(item.$).forEach(subAttr => {
//                                 subObj[subAttr.toUpperCase()] = item.$[subAttr];
//                             });
//                         }

//                         // Child elements in list items
//                         Object.keys(item).forEach(subKey => {
//                             if (subKey !== '$' && Array.isArray(item[subKey]) && item[subKey].length > 0) {
//                                 subObj[subKey] = item[subKey][0];
//                             }
//                         });

//                         return subObj;
//                     });
//                 } else if (Array.isArray(value) && value.length > 0) {
//                     obj[key] = value[0];
//                 }
//             });

//             return obj;
//         });

//         // Save to file and log
//         const fileName = 'all_ledgers.json';
//         fs.writeFileSync(fileName, JSON.stringify(ledgersJson, null, 2), 'utf8');
//         console.log(`Ledgers data saved to ${fileName}`);
//         console.log(`Total ledgers fetched: ${ledgersJson.length}`);

//         return ledgersJson;
//     } catch (error: any) {
//         console.error('Error fetching ledgers:', error?.message || error);
//         throw error;
//     }
// }




import axios from 'axios';
import fs from 'fs';
import { parseStringPromise } from 'xml2js';

export async function fetchAllLedgers() {
    const xmlRequest = `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>SundryDebtorsWithBills</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="SundryDebtorsWithBills" ISINITIALIZE="Yes">
            <TYPE>Ledger</TYPE>
            <BELONGSTO>Yes</BELONGSTO>
            <CHILDOF>$$GroupSundryDebtors</CHILDOF>
            <NATIVEMETHOD>Name</NATIVEMETHOD>
            <NATIVEMETHOD>Parent</NATIVEMETHOD>
            <NATIVEMETHOD>OpeningBalance</NATIVEMETHOD>
            <NATIVEMETHOD>ClosingBalance</NATIVEMETHOD>
            <NATIVEMETHOD>GUID</NATIVEMETHOD>
            <NATIVEMETHOD>MASTERID</NATIVEMETHOD>
            <NATIVEMETHOD>ALTERID</NATIVEMETHOD>
            <NATIVEMETHOD>LedgerPhone</NATIVEMETHOD>
            <NATIVEMETHOD>LedgerMobile</NATIVEMETHOD>
            <NATIVEMETHOD>Email</NATIVEMETHOD>
            <NATIVEMETHOD>*</NATIVEMETHOD>
            <FETCH>Name</FETCH>
            <FETCH>Parent</FETCH>
            <FETCH>OpeningBalance</FETCH>
            <FETCH>ClosingBalance</FETCH>
            <FETCH>GUID</FETCH>
            <FETCH>MASTERID</FETCH>
            <FETCH>ALTERID</FETCH>
            <FETCH>LedgerPhone</FETCH>
            <FETCH>LedgerMobile</FETCH>
            <FETCH>Email</FETCH>
            <FETCH>AllBillAllocations.*</FETCH>
            <FETCH>BillAllocations.*</FETCH>
            <FETCH>OpeningBillAllocations.*</FETCH>
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

        const all_customers = 'all_customers.json';
        fs.writeFileSync(all_customers, JSON.stringify(parsed, null, 2), 'utf8');

        console.log('Parsed XML structure:', JSON.stringify(parsed, null, 2));


        const collection = parsed.ENVELOPE?.BODY?.[0]?.DATA?.[0]?.COLLECTION?.[0];
        const ledgersXml = collection?.LEDGER || [];

        console.log(`Total ledgers fetched from XML: ${ledgersXml.length}`);

        const customers = ledgersXml.map((ledger: any) => {
            const obj: Record<string, any> = {
                name: '',
                email: '',
                phone: '',
                mobile: '',
                company_name: '',  // May not be directly available; adjust if needed
                customer_id: '',   // Use MASTERID or custom field
                biller_id: null,
                current_balance: 0,
                current_balance_at: new Date().toISOString().split('T')[0] + ' ' + new Date().toLocaleTimeString(),
                opening_balance: 0,
                invoice_details: []
            };

            // Handle attributes (e.g., GUID)
            if (ledger.$) {
                Object.keys(ledger.$).forEach(attrKey => {
                    obj[attrKey.toUpperCase()] = ledger.$[attrKey];
                });
            }

            // Process child elements
            Object.keys(ledger).forEach(key => {
                if (key === '$') return;
                const value = ledger[key];

                if (key === 'NAME') obj.name = value[0];
                if (key === 'EMAIL') obj.email = value[0] || '';
                if (key === 'LEDGERPHONE') obj.phone = value[0] || '';
                if (key === 'LEDGERMOBILE') obj.mobile = value[0] || '';
                if (key === 'MASTERID') obj.customer_id = value[0];
                if (key === 'OPENINGBALANCE') {
                    let bal = parseFloat(value[0]) || 0;
                    obj.opening_balance = Math.abs(bal);
                }
                if (key === 'CLOSINGBALANCE') {
                    let bal = parseFloat(value[0]) || 0;
                    obj.current_balance = Math.abs(bal);
                }

                // Handle bill allocations (opening bill-wise details)
                if (key.endsWith('BILLALLOCATIONS.LIST') || key.endsWith('OPENINGBILLALLOCATIONS.LIST') || key === 'ALLBILLALLOCATIONS.LIST') {
                    if (Array.isArray(value)) {
                        value.forEach((billList: any) => {
                            if (Array.isArray(billList)) {
                                billList.forEach((bill: any) => {
                                    const invoice = {
                                        invoice_number: bill.NAME?.[0] || bill.BILLREF?.[0] || 'Opening Bill',
                                        invoice_date: bill.DATE?.[0] || 'Previous Year',
                                        amount: Math.abs(parseFloat(bill.AMOUNT?.[0]) || 0)
                                    };
                                    obj.invoice_details.push(invoice);
                                });
                            }
                        });
                    }
                }
            });

            return obj;
        }).filter((c: any) => c.name);  // Filter valid customers

        const result = { customer: customers };

        const fileName = 'customers_with_previous_invoices.json';
        fs.writeFileSync(fileName, JSON.stringify(result, null, 2), 'utf8');
        console.log(`Customer data saved to ${fileName}`);
        console.log(`Total customers fetched: ${customers.length}`);

        return result;
    } catch (error: any) {
        console.error('Error fetching customer data:', error?.message || error);
        throw error;
    }
}