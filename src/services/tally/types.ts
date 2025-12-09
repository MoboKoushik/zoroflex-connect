export interface TallyVoucher {
  VOUCHERDATE: string;
  VOUCHERNUMBER: string;
  VOUCHERTYPE: string;
  PARTYNAME?: string;
  NARRATION?: string;
  AMOUNT: number;
  [key: string]: any;
}

export interface TallyLedger {
  NAME: string;
  PARENT?: string;
  ADDRESS?: string;
  PHONE?: string;
  EMAIL?: string;
  OPENINGBALANCE?: number;
  [key: string]: any;
}

export interface TallyInventoryItem {
  STOCKITEMNAME: string;
  PARENT?: string;
  BASEUNIT?: string;
  OPENINGBALANCE?: number;
  OPENINGVALUE?: number;
  [key: string]: any;
}

export interface TallyResponse {
  ENVELOPE: {
    HEADER: {
      TALLYREQUEST?: string;
      VERSION?: string;
    };
    BODY: {
      [key: string]: any;
    };
  };
}

