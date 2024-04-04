import { z } from 'zod';
import {
    Asset,
    BaseTransaction,
    Cash,
    EditBaseTransactionInput,
    FixedIncome,
    GroupTransaction,
    GroupTransactionType,
    InputMaybe,
    RealWorldAssetsState,
    TransactionFee,
    TransactionFeeInput,
} from '..';
import {
    ASSET_PURCHASE,
    ASSET_SALE,
    FEES_PAYMENT,
    FIXED_INCOME_TRANSACTION,
    INTEREST_DRAW,
    INTEREST_RETURN,
    PRINCIPAL_DRAW,
    PRINCIPAL_RETURN,
} from './constants';

export const dateValidator = z.coerce.date();

const numberValidator = z.number();

export function isFixedIncomeAsset(
    asset: Asset | undefined | null,
): asset is FixedIncome {
    if (!asset) return false;
    return 'fixedIncomeTypeId' in asset;
}

export function isCashAsset(asset: Asset | undefined | null): asset is Cash {
    if (!asset) return false;
    return 'currency' in asset;
}

export function validateTransactionFee(
    state: RealWorldAssetsState,
    fee: InputMaybe<TransactionFeeInput>,
): asserts fee is TransactionFee {
    if (!fee) {
        throw new Error('Fee does not exist');
    }
    if (!fee.serviceProviderFeeTypeId) {
        throw new Error(`Transaction fee must have a service provider`);
    }
    if (!fee.amount) {
        throw new Error(`Transaction fee must have an amount`);
    }

    if (
        fee.serviceProviderFeeTypeId &&
        !state.serviceProviderFeeTypes.find(
            serviceProvider =>
                serviceProvider.id === fee.serviceProviderFeeTypeId,
        )
    ) {
        throw new Error(
            `Service provider with account id ${fee.serviceProviderFeeTypeId} does not exist!`,
        );
    }
    if (!numberValidator.safeParse(fee.amount).success) {
        throw new Error(`Fee amount must be a number`);
    }
}

export function validateTransactionFees(
    state: RealWorldAssetsState,
    fees: InputMaybe<TransactionFeeInput[]>,
): asserts fees is TransactionFee[] {
    if (!Array.isArray(fees)) {
        throw new Error(`Transaction fees must be an array`);
    }
    fees.forEach(fee => {
        validateTransactionFee(state, fee);
    });
}

export function validateBaseTransaction(
    state: RealWorldAssetsState,
    transaction: EditBaseTransactionInput,
): asserts transaction is BaseTransaction {
    if (!transaction.assetId) {
        throw new Error(`Transaction must have an asset`);
    }
    if (!state.portfolio.find(asset => asset.id === transaction.assetId)) {
        throw new Error(`Asset with id ${transaction.assetId} does not exist!`);
    }
    if (!transaction.amount) {
        throw new Error(`Transaction must have an amount`);
    }
    if (!transaction.entryTime) {
        throw new Error(`Transaction must have an entry time`);
    }

    if (!dateValidator.safeParse(transaction.entryTime).success) {
        throw new Error(`Entry time must be a valid date`);
    }
    if (
        transaction.tradeTime &&
        !dateValidator.safeParse(transaction.tradeTime).success
    ) {
        throw new Error(`Trade time must be a valid date`);
    }
    if (
        transaction.settlementTime &&
        !dateValidator.safeParse(transaction.settlementTime).success
    ) {
        throw new Error(`Settlement time must be a valid date`);
    }
    if (
        transaction.accountId &&
        !state.accounts.find(a => a.id === transaction.accountId)
    ) {
        throw new Error(
            `Account with id ${transaction.accountId} does not exist!`,
        );
    }
    if (
        transaction.counterPartyAccountId &&
        !state.accounts.find(a => a.id === transaction.counterPartyAccountId)
    ) {
        throw new Error(
            `Counter party account with id ${transaction.counterPartyAccountId} does not exist!`,
        );
    }
}

