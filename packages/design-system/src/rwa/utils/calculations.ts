import type { FixedIncome, FixedIncomeType, GroupTransaction } from "#rwa";
import { ASSET_PURCHASE, ASSET_SALE } from "#rwa";
import { all, create } from "mathjs";

type NumericKeys<T> = {
  [K in keyof T]: T[K] extends number ? K : never;
}[keyof T];

export function sumTotalForProperty<T extends Record<string, any>>(
  items: T[],
  property: NumericKeys<T>,
): number {
  return items.reduce((acc, item) => acc + Number(item[property]), 0);
}

export const math = create(all, {
  number: "BigNumber",
});

export function calculateCurrentValue(props: {
  asset: FixedIncome | undefined;
  transactions: GroupTransaction[];
  fixedIncomeTypes: FixedIncomeType[];
  currentDate?: Date;
}) {
  const {
    asset,
    transactions,
    fixedIncomeTypes,
    currentDate = new Date(),
  } = props;

  // asset must have a maturity date to calculate
  if (!asset?.maturity) return null;

  const fixedIncomeType = fixedIncomeTypes.find(
    ({ id }) => id === asset.fixedIncomeTypeId,
  );

  if (!fixedIncomeType) return null;

  // currently only Treasury Bills are supported
  if (fixedIncomeType.name !== "Treasury Bill") return null;

  const purchaseTransactionsForAsset = transactions.filter(
    ({ type, fixedIncomeTransaction }) =>
      type === ASSET_PURCHASE && fixedIncomeTransaction?.assetId === asset.id,
  );

  const saleTransactionsForAsset = transactions.filter(
    ({ type, fixedIncomeTransaction }) =>
      type === ASSET_SALE && fixedIncomeTransaction?.assetId === asset.id,
  );

  // formula is meaningless if there are no purchase or sale transactions
  if (!purchaseTransactionsForAsset.length && !saleTransactionsForAsset.length)
    return null;

  const currentDateMs = math.bignumber(currentDate.getTime());
  const maturityDateMs = math.bignumber(new Date(asset.maturity).getTime());

  // do not calculate if the asset has matured
  if (maturityDateMs.lessThan(currentDateMs)) return null;

  const purchaseDateMs = math.bignumber(new Date(asset.purchaseDate).getTime());
  const sumQuantities = calculateSumQuantity(purchaseTransactionsForAsset).sub(
    calculateSumQuantity(saleTransactionsForAsset),
  );
  const salesProceeds = math.bignumber(asset.salesProceeds);
  const realizedSurplus = math.bignumber(asset.realizedSurplus);
  const purchaseProceeds = math.bignumber(asset.purchaseProceeds);
  const currentPurchaseProceeds = purchaseProceeds
    .sub(salesProceeds)
    .add(realizedSurplus);
  const totalDiscount = sumQuantities.sub(currentPurchaseProceeds);

  const currentValue = currentDateMs
    .sub(purchaseDateMs)
    .div(maturityDateMs.sub(purchaseDateMs))
    .mul(totalDiscount)
    .add(currentPurchaseProceeds)
    .toNumber();

  return currentValue;
}
export function calculateSumQuantity(transactions: GroupTransaction[]) {
  return transactions.reduce((sum, { fixedIncomeTransaction }) => {
    if (!fixedIncomeTransaction) return sum;
    return sum.add(math.bignumber(fixedIncomeTransaction.amount));
  }, math.bignumber(0));
}
