import {
  Asset,
  assetGroupTransactions,
  AssetGroupTransactionType,
  CashAsset,
  FixedIncome,
  GroupTransactionType,
} from "@/rwa";

export function isAssetGroupTransactionType(
  type: GroupTransactionType,
): type is AssetGroupTransactionType {
  return assetGroupTransactions.includes(type);
}

export function isFixedIncomeAsset(
  asset: Asset | undefined | null,
): asset is FixedIncome {
  if (!asset) return false;
  if (asset.type === "FixedIncome") return true;
  if ("fixedIncomeId" in asset) return true;
  return false;
}

export function isCashAsset(
  asset: Asset | undefined | null,
): asset is CashAsset {
  if (!asset) return false;
  if (asset.type === "Cash") return true;
  if ("currency" in asset) return true;
  return false;
}

export function getFixedIncomeAssets(portfolio: Asset[]) {
  return portfolio.filter((a) => isFixedIncomeAsset(a));
}

export function getCashAsset(portfolio: Asset[]) {
  const cashAsset = portfolio.find((a) => isCashAsset(a));
  if (!cashAsset) {
    throw new Error("Cash asset not found");
  }
  return cashAsset;
}