export function validateFixedIncomeTransaction(
    state: RealWorldAssetsState,
    transaction: EditBaseTransactionInput,
): asserts transaction is BaseTransaction {
    validateBaseTransaction(state, transaction);
    if (
        !isFixedIncomeAsset(
            state.portfolio.find(a => a.id === transaction.assetId),
        )
    ) {
        throw new Error(
            `Fixed income transaction must have a fixed income asset as the asset`,
        );
    }
}

export function validateCashTransaction(
    state: RealWorldAssetsState,
    transaction: EditBaseTransactionInput,
): asserts transaction is BaseTransaction {
    validateBaseTransaction(state, transaction);
    if (transaction.counterPartyAccountId !== state.principalLenderAccountId) {
        throw new Error(
            `Cash transaction must have Maker principal lender as the counter party`,
        );
    }
    if (!isCashAsset(state.portfolio.find(a => a.id === transaction.assetId))) {
        throw new Error(`Cash transaction must have a cash asset as the asset`);
    }
}

export function validateInterestTransaction(
    state: RealWorldAssetsState,
    transaction: EditBaseTransactionInput,
): asserts transaction is BaseTransaction {
    validateBaseTransaction(state, transaction);
    if (
        !isFixedIncomeAsset(
            state.portfolio.find(a => a.id === transaction.assetId),
        )
    ) {
        throw new Error(
            `Interest transaction must have a fixed income asset as the asset`,
        );
    }
    if (!transaction.counterPartyAccountId) {
        throw new Error(
            `Interest transaction must have a counter party account`,
        );
    }
    if (
        !state.serviceProviderFeeTypes.find(
            a => a.accountId === transaction.counterPartyAccountId,
        )
    ) {
        throw new Error(
            `Counter party with id ${transaction.counterPartyAccountId} must be a known service provider`,
        );
    }
    if (!numberValidator.positive().safeParse(transaction.amount).success) {
        throw new Error('Interest transaction amount must be positive');
    }
}

export function validateFeeTransactions(
    state: RealWorldAssetsState,
    transactions: EditBaseTransactionInput[],
): asserts transactions is BaseTransaction[] {
    if (!Array.isArray(transactions)) {
        throw new Error(`Fee transactions must be an array`);
    }
    transactions.forEach(transaction => {
        validateFeeTransaction(state, transaction);
    });
}

export function validateFeeTransaction(
    state: RealWorldAssetsState,
    transaction: EditBaseTransactionInput,
): asserts transaction is BaseTransaction {
    if (
        !isFixedIncomeAsset(
            state.portfolio.find(a => a.id === transaction.assetId),
        )
    ) {
        throw new Error(
            `Fee transaction must have a fixed income asset as the asset`,
        );
    }
    if (!transaction.counterPartyAccountId) {
        throw new Error(`Fee transaction must have a counter party account`);
    }
    if (
        !state.serviceProviderFeeTypes.find(
            a => a.accountId === transaction.counterPartyAccountId,
        )
    ) {
        throw new Error(
            `Counter party with id ${transaction.counterPartyAccountId} must be a known service provider`,
        );
    }
    if (!numberValidator.negative().safeParse(transaction.amount).success) {
        throw new Error('Fee transaction amount must be negative');
    }
}

export function validateFixedIncomeAsset(
    state: RealWorldAssetsState,
    asset: InputMaybe<FixedIncome>,
) {
    if (!asset) return;

    if (
        asset.fixedIncomeTypeId &&
        !state.fixedIncomeTypes.find(
            fixedIncomeType => fixedIncomeType.id === asset.fixedIncomeTypeId,
        )
    ) {
        throw new Error(
            `Fixed income type with id ${asset.fixedIncomeTypeId} does not exist!`,
        );
    }
    if (asset.spvId && !state.spvs.find(spv => spv.id === asset.spvId)) {
        throw new Error(`SPV with id ${asset.spvId} does not exist!`);
    }
    if (asset.maturity && !dateValidator.safeParse(asset.maturity).success) {
        throw new Error(`Maturity must be a valid date`);
    }
}

