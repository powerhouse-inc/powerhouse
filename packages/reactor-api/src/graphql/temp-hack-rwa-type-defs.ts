type Maybe<T> = T | null;

export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
  DateTime: { input: string; output: string };
};
export type Asset = Cash | FixedIncome;

export type AssetType = "Cash" | "FixedIncome";
export type Cash = {
  balance: Scalars["Float"]["output"];
  currency: Scalars["String"]["output"];
  id: Scalars["ID"]["output"];
  spvId: Scalars["ID"]["output"];
  type: AssetType;
};
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
