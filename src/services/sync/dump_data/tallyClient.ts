// ------------------------------
// TallyPrime XML API Client (TS)
// ------------------------------

export async function fetchFromTally(xml: string): Promise<string> {
  try {
    const response = await fetch("http://localhost:9000", {
      method: "POST",
      headers: {
        "Content-Type": "text/xml"
      },
      body: xml
    });

    if (!response.ok) {
      throw new Error(`Tally Error: ${response.statusText}`);
    }

    const text = await response.text();
    return text;

  } catch (err) {
    console.error("Tally Fetch Error:", err);
    throw err;
  }
}


// -------------------------------------
// Example XML Requests (Use as needed)
// -------------------------------------

export const XML_COMPANY_LIST = `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Companies</REPORTNAME>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>
`;


export const XML_LEDGER_LIST = `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Ledger List</REPORTNAME>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>
`;


export const XML_SALES_VOUCHERS = `
<ENVELOPE>
 <HEADER>
  <TALLYREQUEST>Export Data</TALLYREQUEST>
 </HEADER>
 <BODY>
  <EXPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>Voucher Register</REPORTNAME>
    <STATICVARIABLES>
      <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
      <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
    </STATICVARIABLES>
   </REQUESTDESC>
  </EXPORTDATA>
 </BODY>
</ENVELOPE>
`;
