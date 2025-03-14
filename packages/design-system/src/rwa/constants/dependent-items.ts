import {
  type FixedIncome,
  type GroupTransaction,
  type ServiceProviderFeeType,
  type TableName,
  useEditorContext,
} from "#rwa";
import { useMemo } from "react";

export type DependentItemProps = {
  dependentTableName: TableName;
  dependentItems: { id: string; label: string }[];
}[];
export function useDependentItemProps(
  tableName: TableName,
  itemId: string | null | undefined,
) {
  const { fixedIncomes, serviceProviderFeeTypes, transactions } =
    useEditorContext();

  const dependentItemProps: DependentItemProps = useMemo(() => {
    if (!itemId) return [];

    switch (tableName) {
      case "TRANSACTION":
        return [];
      case "SPV":
        return [
          {
            dependentTableName: "ASSET",
            dependentItems: makeDependentAssetsList(
              tableName,
              itemId,
              fixedIncomes,
            ),
          },
        ];
      case "FIXED_INCOME_TYPE":
        return [
          {
            dependentTableName: "ASSET",
            dependentItems: makeDependentAssetsList(
              tableName,
              itemId,
              fixedIncomes,
            ),
          },
        ];
      case "ASSET":
        return [
          {
            dependentTableName: "TRANSACTION",
            dependentItems: makeDependentTransactionsList(
              tableName,
              itemId,
              transactions,
            ),
          },
        ];
      case "SERVICE_PROVIDER_FEE_TYPE":
        return [
          {
            dependentTableName: "TRANSACTION",
            dependentItems: makeDependentTransactionsList(
              tableName,
              itemId,
              transactions,
            ),
          },
        ];
      case "ACCOUNT":
        return [
          {
            dependentTableName: "TRANSACTION",
            dependentItems: makeDependentTransactionsList(
              tableName,
              itemId,
              transactions,
            ),
          },
          {
            dependentTableName: "SERVICE_PROVIDER_FEE_TYPE",
            dependentItems: makeDependentServiceProviderFeeTypesList(
              itemId,
              serviceProviderFeeTypes,
            ),
          },
        ];
    }
  }, [fixedIncomes, itemId, serviceProviderFeeTypes, tableName, transactions]);

  return dependentItemProps;
}

export function makeDependentServiceProviderFeeTypesList(
  itemId: string,
  serviceProviderFeeTypes: ServiceProviderFeeType[],
) {
  const makeLabel = (asset: ServiceProviderFeeType) => ({
    id: asset.id,
    label: asset.name,
  });
  return serviceProviderFeeTypes
    .filter((f) => f.accountId === itemId)
    .map(makeLabel);
}

export function makeDependentAssetsList(
  tableName: "FIXED_INCOME_TYPE" | "SPV",
  itemId: string,
  assets: FixedIncome[],
) {
  const makeLabel = (asset: FixedIncome) => ({
    id: asset.id,
    label: asset.name,
  });
  switch (tableName) {
    case "FIXED_INCOME_TYPE":
      return assets
        .filter((asset) => asset.fixedIncomeTypeId === itemId)
        .map(makeLabel);
    case "SPV":
      return assets.filter((asset) => asset.spvId === itemId).map(makeLabel);
  }
}

export function makeDependentTransactionsList(
  tableName: "ASSET" | "ACCOUNT" | "SERVICE_PROVIDER_FEE_TYPE",
  itemId: string,
  transactions: GroupTransaction[],
) {
  const makeLabel = (t: GroupTransaction, index: number) => ({
    id: t.id,
    label: `Transaction #${index + 1}`,
  });

  switch (tableName) {
    case "ASSET":
      return transactions
        .filter((t) => t.fixedIncomeTransaction?.assetId === itemId)
        .map(makeLabel);
    case "ACCOUNT":
      return transactions
        .filter(
          (t) =>
            t.cashTransaction.accountId === itemId ||
            t.fixedIncomeTransaction?.accountId === itemId,
        )
        .map(makeLabel);
    case "SERVICE_PROVIDER_FEE_TYPE":
      return transactions
        .filter((t) =>
          t.fees?.some((f) => f.serviceProviderFeeTypeId === itemId),
        )
        .map(makeLabel);
  }
}
