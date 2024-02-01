import { GroupTransactionType } from '..';

export const PrincipalDraw = 'PrincipalDraw' as const;
export const PrincipalReturn = 'PrincipalReturn' as const;
export const AssetPurchase = 'AssetPurchase' as const;
export const AssetSale = 'AssetSale' as const;
export const InterestDraw = 'InterestDraw' as const;
export const InterestReturn = 'InterestReturn' as const;
export const FeesPayment = 'FeesPayment' as const;
export const cashTransaction = 'cashTransaction' as const;
export const fixedIncomeTransaction = 'fixedIncomeTransaction' as const;
export const interestTransaction = 'interestTransaction' as const;
export const feeTransactions = 'feeTransactions' as const;

export const allPossibleAllowedTransactions = [
    cashTransaction,
    fixedIncomeTransaction,
    interestTransaction,
    feeTransactions,
] as const;

export type AllowedTransaction =
    (typeof allPossibleAllowedTransactions)[number];

export const groupTransactionTypesToAllowedTransactions: Record<
    GroupTransactionType,
    AllowedTransaction
> = {
    PrincipalDraw: cashTransaction,
    PrincipalReturn: cashTransaction,
    AssetPurchase: fixedIncomeTransaction,
    AssetSale: fixedIncomeTransaction,
    InterestDraw: interestTransaction,
    InterestReturn: interestTransaction,
    FeesPayment: feeTransactions,
} as const;