export function makeFixedIncomeAssetWithDerivedFields(
    state: RealWorldAssetsState,
    assetId: string,
) {
    const groupTransactions = getGroupTransactionsForAsset(state, assetId);
    const assetPurchaseGroupTransactions =
        getAssetPurchaseTransactionsFromFixedIncomeTransactions(
            groupTransactions,
        );
    const assetSaleGroupTransactions =
        getAssetSaleTransactionsFromFixedIncomeTransactions(groupTransactions);
    const assetSaleFixedIncomeTransactions =
        getFixedIncomeTransactionsFromGroupTransactions(
            assetSaleGroupTransactions,
        );
    const assetPurchaseFixedIncomeTransactions =
        getFixedIncomeTransactionsFromGroupTransactions(
            assetPurchaseGroupTransactions,
        );
    const asset = state.portfolio.find(a => a.id === assetId);
    if (!asset) {
        throw new Error(`Asset with id ${assetId} does not exist!`);
    }
    const derivedFields = computeFixedIncomeAssetDerivedFields(
        assetPurchaseFixedIncomeTransactions,
        assetSaleFixedIncomeTransactions,
        groupTransactions,
    );
    validateFixedIncomeAssetDerivedFields(derivedFields);
    const newAsset = {
        ...asset,
        ...derivedFields,
    };

    return newAsset;
}

export function computeFixedIncomeAssetDerivedFields(
    assetPurchaseFixedIncomeTransactions: BaseTransaction[],
    assetSaleFixedIncomeTransactions: BaseTransaction[],
    groupTransactions: GroupTransaction[],
) {
    const allFixedIncomeTransactions = [
        ...assetPurchaseFixedIncomeTransactions,
        ...assetSaleFixedIncomeTransactions,
    ];
    const notional = calculateNotional(
        assetPurchaseFixedIncomeTransactions,
        assetSaleFixedIncomeTransactions,
    );
    const purchaseProceeds = calculatePurchaseProceeds(
        assetPurchaseFixedIncomeTransactions,
        groupTransactions,
    );
    const salesProceeds = calculateSalesProceeds(
        assetSaleFixedIncomeTransactions,
    );
    const realizedSurplus = calculateRealizedSurplus(
        salesProceeds,
        purchaseProceeds,
    );
    const purchasePrice = calculatePurchasePrice(notional, purchaseProceeds);
    const totalDiscount = calculateTotalDiscount(notional, purchaseProceeds);
    const purchaseDate = computeWeightedAveragePurchaseDate(
        allFixedIncomeTransactions,
    );

    return {
        notional,
        purchaseProceeds,
        salesProceeds,
        purchasePrice,
        totalDiscount,
        purchaseDate,
        realizedSurplus,
    };
}

export function validateFixedIncomeAssetDerivedFields(
    asset: Partial<FixedIncome>,
) {
    if (
        asset.purchaseDate &&
        !dateValidator.safeParse(asset.purchaseDate).success
    ) {
        throw new Error(`Purchase date must be a valid date`);
    }
    if (asset.notional && !numberValidator.safeParse(asset.notional).success) {
        throw new Error(`Notional must be a number`);
    }
    if (
        asset.purchaseProceeds &&
        !numberValidator.safeParse(asset.purchaseProceeds).success
    ) {
        throw new Error(`Purchase proceeds must be a number`);
    }
    if (
        asset.purchasePrice &&
        !numberValidator.safeParse(asset.purchasePrice).success
    ) {
        throw new Error(`Purchase price must be a number`);
    }
    if (
        asset.totalDiscount &&
        !numberValidator.safeParse(asset.totalDiscount).success
    ) {
        throw new Error(`Total discount must be a number`);
    }
    if (
        asset.salesProceeds &&
        !numberValidator.safeParse(asset.salesProceeds).success
    ) {
        throw new Error(`Annualized yield must be a number`);
    }
    if (
        asset.realizedSurplus &&
        !numberValidator.safeParse(asset.realizedSurplus).success
    ) {
        throw new Error(`Realized surplus must be a number`);
    }
}

