import type {
  EditorAction,
  GroupTransactionType,
  RealWorldAssetsState,
  TableName,
  TableNameFor,
} from "#rwa";

export const defaultColumnCountByTableWidth = {
  1520: 10,
  1394: 9,
  1239: 8,
  1112: 7,
  984: 6,
};

export const cashTransactionSignByTransactionType: Record<
  GroupTransactionType,
  -1 | 1
> = {
  AssetSale: 1,
  PrincipalDraw: 1,
  AssetPurchase: -1,
  PrincipalReturn: -1,
  FeesIncome: 1,
  FeesPayment: -1,
  InterestIncome: 1,
  InterestPayment: -1,
} as const;

export const assetTransactionSignByTransactionType = {
  AssetSale: -1,
  AssetPurchase: 1,
} as const;

export function getStateKeyForTableName(tableName: TableName) {
  const stateKeysByTableName: Record<TableName, keyof RealWorldAssetsState> = {
    ASSET: "portfolio",
    TRANSACTION: "transactions",
    ACCOUNT: "accounts",
    FIXED_INCOME_TYPE: "fixedIncomeTypes",
    SERVICE_PROVIDER_FEE_TYPE: "serviceProviderFeeTypes",
    SPV: "spvs",
  } as const;

  return stateKeysByTableName[tableName];
}

export function getTableNameFor<A extends EditorAction>(
  action: A,
): TableNameFor<A> {
  const parts = action.type.split("_");
  const entity = parts.slice(1).join("_");
  return entity as TableNameFor<A>;
}
export function getActionOperationType<A extends EditorAction>(action: A) {
  const operation = action.type.split("_")[0];
  return operation as "CREATE" | "EDIT" | "DELETE";
}
