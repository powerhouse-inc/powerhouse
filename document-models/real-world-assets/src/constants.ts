import { GroupTransactionType } from '..';

export const PRINCIPAL_DRAW = 'PrincipalDraw' as const;
export const PRINCIPAL_RETURN = 'PrincipalReturn' as const;
export const ASSET_PURCHASE = 'AssetPurchase' as const;
export const ASSET_SALE = 'AssetSale' as const;
export const INTEREST_DRAW = 'InterestDraw' as const;
export const INTEREST_RETURN = 'InterestReturn' as const;
export const FEES_PAYMENT = 'FeesPayment' as const;
export const CASH_TRANSACTION = 'cashTransaction' as const;
export const FIXED_INCOME_TRANSACTION = 'fixedIncomeTransaction' as const;
export const INTEREST_TRANSACTION = 'interestTransaction' as const;
export const FEE_TRANSACTIONS = 'feeTransactions' as const;

export const allPossibleAllowedTransactions = [
    CASH_TRANSACTION,
    FIXED_INCOME_TRANSACTION,
    INTEREST_TRANSACTION,
    FEE_TRANSACTIONS,
] as const;

export type AllowedTransactions =
    (typeof allPossibleAllowedTransactions)[number][];

export const groupTransactionTypesToAllowedTransactions: Record<
    GroupTransactionType,
    AllowedTransactions
> = {
    [PRINCIPAL_DRAW]: [CASH_TRANSACTION, FEE_TRANSACTIONS],
    [PRINCIPAL_RETURN]: [CASH_TRANSACTION, FEE_TRANSACTIONS],
    [ASSET_PURCHASE]: [
        FIXED_INCOME_TRANSACTION,
        CASH_TRANSACTION,
        FEE_TRANSACTIONS,
    ],
    [ASSET_SALE]: [
        FIXED_INCOME_TRANSACTION,
        CASH_TRANSACTION,
        FEE_TRANSACTIONS,
    ],
    [INTEREST_DRAW]: [INTEREST_TRANSACTION],
    [INTEREST_RETURN]: [INTEREST_TRANSACTION],
    [FEES_PAYMENT]: [FEE_TRANSACTIONS],
} as const;
