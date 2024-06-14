import { GroupTransactionType } from '..';

export const PRINCIPAL_DRAW = 'PrincipalDraw' as const;
export const PRINCIPAL_RETURN = 'PrincipalReturn' as const;
export const ASSET_PURCHASE = 'AssetPurchase' as const;
export const ASSET_SALE = 'AssetSale' as const;
export const INTEREST_INCOME = 'InterestIncome' as const;
export const INTEREST_PAYMENT = 'InterestPayment' as const;
export const FEES_INCOME = 'FeesIncome' as const;
export const FEES_PAYMENT = 'FeesPayment' as const;
export const CASH_TRANSACTION = 'cashTransaction' as const;
export const FIXED_INCOME_TRANSACTION = 'fixedIncomeTransaction' as const;

export const allPossibleAllowedTransactions = [
    CASH_TRANSACTION,
    FIXED_INCOME_TRANSACTION,
] as const;

export type AllowedTransactions =
    (typeof allPossibleAllowedTransactions)[number][];

export const groupTransactionTypesToAllowedTransactions: Record<
    GroupTransactionType,
    AllowedTransactions
> = {
    [PRINCIPAL_DRAW]: [CASH_TRANSACTION],
    [PRINCIPAL_RETURN]: [CASH_TRANSACTION],
    [ASSET_PURCHASE]: [FIXED_INCOME_TRANSACTION, CASH_TRANSACTION],
    [ASSET_SALE]: [FIXED_INCOME_TRANSACTION, CASH_TRANSACTION],
    [INTEREST_INCOME]: [CASH_TRANSACTION],
    [INTEREST_PAYMENT]: [CASH_TRANSACTION],
    [FEES_INCOME]: [CASH_TRANSACTION],
    [FEES_PAYMENT]: [CASH_TRANSACTION],
} as const;

export const cashTransactionSignByTransactionType: Record<
    GroupTransactionType,
    -1 | 1
> = {
    [ASSET_SALE]: 1,
    [PRINCIPAL_DRAW]: 1,
    [ASSET_PURCHASE]: -1,
    [PRINCIPAL_RETURN]: -1,
    [FEES_INCOME]: 1,
    [FEES_PAYMENT]: -1,
    [INTEREST_INCOME]: 1,
    [INTEREST_PAYMENT]: -1,
} as const;
