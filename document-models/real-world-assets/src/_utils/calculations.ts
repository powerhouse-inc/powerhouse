import {
    GroupTransaction,
    GroupTransactionType,
} from '@powerhousedao/design-system';
import { ASSET_PURCHASE, ASSET_SALE } from '../constants';

/**
 * Compute derived fields for fixed income assets
 *
 * @param transactions - All group transactions for given asset
 */
export function computeFixedIncomeAssetDerivedFields(
    transactions: GroupTransaction[],
) {
    const purchaseDate = calculatePurchaseDate(transactions);
    const notional = calculateNotional(transactions);
    const assetProceeds = calculateAssetProceeds(transactions);
    const purchaseProceeds = calculatePurchaseProceeds(transactions);
    const salesProceeds = calculateSalesProceeds(transactions);
    const purchasePrice = calculatePurchasePrice(transactions);
    const totalDiscount = calculateTotalDiscount(transactions);
    const realizedSurplus = calculateRealizedSurplus(transactions);

    return {
        purchaseDate,
        notional,
        assetProceeds,
        purchaseProceeds,
        salesProceeds,
        purchasePrice,
        totalDiscount,
        realizedSurplus,
    };
}

/**
 * Purchase date
 *
 * Weighted average of asset purchase transaction amounts for a given asset
 * Weighted Average Purchase Date = (SUM( Quantity * Date )) / SUM( Quantity)
 * Where Quantity is the amount of each asset purchase transaction
 */
export function calculatePurchaseDate(transactions: GroupTransaction[]) {
    const purchaseTransactions = transactions.filter(
        ({ type }) => type === ASSET_PURCHASE,
    );

    if (!purchaseTransactions.length) return '';

    const sumQuantity = purchaseTransactions.reduce(
        (sum, { fixedIncomeTransaction }) => {
            if (!fixedIncomeTransaction) return sum;
            return sum + fixedIncomeTransaction.amount;
        },
        0,
    );

    const sumQuantityTimesDate = purchaseTransactions.reduce(
        (sum, { fixedIncomeTransaction }) => {
            if (!fixedIncomeTransaction) return sum;
            const { entryTime, amount } = fixedIncomeTransaction;
            // Convert to milliseconds since the epoch
            const time = new Date(entryTime).getTime();
            return sum + time * amount;
        },
        0,
    );

    // Calculate the weighted average in milliseconds
    const purchaseDateMs = sumQuantityTimesDate / sumQuantity;
    // Convert back to a Date object
    const purchaseDate = new Date(purchaseDateMs);
    // Round to the nearest day
    return roundToNearestDay(purchaseDate).toISOString();
}

/**
 * Notional
 *
 * Face value sum of cash transactions for a given asset
 * Notional = SUM(Asset Proceeds)
 * Where Asset Proceeds is the amount of each cash transaction
 */
export function calculateNotional(transactions: GroupTransaction[]) {
    return (
        sumCashTransactionsForType(transactions, ASSET_SALE) -
        sumCashTransactionsForType(transactions, ASSET_PURCHASE)
    );
}

/**
 * Asset proceeds
 * Cost to acquire or dispose of an asset _without_ fees
 *
 * Asset Proceeds = SUM(Cost to acquire or dispose of an asset without fees)
 */
export function calculateAssetProceeds(transactions: GroupTransaction[]) {
    return (
        sumCashTransactionsForType(transactions, ASSET_SALE) -
        sumCashTransactionsForType(transactions, ASSET_PURCHASE)
    );
}

/**
 * Purchase proceeds
 *
 * Cost to acquire asset _with_ fees
 * Purchase Proceeds = SUM(Cash Balance Change of Purchase Txs)
 */
export function calculatePurchaseProceeds(transactions: GroupTransaction[]) {
    const sumPurchaseTransactions = sumCashTransactionsForType(
        transactions,
        ASSET_PURCHASE,
    );

    const sumFees = sumGroupTransactionFees(transactions, ASSET_PURCHASE);

    return sumPurchaseTransactions + sumFees;
}

