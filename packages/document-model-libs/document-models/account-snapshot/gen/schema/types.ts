export type Maybe<T> = T | null;
export type InputMaybe<T> = T | null | undefined;
export type Exact<T extends { [key: string]: unknown }> = {
  [K in keyof T]: T[K];
};
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]?: Maybe<T[SubKey]>;
};
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]: Maybe<T[SubKey]>;
};
export type MakeEmpty<
  T extends { [key: string]: unknown },
  K extends keyof T,
> = { [_ in K]?: never };
export type Incremental<T> =
  | T
  | {
      [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never;
    };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
};

export type AccountSnapshotLocalState = {};

export type AccountSnapshotState = {
  actualsComparison: Maybe<Array<Maybe<ActualsComparison>>>;
  end: Maybe<Scalars["String"]["output"]>;
  id: Scalars["ID"]["output"];
  ownerId: Maybe<Scalars["ID"]["output"]>;
  ownerType: Maybe<Scalars["String"]["output"]>;
  period: Maybe<Scalars["String"]["output"]>;
  snapshotAccount: Maybe<Array<Maybe<SnapshotAccount>>>;
  start: Maybe<Scalars["String"]["output"]>;
};

export type ActualsComparison = {
  currency: Maybe<Scalars["String"]["output"]>;
  month: Maybe<Scalars["String"]["output"]>;
  netExpenses: Maybe<ActualsComparisonNetExpenses>;
  reportedActuals: Maybe<Scalars["Float"]["output"]>;
};

export type ActualsComparisonNetExpenses = {
  offChainIncluded: Maybe<ActualsComparisonNetExpensesItem>;
  onChainOnly: ActualsComparisonNetExpensesItem;
};

export type ActualsComparisonNetExpensesItem = {
  amount: Maybe<Scalars["Float"]["output"]>;
  difference: Maybe<Scalars["Float"]["output"]>;
};

export type SetEndInput = {
  end: Scalars["String"]["input"];
};

export type SetIdInput = {
  id: Scalars["ID"]["input"];
};

export type SetOwnerIdInput = {
  ownerId: Scalars["ID"]["input"];
};

export type SetOwnerTypeInput = {
  ownerType: Scalars["String"]["input"];
};

export type SetPeriodInput = {
  period: Scalars["String"]["input"];
};

export type SetStartInput = {
  start: Scalars["String"]["input"];
};

export type SnapshotAccount = {
  accountAddress: Maybe<Scalars["String"]["output"]>;
  accountLabel: Maybe<Scalars["String"]["output"]>;
  accountType: Maybe<Scalars["String"]["output"]>;
  groupAccountId: Maybe<Scalars["ID"]["output"]>;
  id: Scalars["ID"]["output"];
  offChain: Maybe<Scalars["Boolean"]["output"]>;
  snapshotAccountBalance: Maybe<Array<Maybe<SnapshotAccountBalance>>>;
  snapshotAccountTransaction: Maybe<Array<Maybe<SnapshotAccountTransaction>>>;
  upstreamAccountId: Maybe<Scalars["ID"]["output"]>;
};

export type SnapshotAccountBalance = {
  id: Maybe<Scalars["ID"]["output"]>;
  includesOffChain: Maybe<Scalars["Boolean"]["output"]>;
  inflow: Maybe<Scalars["Float"]["output"]>;
  initialBalance: Maybe<Scalars["Float"]["output"]>;
  newBalance: Maybe<Scalars["Float"]["output"]>;
  outflow: Maybe<Scalars["Float"]["output"]>;
  token: Maybe<Scalars["String"]["output"]>;
};

export type SnapshotAccountTransaction = {
  amount: Maybe<Scalars["Float"]["output"]>;
  block: Maybe<Scalars["Int"]["output"]>;
  counterParty: Maybe<Scalars["String"]["output"]>;
  counterPartyName: Maybe<Scalars["String"]["output"]>;
  id: Scalars["ID"]["output"];
  timestamp: Maybe<Scalars["String"]["output"]>;
  token: Maybe<Scalars["String"]["output"]>;
  txHash: Maybe<Scalars["String"]["output"]>;
  txLabel: Maybe<Scalars["String"]["output"]>;
};
