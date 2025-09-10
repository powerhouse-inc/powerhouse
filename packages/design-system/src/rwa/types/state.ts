import type { allGroupTransactionTypes, assetGroupTransactions } from "#rwa";
import type { Maybe, Scalars } from "document-model";

export type RealWorldAssetsState = {
  accounts: Account[];
  fixedIncomeTypes: FixedIncomeType[];
  portfolio: Asset[];
  principalLenderAccountId: string;
  serviceProviderFeeTypes: ServiceProviderFeeType[];
  spvs: SPV[];
  transactions: GroupTransaction[];
};
export type AssetType = "Cash" | "FixedIncome";

export type FixedIncome = {
  CUSIP: Maybe<Scalars["String"]["output"]>;
  ISIN: Maybe<Scalars["String"]["output"]>;
  assetProceeds: Scalars["Float"]["output"];
  coupon: Maybe<Scalars["Float"]["output"]>;
  fixedIncomeTypeId: Scalars["ID"]["output"];
  id: Scalars["ID"]["output"];
  maturity: Maybe<Scalars["DateTime"]["output"]>;
  name: Scalars["String"]["output"];
  notional: Scalars["Float"]["output"];
  purchaseDate: Scalars["DateTime"]["output"];
  purchasePrice: Scalars["Float"]["output"];
  purchaseProceeds: Scalars["Float"]["output"];
  realizedSurplus: Scalars["Float"]["output"];
  salesProceeds: Scalars["Float"]["output"];
  spvId: Scalars["ID"]["output"];
  totalDiscount: Scalars["Float"]["output"];
  type: AssetType;
};
export type CashAsset = {
  id: string;
  type: AssetType;
  spvId: string;
  currency: string;
  balance: number;
};

export type Asset = CashAsset | FixedIncome;

export type FixedIncomeType = {
  id: string;
  name: string;
};

export type SPV = {
  id: string;
  name: string;
};

export type AssetGroupTransactionType = (typeof assetGroupTransactions)[number];

export type GroupTransactionType = (typeof allGroupTransactionTypes)[number];

export type GroupTransaction = {
  cashBalanceChange: Scalars["Float"]["output"];
  cashTransaction: BaseTransaction;
  entryTime: Scalars["DateTime"]["output"];
  fees: Maybe<Array<TransactionFee>>;
  fixedIncomeTransaction: Maybe<BaseTransaction>;
  id: Scalars["ID"]["output"];
  serviceProviderFeeTypeId: Maybe<Scalars["ID"]["output"]>;
  txRef: Maybe<Scalars["String"]["output"]>;
  type: GroupTransactionType;
  unitPrice: Maybe<Scalars["Float"]["output"]>;
};

export type TransactionFee = {
  id: string;
  amount: number;
  serviceProviderFeeTypeId: string;
};

export type BaseTransaction = {
  accountId: Maybe<Scalars["ID"]["output"]>;
  amount: Scalars["Float"]["output"];
  assetId: Scalars["ID"]["output"];
  assetType: AssetType;
  counterPartyAccountId: Maybe<Scalars["ID"]["output"]>;
  entryTime: Scalars["DateTime"]["output"];
  id: Scalars["ID"]["output"];
  settlementTime: Maybe<Scalars["DateTime"]["output"]>;
  tradeTime: Maybe<Scalars["DateTime"]["output"]>;
};

export type ServiceProviderFeeType = {
  accountId: string;
  feeType: string;
  id: string;
  name: string;
};

export type Account = {
  id: string;
  label?: string | null;
  reference: string;
};
