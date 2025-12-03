export type Maybe<T> = T | null;
export type InputMaybe<T> = T | null | undefined;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  Amount: { input: { unit?: string, value?: number }; output: { unit?: string, value?: number }; }
  Amount_Crypto: { input: { unit: string, value: string }; output: { unit: string, value: string }; }
  Amount_Currency: { input: { unit: string, value: string }; output: { unit: string, value: string }; }
  Amount_Fiat: { input: { unit: string, value: number }; output: { unit: string, value: number }; }
  Amount_Money: { input: number; output: number; }
  Amount_Percentage: { input: number; output: number; }
  Amount_Tokens: { input: number; output: number; }
  Currency: { input: string; output: string; }
  Date: { input: string; output: string; }
  DateTime: { input: string; output: string; }
  EmailAddress: { input: string; output: string; }
  EthereumAddress: { input: string; output: string; }
  OID: { input: string; output: string; }
  OLabel: { input: string; output: string; }
  PHID: { input: string; output: string; }
  URL: { input: string; output: string; }
};

export type AddLineItemInput = {
  description: Scalars['String']['input'];
  id: Scalars['OID']['input'];
  quantity: Scalars['Float']['input'];
  totalPriceCash: Scalars['Float']['input'];
  totalPricePwt: Scalars['Float']['input'];
  unit: BillingStatementUnitInput | `${BillingStatementUnitInput}`;
  unitPriceCash: Scalars['Float']['input'];
  unitPricePwt: Scalars['Float']['input'];
};

export type BillingStatementLineItem = {
  description: Scalars['String']['output'];
  id: Scalars['OID']['output'];
  lineItemTag: Array<BillingStatementTag>;
  quantity: Scalars['Float']['output'];
  totalPriceCash: Scalars['Float']['output'];
  totalPricePwt: Scalars['Float']['output'];
  unit: BillingStatementUnit | `${BillingStatementUnit}`;
  unitPriceCash: Scalars['Float']['output'];
  unitPricePwt: Scalars['Float']['output'];
};

export type BillingStatementState = {
  contributor: Maybe<Scalars['PHID']['output']>;
  currency: Scalars['String']['output'];
  dateDue: Maybe<Scalars['DateTime']['output']>;
  dateIssued: Scalars['DateTime']['output'];
  lineItems: Array<BillingStatementLineItem>;
  notes: Maybe<Scalars['String']['output']>;
  status: BillingStatementStatus | `${BillingStatementStatus}`;
  totalCash: Scalars['Float']['output'];
  totalPowt: Scalars['Float']['output'];
};

export type BillingStatementStatus =
  | 'ACCEPTED'
  | 'DRAFT'
  | 'ISSUED'
  | 'PAID'
  | 'REJECTED';

export type BillingStatementStatusInput =
  | 'ACCEPTED'
  | 'DRAFT'
  | 'ISSUED'
  | 'PAID'
  | 'REJECTED';

export type BillingStatementTag = {
  dimension: Scalars['String']['output'];
  label: Maybe<Scalars['String']['output']>;
  value: Scalars['String']['output'];
};

export type BillingStatementUnit =
  | 'DAY'
  | 'HOUR'
  | 'MINUTE'
  | 'UNIT';

export type BillingStatementUnitInput =
  | 'DAY'
  | 'HOUR'
  | 'MINUTE'
  | 'UNIT';

export type EditBillingStatementInput = {
  currency?: InputMaybe<Scalars['String']['input']>;
  dateDue?: InputMaybe<Scalars['DateTime']['input']>;
  dateIssued?: InputMaybe<Scalars['DateTime']['input']>;
  notes?: InputMaybe<Scalars['String']['input']>;
};

export type EditContributorInput = {
  contributor: Scalars['PHID']['input'];
};

export type EditLineItemInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['OID']['input'];
  quantity?: InputMaybe<Scalars['Float']['input']>;
  totalPriceCash?: InputMaybe<Scalars['Float']['input']>;
  totalPricePwt?: InputMaybe<Scalars['Float']['input']>;
  unit?: InputMaybe<BillingStatementUnitInput | `${BillingStatementUnitInput}`>;
  unitPriceCash?: InputMaybe<Scalars['Float']['input']>;
  unitPricePwt?: InputMaybe<Scalars['Float']['input']>;
};

export type EditLineItemTagInput = {
  dimension: Scalars['String']['input'];
  label?: InputMaybe<Scalars['String']['input']>;
  lineItemId: Scalars['OID']['input'];
  value: Scalars['String']['input'];
};

export type EditStatusInput = {
  status: BillingStatementStatusInput | `${BillingStatementStatusInput}`;
};
