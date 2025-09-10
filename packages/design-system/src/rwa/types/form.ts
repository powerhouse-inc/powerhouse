import type {
  GroupTransactionType,
  Operation,
  TableItemType,
  TableName,
} from "#rwa";

export type AssetFormInputs = {
  id?: string;
  fixedIncomeTypeId?: string | null;
  spvId?: string | null;
  maturity?: string | null;
  name?: string | null;
  ISIN?: string | null;
  CUSIP?: string | null;
  coupon?: number | null;
};

export type ServiceProviderFeeTypeFormInputs = {
  id?: string;
  name?: string | null;
  feeType?: string | null;
  accountId?: string | null;
};

export type TransactionFeeInput = {
  id?: string;
  amount?: number | null;
  serviceProviderFeeTypeId?: string | null;
};

export type GroupTransactionFormInputs = {
  id?: string;
  type?: GroupTransactionType | null;
  entryTime?: string | null;
  fixedIncomeId?: string | null;
  fees?: TransactionFeeInput[] | null;
  cashAmount?: number | null;
  fixedIncomeAmount?: number | null;
  serviceProviderFeeTypeId?: string | null;
  txRef?: string | null;
};

export type AccountFormInputs = {
  id?: string;
  label?: string | null;
  reference?: string | null;
};

export type SPVFormInputs = {
  id?: string;
  name?: string | null;
};

export type FixedIncomeTypeFormInputs = {
  id?: string;
  name?: string | null;
};

export type FormHookProps = {
  tableName: TableName;
  tableItem?: TableItemType<TableName> | null;
  operation: Operation;
};