export function makeEmptyGroupTransactionByType(
    type: GroupTransactionType,
    id: string,
    entryTime: string = new Date().toISOString(),
) {
    const cashBalanceChange = 0;
    const fees = null;
    const cashTransaction = null;
    const fixedIncomeTransaction = null;
    const interestTransaction = null;
    const feeTransactions = null;
    const base = {
        type,
        id,
        entryTime,
        cashBalanceChange,
        fees,
    };
    switch (type) {
        case PRINCIPAL_DRAW:
        case PRINCIPAL_RETURN: {
            return {
                ...base,
                cashTransaction,
                feeTransactions,
                fixedIncomeTransaction: null,
                interestTransaction: null,
            };
        }
        case ASSET_PURCHASE:
        case ASSET_SALE: {
            return {
                ...base,
                cashTransaction,
                fixedIncomeTransaction,
                feeTransactions,
                interestTransaction: null,
            };
        }
        case INTEREST_DRAW:
        case INTEREST_RETURN: {
            return {
                ...base,
                interestTransaction,
                cashTransaction: null,
                fixedIncomeTransaction: null,
                feeTransactions: null,
            };
        }
        case FEES_PAYMENT: {
            return {
                ...base,
                feeTransactions,
                cashTransaction: null,
                fixedIncomeTransaction: null,
                interestTransaction: null,
            };
        }
    }
}

