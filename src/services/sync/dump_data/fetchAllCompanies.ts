import axios from 'axios';
import fs from 'fs';
import { parseStringPromise } from 'xml2js';

export async function fetchAllCompaniesWithSelected() {
  const allCompaniesRequestXml = `
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
            <NATIVEMETHOD>ENDINGAT</NATIVEMETHOD>
            <NATIVEMETHOD>EMAIL</NATIVEMETHOD>
            <NATIVEMETHOD>PHONENUMBER</NATIVEMETHOD>
            <NATIVEMETHOD>PINCODE</NATIVEMETHOD>
            <NATIVEMETHOD>STATENAME</NATIVEMETHOD>
            <NATIVEMETHOD>*</NATIVEMETHOD>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`.trim();



  const currentCompanyXml = `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>Company Name</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>`.trim();

  try {
    const allResponse = await axios.post('http://localhost:9000', allCompaniesRequestXml, {
      headers: { 'Content-Type': 'text/xml' }
    });
    const allParsed = await parseStringPromise(allResponse.data);
    const allCollection = allParsed.ENVELOPE?.BODY?.[0]?.DATA?.[0]?.COLLECTION?.[0];
    const allCompaniesXml = allCollection?.COMPANY || [];

    const allCompanies = allCompaniesXml.map((company: any) => {
      const obj: Record<string, any> = { is_selected: false };

      if (company.$) {
        Object.keys(company.$).forEach(attr => {
          obj[attr.toUpperCase()] = company.$[attr];
        });
      }

      Object.keys(company).forEach(key => {
        if (key === '$') return;
        const value = company[key];
        if (key.endsWith('.LIST') && Array.isArray(value)) {
          const baseKey = key.replace('.LIST', '');
          obj[baseKey] = value.map((item: any) => {
            const subObj: Record<string, any> = {};
            if (item.$) Object.keys(item.$).forEach(subAttr => subObj[subAttr.toUpperCase()] = item.$[subAttr]);
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
      obj.unique_id = obj.GUID || obj.NAME;

      return obj;
    });

    const currentResponse = await axios.post('http://localhost:9000', currentCompanyXml, {
      headers: { 'Content-Type': 'text/xml' }
    });
    const currentParsed = await parseStringPromise(currentResponse.data);
    fs.writeFileSync('./dump/company/all_companies_with_selected_1.json', JSON.stringify(currentParsed, null, 2), 'utf8');
    const currentCompanyName = currentParsed.ENVELOPE?.BODY?.[0]?.DESC?.[0]?.STATICVARIABLES?.[0]?.SVCURRENTCOMPANY?.[0] || '';

    const companiesWithSelected = allCompanies.map((comp: any) => {
      if (comp.NAME === currentCompanyName.trim()) {
        comp.is_selected = true;
      }
      return comp;
    });

    fs.writeFileSync('./dump/company/all_companies_with_selected.json', JSON.stringify(companiesWithSelected, null, 2), 'utf8');

    return companiesWithSelected;
  } catch (error: any) {
    console.error('Error fetching company data:', error?.message || error);
    throw error;
  }
}