/**
 * Sales proceeds
 *
 * Amount received for the disposal of asset with fees
 * Sale Proceeds = SUM(Cash Balance Change of Sale Txs)
 */
export function calculateSalesProceeds(transactions: GroupTransaction[]) {
    const sumSaleTransactions = sumCashTransactionsForType(
        transactions,
        ASSET_SALE,
    );

    const sumFees = sumGroupTransactionFees(transactions, ASSET_SALE);

    return sumSaleTransactions - sumFees;
}

/**
 * Purchase price
 *
 * Total spent per unit including fees
 *
 * Purchase price = Purchase proceeds / Quantity
 */
export function calculatePurchasePrice(transactions: GroupTransaction[]) {
    const sumAssetPurchaseAmounts = sumAssetTransactionsForType(
        transactions,
        ASSET_PURCHASE,
    );

    // avoid divide by zero
    if (sumAssetPurchaseAmounts === 0) return 0;

    const purchaseProceeds = calculatePurchaseProceeds(transactions);

    return purchaseProceeds / sumAssetPurchaseAmounts;
}

/**
 * Total discount
 *
 * Notional minus purchase proceeds
 * Total discount = Notional - SUM(Purchase proceeds - Sale Proceeds)
 */
export function calculateTotalDiscount(transactions: GroupTransaction[]) {
    const notional = calculateNotional(transactions);
    const purchaseProceeds = calculatePurchaseProceeds(transactions);
    const salesProceeds = calculateSalesProceeds(transactions);

    return notional - (purchaseProceeds - salesProceeds);
}

/**
 * Realized surplus
 *
 * Excess of total assets over total liabilities that have been confirmed through the actual sale or disposal of assets.
 *
 * Realized Surplus = only give value if >0 -> Sale Proceeds - Purchase Proceeds
 */
export function calculateRealizedSurplus(transactions: GroupTransaction[]) {
    const salesProceeds = calculateSalesProceeds(transactions);
    const purchaseProceeds = calculatePurchaseProceeds(transactions);

    const realizedSurplus = salesProceeds - purchaseProceeds;

    return realizedSurplus > 0 ? realizedSurplus : 0;
}

/**
 * Helper function to sum fees for a given group transaction
 */
export function sumGroupTransactionFees(
    transactions: GroupTransaction[],
    typeFilter?: GroupTransactionType,
) {
    return transactions.reduce((sum, { type, fees }) => {
        if (!fees) return sum;
        if (typeFilter && type !== typeFilter) return sum;
        return sum + fees.reduce((feeSum, { amount }) => feeSum + amount, 0);
    }, 0);
}

export function sumCashTransactionsForType(
    transactions: GroupTransaction[],
    type: GroupTransactionType,
) {
    return transactions.reduce((sum, transaction) => {
        if (transaction.type !== type) return sum;
        const { amount } = transaction.cashTransaction ?? { amount: 0 };
        return sum + amount;
    }, 0);
}

export function sumAssetTransactionsForType(
    transactions: GroupTransaction[],
    type: GroupTransactionType,
) {
    return transactions.reduce((sum, transaction) => {
        if (transaction.type !== type) return sum;
        const { amount } = transaction.fixedIncomeTransaction ?? { amount: 0 };
        return sum + amount;
    }, 0);
}

/**
 * Round a date to the nearest day
 */
export function roundToNearestDay(date: Date) {
    // Convert to UTC date components
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    const hours = date.getUTCHours();

    // Create a new date at the start of the current day in UTC
    let roundedDate = new Date(Date.UTC(year, month, day));

    // If the original time was past midday (12 hours), advance the roundedDate by one day
    if (hours >= 12) {
        roundedDate = new Date(roundedDate.getTime() + 24 * 60 * 60 * 1000); // Add one day in milliseconds
    }

    return roundedDate;
}
