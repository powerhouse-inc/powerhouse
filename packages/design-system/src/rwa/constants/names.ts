import type { TableName } from "@powerhousedao/design-system";

const SERVICE_PROVIDER_FEE_TYPE = "SERVICE_PROVIDER_FEE_TYPE";
const FIXED_INCOME_TYPE = "FIXED_INCOME_TYPE";
const ACCOUNT = "ACCOUNT";
const TRANSACTION = "TRANSACTION";
const ASSET = "ASSET";
const SPV = "SPV";

export const tableNames = {
  SERVICE_PROVIDER_FEE_TYPE,
  FIXED_INCOME_TYPE,
  ACCOUNT,
  TRANSACTION,
  ASSET,
  SPV,
} as const;

export const tableLabels: Record<TableName, string> = {
  SERVICE_PROVIDER_FEE_TYPE: "Service Provider Fee Type",
  FIXED_INCOME_TYPE: "Fixed Income Asset Type",
  ACCOUNT: "Account",
  TRANSACTION: "Transaction",
  ASSET: "Asset",
  SPV: "SPV",
} as const;

export const editorStateKeysByTableName = {
  SERVICE_PROVIDER_FEE_TYPE: "serviceProviderFeeTypes",
  FIXED_INCOME_TYPE: "fixedIncomeTypes",
  ACCOUNT: "accounts",
  TRANSACTION: "transactions",
  ASSET: "portfolio",
  SPV: "spvs",
} as const;

export const deleteEditorActionInputsByTableName = {
  SERVICE_PROVIDER_FEE_TYPE: "DELETE_SERVICE_PROVIDER_FEE_TYPE",
  FIXED_INCOME_TYPE: "DELETE_FIXED_INCOME_TYPE",
  ACCOUNT: "DELETE_ACCOUNT",
  TRANSACTION: "DELETE_TRANSACTION",
  ASSET: "DELETE_ASSET",
  SPV: "DELETE_SPV",
} as const;
