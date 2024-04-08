import { GroupTransaction, RealWorldAssetsState } from '../..';
import {
    ASSET_PURCHASE,
    ASSET_SALE,
    FIXED_INCOME_TRANSACTION,
} from '../constants';

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
