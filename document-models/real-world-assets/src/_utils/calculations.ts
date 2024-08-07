import {
    FixedIncome,
    FixedIncomeType,
    GroupTransaction,
    GroupTransactionType,
    InputMaybe,
    TransactionFee,
} from 'document-models/real-world-assets';
import { all, BigNumber, create } from 'mathjs';
import {
    ASSET_PURCHASE,
    ASSET_SALE,
    cashTransactionSignByTransactionType,
} from '../constants';

export const math = create(all, {
    number: 'BigNumber',
});

/**
 * Compute derived fields for fixed income assets
 *
 * @param transactions - All group transactions for given asset
 */
export function computeFixedIncomeAssetDerivedFields(
    transactions: GroupTransaction[],
) {
    const purchaseDate = calculatePurchaseDate(transactions);
    const notional = calculateNotional(transactions).toNumber();
    const assetProceeds = calculateAssetProceeds(transactions).toNumber();
    const purchaseProceeds = calculatePurchaseProceeds(transactions).toNumber();
    const salesProceeds = calculateSalesProceeds(transactions).toNumber();
    const purchasePrice = calculatePurchasePrice(transactions).toNumber();
    const totalDiscount = calculateTotalDiscount(transactions).toNumber();
    const realizedSurplus = calculateRealizedSurplus(transactions).toNumber();

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
export function calculatePurchaseDate(
    transactions: GroupTransaction[],
    as: 'ms',
    round?: boolean,
): BigNumber;

export function calculatePurchaseDate(
    transactions: GroupTransaction[],
    as?: 'iso',
    round?: boolean,
): string;
export function calculatePurchaseDate(
    transactions: GroupTransaction[],
    as: 'ms' | 'iso' = 'iso',
    round = true,
) {
    const purchaseTransactions = transactions.filter(
        ({ type }) => type === ASSET_PURCHASE,
    );

    if (!purchaseTransactions.length) return '';

    const sumQuantities = calculateSumQuantity(purchaseTransactions);

    const sumQuantitiesTimesDate =
        calculateSumQuantityTimesDate(purchaseTransactions);

    const purchaseDateMs = sumQuantitiesTimesDate.div(sumQuantities);
    const maybeRounded = round
        ? math.bignumber(
              roundToNearestDay(new Date(purchaseDateMs.toNumber())).getTime(),
          )
        : purchaseDateMs;

    return as === 'iso'
        ? new Date(maybeRounded.toNumber()).toISOString()
        : maybeRounded;
}

/**
 * Notional
 *
 * Face value sum of cash transactions for a given asset
 * Notional = Purchase Price * (assetAmountPurchase - assetAmountSale)
 * Where Asset Proceeds is the amount of each cash transaction
 */
export function calculateNotional(transactions: GroupTransaction[]): BigNumber {
    const purchasePrice = calculatePurchasePrice(transactions);
    const assetAmountPurchase = sumAssetTransactionsForType(
        transactions,
        ASSET_PURCHASE,
    );
    const assetAmountSale = sumAssetTransactionsForType(
        transactions,
        ASSET_SALE,
    );

    if (assetAmountPurchase.sub(assetAmountSale).eq(0))
        return math.bignumber(0);

    return purchasePrice.add(
        math
            .bignumber(assetAmountPurchase)
            .sub(math.bignumber(assetAmountSale)),
    );
}

/**
 * Asset proceeds
 * Cost to acquire or dispose of an asset _without_ fees
 *
 * Asset Proceeds = SUM(Cost to acquire or dispose of an asset without fees)
 */
export function calculateAssetProceeds(
    transactions: GroupTransaction[],
): BigNumber {
    return sumCashTransactionsForType(transactions, ASSET_SALE).sub(
        sumCashTransactionsForType(transactions, ASSET_PURCHASE),
    );
}

/**
 * Purchase proceeds
 *
 * Cost to acquire asset _with_ fees
 * Purchase Proceeds = SUM(Cash Balance Change of Purchase Txs)
 */
export function calculatePurchaseProceeds(
    transactions: GroupTransaction[],
): BigNumber {
    const sumPurchaseTransactions = sumCashTransactionsForType(
        transactions,
        ASSET_PURCHASE,
    );

    const sumFees = sumGroupTransactionFees(transactions, ASSET_PURCHASE);

    return sumPurchaseTransactions.add(sumFees);
}

/**
 * Sales proceeds
 *
 * Amount received for the disposal of asset with fees
 * Sale Proceeds = SUM(Cash Balance Change of Sale Txs)
 */
export function calculateSalesProceeds(
    transactions: GroupTransaction[],
): BigNumber {
    const sumSaleTransactions = sumCashTransactionsForType(
        transactions,
        ASSET_SALE,
    );

    const sumFees = sumGroupTransactionFees(transactions, ASSET_SALE);

    return sumSaleTransactions.sub(sumFees);
}

/**
 * Purchase price
 *
 * Total spent per unit not including fees
 *
 * Purchase price = Purchase proceeds / Quantity
 */
export function calculatePurchasePrice(
    transactions: GroupTransaction[],
): BigNumber {
    const sumAssetPurchaseAssetTransactions = sumAssetTransactionsForType(
        transactions,
        ASSET_PURCHASE,
    );
    const sumAssetPurchaseCashTransactions = sumCashTransactionsForType(
        transactions,
        ASSET_PURCHASE,
    );

    // avoid divide by zero
    if (sumAssetPurchaseAssetTransactions.equals(0)) return math.bignumber(0);

    return sumAssetPurchaseCashTransactions.div(
        sumAssetPurchaseAssetTransactions,
    );
}

/**
 * Total discount
 *
 * Notional minus purchase proceeds
 * Total discount = Notional - SUM(Purchase proceeds - Sale Proceeds)
 */
export function calculateTotalDiscount(
    transactions: GroupTransaction[],
): BigNumber {
    const notional = calculateNotional(transactions);
    const purchaseProceeds = calculatePurchaseProceeds(transactions);
    const salesProceeds = calculateSalesProceeds(transactions);

    return notional.sub(purchaseProceeds.sub(salesProceeds));
}

/**
 * Realized surplus
 *
 * Excess of total assets over total liabilities that have been confirmed through the actual sale or disposal of assets.
 *
 * Realized Surplus = only give value if >0 -> Sale Proceeds - Purchase Proceeds
 */
export function calculateRealizedSurplus(
    transactions: GroupTransaction[],
): BigNumber {
    const salesProceeds = calculateSalesProceeds(transactions);
    const purchaseProceeds = calculatePurchaseProceeds(transactions);

    const realizedSurplus = salesProceeds.sub(purchaseProceeds);

    return realizedSurplus.greaterThan(0) ? realizedSurplus : math.bignumber(0);
}

/**
 * Helper function to sum fees for a given group transaction
 */
export function sumGroupTransactionFees(
    transactions: GroupTransaction[],
    typeFilter?: GroupTransactionType,
): BigNumber {
    return transactions.reduce((sum, { type, fees }) => {
        if (!fees) return sum;
        if (typeFilter && type !== typeFilter) return sum;
        return sum.add(
            fees.reduce(
                (feeSum, { amount }) =>
                    math.bignumber(feeSum).add(math.bignumber(amount)),
                math.bignumber(0),
            ),
        );
    }, math.bignumber(0));
}

export function sumCashTransactionsForType(
    transactions: GroupTransaction[],
    type: GroupTransactionType,
): BigNumber {
    return transactions.reduce((sum, transaction) => {
        if (transaction.type !== type) return sum;
        const amount = math.bignumber(transaction.cashTransaction.amount);
        return sum.add(amount);
    }, math.bignumber(0));
}

export function sumAssetTransactionsForType(
    transactions: GroupTransaction[],
    type: GroupTransactionType,
): BigNumber {
    return transactions.reduce((sum, transaction) => {
        if (transaction.type !== type) return sum;
        const amount = math.bignumber(
            transaction.fixedIncomeTransaction?.amount ?? 0,
        );
        return sum.add(amount);
    }, math.bignumber(0));
}

/**
 * Round a date to the nearest day
 */
export function roundToNearestDay(date: Date): Date {
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

export function calculateCashBalanceChange(
    transactionType: InputMaybe<GroupTransactionType>,
    cashAmount: InputMaybe<number>,
    fees: InputMaybe<TransactionFee[]>,
): BigNumber {
    if (!transactionType)
        throw new Error('Missing required fields: transactionType');

    const sign = cashTransactionSignByTransactionType[transactionType];

    const totalFees = calculateTotalFees(fees);

    return math.bignumber((cashAmount ?? 0) * sign).sub(totalFees);
}

export function calculateTotalFees(
    fees: InputMaybe<TransactionFee[]>,
): BigNumber {
    const feeAmounts = fees?.map(fee => fee.amount).filter(Boolean) ?? [];

    const totalFees = feeAmounts.reduce(
        (acc, fee) => acc.add(math.bignumber(fee)),
        math.bignumber(0),
    );

    return totalFees;
}

export function calculateUnitPrice(
    cashAmount: InputMaybe<number>,
    fixedIncomeAmount: InputMaybe<number>,
): BigNumber {
    if (!cashAmount || !fixedIncomeAmount) return math.bignumber(0);
    return math.bignumber(cashAmount).div(math.bignumber(fixedIncomeAmount));
}

/* 
CurrentValue = (Current Date - Purchase Date) / ((Maturity Date - Current Date) ) × Total Discount + Purchase Proceeds)

For T-bills, which mature at $1 each, the Total Discount is calculated as:

Total Discount = Quantity − Purchase Proceeds
*/
export function calculateCurrentValue(props: {
    asset: FixedIncome;
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
    if (!asset.maturity) return null;

    const fixedIncomeType = fixedIncomeTypes.find(
        ({ id }) => id === asset.fixedIncomeTypeId,
    )!;

    // currently only Treasury Bills are supported
    if (fixedIncomeType.name !== 'Treasury Bill') return null;

    const purchaseTransactionsForAsset = transactions.filter(
        ({ type, fixedIncomeTransaction }) =>
            type === ASSET_PURCHASE &&
            fixedIncomeTransaction?.assetId === asset.id,
    );

    const saleTransactionsForAsset = transactions.filter(
        ({ type, fixedIncomeTransaction }) =>
            type === ASSET_SALE && fixedIncomeTransaction?.assetId === asset.id,
    );

    // formula is meaningless if there are no purchase or sale transactions
    if (
        !purchaseTransactionsForAsset.length &&
        !saleTransactionsForAsset.length
    )
        return null;

    const currentDateMs = math.bignumber(currentDate.getTime());
    const maturityDateMs = math.bignumber(new Date(asset.maturity).getTime());

    // do not calculate if the asset has matured
    if (maturityDateMs.lessThan(currentDateMs)) return null;

    const purchaseDateMs = math.bignumber(
        new Date(asset.purchaseDate).getTime(),
    );
    const sumQuantities = calculateSumQuantity(
        purchaseTransactionsForAsset,
    ).sub(calculateSumQuantity(saleTransactionsForAsset));
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

export function calculateSumQuantityTimesDate(
    transactions: GroupTransaction[],
) {
    return transactions.reduce((sum, { fixedIncomeTransaction }) => {
        if (!fixedIncomeTransaction) return sum;
        const { entryTime, amount } = fixedIncomeTransaction;
        const time = math.bignumber(new Date(entryTime).getTime());
        return sum.add(time.mul(math.bignumber(amount)));
    }, math.bignumber(0));
}
