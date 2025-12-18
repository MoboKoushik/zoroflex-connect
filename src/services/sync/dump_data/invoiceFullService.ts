import axios from "axios";
import xml2js from "xml2js";



export interface InvoiceItem {
  itemName: string;
  qty: number;
  rate: number;
  amount: number;
  hsn?: string;
  gstRate?: number;
}

export interface InvoiceJson {
  guid: string;
  voucherNumber: string;
  voucherType: string;
  date: string;
  customer: string;
  narration: string;
  voucherAmount: number;
  alterId: number;

  items: InvoiceItem[];

  taxes: {
    cgst: number;
    sgst: number;
    igst: number;
  };
}


export function buildInvoiceXML(fromDate: string, toDate: string, voucherType = "Sales") {
  return `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Voucher</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <VoucherTypeName>${voucherType}</VoucherTypeName>
          <SVFROMDATE>${fromDate}</SVFROMDATE>
          <SVTODATE>${toDate}</SVTODATE>
        </STATICVARIABLES>
        <TDL>
          <![CDATA[
            <TDLMESSAGE>
              <REPORT Name="FullInvoiceFetch" ISMODIFY="Yes">
                <FORMS>FullInvoiceForm</FORMS>
              </REPORT>

              <FORM Name="FullInvoiceForm">
                <TOPPARTS>FullInvoicePart</TOPPARTS>
              </FORM>

              <PART Name="FullInvoicePart">
                <TOPLINES>FullInvoiceLine</TOPLINES>
              </PART>

              <LINE Name="FullInvoiceLine">
                <FIELDS>XMLHelper</FIELDS>
                <XMLTAG>"VOUCHER"</XMLTAG>
              </LINE>

              <FIELD Name="XMLHelper">
                <XMLTAG>"VOUCHER"</XMLTAG>
                <SET as="XML">
                  <![CDATA[
                    <GUID>:$GUID</GUID>
                    <MASTERID>:$MasterId</MASTERID>
                    <ALTERID>:$AlterId</ALTERID>
                    <VOUCHERTYPENAME>:$VoucherTypeName</VOUCHERTYPENAME>
                    <VOUCHERNUMBER>:$VoucherNumber</VOUCHERNUMBER>
                    <DATE>:$Date</DATE>
                    <PARTYLEDGERNAME>:$PartyLedgerName</PARTYLEDGERNAME>
                    <NARRATION>:$Narration</NARRATION>
                    <VOUCHERAMOUNT>:$Amount</VOUCHERAMOUNT>

                    <LEDGERENTRIES.LIST>
                      <LEDGERNAME>:$LedgerName</LEDGERNAME>
                      <LEDGERAMOUNT>:$LedgerAmount</LEDGERAMOUNT>
                      <ISDEEMEDPOSITIVE>:$IsDeemedPositive</ISDEEMEDPOSITIVE>
                      <CGSTAMT>:$CGSTAmount</CGSTAMT>
                      <SGSTAMT>:$SGSTAmount</SGSTAMT>
                      <IGSTAMT>:$IGSTAmount</IGSTAMT>
                    </LEDGERENTRIES.LIST>

                    <ALLINVENTORYENTRIES.LIST>
                      <ITEMNAME>:$StockItemName</ITEMNAME>
                      <HSNCODE>:$HSNCode</HSNCODE>
                      <QTY>:$ActualQty</QTY>
                      <RATE>:$Rate</RATE>
                      <AMOUNT>:$Amount</AMOUNT>
                      <GSTRATE>:$GSTRate</GSTRATE>
                    </ALLINVENTORYENTRIES.LIST>
                  ]]>
                </SET>
              </FIELD>
            </TDLMESSAGE>
          ]]>
        </TDL>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>
`;
}

export async function fetchFullInvoices(fromDate: string, toDate: string): Promise<InvoiceJson[]> {
  const xmlBody = buildInvoiceXML(fromDate, toDate);

  const response = await axios.post("http://localhost:9000", xmlBody, {
    headers: { "Content-Type": "text/xml" },
    timeout: 20000,
  });
  console.log('Tally response received', response.data);

  const parsed = await xml2js.parseStringPromise(response.data, {
    explicitArray: false,
    ignoreAttrs: false,
  });

  console.log('Parsed XML:', JSON.stringify(parsed, null, 2));

  const messages =
    parsed?.ENVELOPE?.BODY?.EXPORTDATA?.REQUESTDATA?.TALLYMESSAGE || [];

  const vouchers = Array.isArray(messages)
    ? messages
    : [messages];

  console.log(`Found ${vouchers.length} vouchers`);

  const results: InvoiceJson[] = [];

  for (const msg of vouchers) {
    const v = msg?.VOUCHER;
    if (!v) continue;

    let cgst = 0, sgst = 0, igst = 0;

    // Ledger entries contain tax breakup
    const ledgerList = v["LEDGERENTRIES.LIST"];
    if (ledgerList) {
      const entries = Array.isArray(ledgerList) ? ledgerList : [ledgerList];
      for (const entry of entries) {
        cgst += Number(entry.CGSTAMT || 0);
        sgst += Number(entry.SGSTAMT || 0);
        igst += Number(entry.IGSTAMT || 0);
      }
    }

    // Inventory items
    const items: InvoiceItem[] = [];
    const invList = v["ALLINVENTORYENTRIES.LIST"];
    if (invList) {
      const invItems = Array.isArray(invList) ? invList : [invList];
      for (const it of invItems) {
        items.push({
          itemName: it.ITEMNAME || "",
          qty: Number(it.QTY || 0),
          rate: Number(it.RATE || 0),
          amount: Number(it.AMOUNT || 0),
          hsn: it.HSNCODE || "",
          gstRate: Number(it.GSTRATE || 0),
        });
      }
    }

    results.push({
      guid: v.GUID,
      voucherNumber: v.VOUCHERNUMBER,
      voucherType: v.VOUCHERTYPENAME,
      date: v.DATE,
      customer: v.PARTYLEDGERNAME,
      narration: v.NARRATION || "",
      voucherAmount: Number(v.VOUCHERAMOUNT || 0),
      alterId: Number(v.ALTERID || 0),
      items,
      taxes: { cgst, sgst, igst },
    });
  }

  return results;
}
