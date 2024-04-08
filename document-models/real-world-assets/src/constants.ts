import { GroupTransactionType } from '..';

export const PRINCIPAL_DRAW = 'PrincipalDraw' as const;
export const PRINCIPAL_RETURN = 'PrincipalReturn' as const;
export const ASSET_PURCHASE = 'AssetPurchase' as const;
export const ASSET_SALE = 'AssetSale' as const;
export const INTEREST_PAYMENT = 'InterestPayment' as const;
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
    [INTEREST_PAYMENT]: [CASH_TRANSACTION],
    [FEES_PAYMENT]: [CASH_TRANSACTION],
} as const;