function roundToNearestDay(date: Date) {
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

export function getGroupTransactionsForAsset(
    state: RealWorldAssetsState,
    assetId: string,
) {
    const transactions: GroupTransaction[] = [];

    for (const transaction of state.transactions) {
        if (
            FIXED_INCOME_TRANSACTION in transaction &&
            transaction[FIXED_INCOME_TRANSACTION]?.assetId === assetId
        ) {
            transactions.push(transaction);
        }
    }

    return transactions;
}

export function getFixedIncomeTransactionsFromGroupTransactions(
    transactions: GroupTransaction[],
) {
    return transactions
        .filter(
            transaction =>
                transaction.type === ASSET_PURCHASE ||
                transaction.type === ASSET_SALE,
        )
        .map(transaction => transaction.fixedIncomeTransaction!);
}

export function getAssetSaleTransactionsFromFixedIncomeTransactions(
    transactions: GroupTransaction[],
) {
    return transactions.filter(transaction => transaction.type === ASSET_SALE);
}

export function getAssetPurchaseTransactionsFromFixedIncomeTransactions(
    transactions: GroupTransaction[],
) {
    return transactions.filter(
        transaction => transaction.type === ASSET_PURCHASE,
    );
}

export function computeWeightedAveragePurchaseDate(
    transactions: BaseTransaction[],
) {
    if (!transactions.length) return new Date().toISOString();
    let sumWeightedTime = 0;
    let sumAmount = 0;

    transactions.forEach(({ entryTime, amount }) => {
        const time = new Date(entryTime).getTime(); // Convert to milliseconds since the epoch
        sumWeightedTime += time * amount; // Weight by the amount
        sumAmount += amount;
    });

    if (sumAmount === 0) throw new Error('Sum of amount cannot be zero.');

    const averageTimeInMs = sumWeightedTime / sumAmount; // Calculate the weighted average in milliseconds
    const averageDate = new Date(averageTimeInMs); // Convert back to a Date object

    // Round to the nearest day
    return roundToNearestDay(averageDate).toISOString();
}

export function calculateNotional(
    assetPurchaseFixedIncomeTransactions: BaseTransaction[],
    assetSaleFixedIncomeTransactions: BaseTransaction[],
) {
    const sumOfAssetPurchaseFixedIncomeTransactions =
        assetPurchaseFixedIncomeTransactions.reduce(
            (sum, transaction) => sum + transaction.amount,
            0,
        );

    const sumOfAssetSaleFixedIncomeTransactions =
        assetSaleFixedIncomeTransactions.reduce(
            (sum, transaction) => sum + transaction.amount,
            0,
        );

    return (
        sumOfAssetPurchaseFixedIncomeTransactions -
        sumOfAssetSaleFixedIncomeTransactions
    );
}

export function calculatePurchaseProceeds(
    assetPurchaseBaseTransactions: BaseTransaction[],
    allGroupTransactions: GroupTransaction[],
) {
    const totalSpentOnPurchases = sumBaseTransactionAmounts(
        assetPurchaseBaseTransactions,
    );
    const totalFees = sumGroupTransactionFees(allGroupTransactions);

    return totalSpentOnPurchases + totalFees;
}

export function calculateSalesProceeds(
    assetSaleFixedIncomeTransactions: BaseTransaction[],
) {
    // total proceeds from sales
    return sumBaseTransactionAmounts(assetSaleFixedIncomeTransactions);
}

export function calculateRealizedSurplus(
    salesProceeds: number,
    purchaseProceeds: number,
) {
    // todo: when interest payment transactions are implemented, change to
    // salesProceeds + interestPayments - purchaseProceeds
    return salesProceeds - purchaseProceeds;
}

export function sumGroupTransactionFees(transactions: GroupTransaction[]) {
    return transactions.reduce((sum, { fees }) => {
        if (!fees) return sum;
        return sum + fees.reduce((feeSum, { amount }) => feeSum + amount, 0);
    }, 0);
}

export function sumBaseTransactionAmounts(transactions: BaseTransaction[]) {
    return transactions.reduce((sum, { amount }) => sum + amount, 0);
}

export function calculatePurchasePrice(
    purchaseProceeds: number,
    notional: number,
) {
    if (notional === 0) return 0;
    return purchaseProceeds / notional;
}

export function calculateTotalDiscount(
    notional: number,
    purchaseProceeds: number,
) {
    return notional - purchaseProceeds;
}

export function getDifferences<T extends object>(
    obj1: T | undefined | null,
    obj2: Partial<T> | undefined | null,
): Partial<T> {
    if (!obj1 || !obj2) return {};

    const differences: Partial<T> = {};

    function isObject(value: any): value is object {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    const compare = (value1: any, value2: any): boolean => {
        if (isObject(value1) && isObject(value2)) {
            // Convert both objects to JSON strings to compare them as a whole.
            const keys1 = Object.keys(value1).sort();
            const keys2 = Object.keys(value2).sort();
            if (
                JSON.stringify(keys1) !== JSON.stringify(keys2) ||
                keys1.some(key =>
                    compare(
                        value1[key as keyof typeof value1],
                        value2[key as keyof typeof value1],
                    ),
                )
            ) {
                return true; // Any difference in object structure or value means they're different.
            }
            return false;
        } else if (Array.isArray(value1) && Array.isArray(value2)) {
            // For arrays, compare their serialized forms.
            return JSON.stringify(value1) !== JSON.stringify(value2);
        } else {
            // For primitives, compare directly.
            return value1 !== value2;
        }
    };

    for (const key of new Set([...Object.keys(obj1), ...Object.keys(obj2)])) {
        if (
            compare(
                obj1[key as keyof typeof obj1],
                obj2[key as keyof typeof obj2],
            )
        ) {
            differences[key as keyof typeof differences] =
                obj2[key as keyof typeof obj2];
        }
    }

    return Object.entries(differences).reduce<Partial<T>>(
        (acc, [key, value]) => {
            if (value !== undefined) {
                // @ts-expect-error generic cannot be inferred
                acc[key] = value;
            }
            return acc;
        },
        {} as Partial<T>,
    );
}
