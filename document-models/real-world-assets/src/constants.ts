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

export const principalGroupTransactionTypes = [
    PRINCIPAL_DRAW,
    PRINCIPAL_RETURN,
];

export const assetGroupTransactionTypes = [ASSET_PURCHASE, ASSET_SALE];

export const interestGroupTransactionTypes = [
    INTEREST_INCOME,
    INTEREST_PAYMENT,
];

export const feeGroupTransactionTypes = [FEES_PAYMENT, FEES_INCOME];

export const allGroupTransactionTypes = [
    ...assetGroupTransactionTypes,
    ...principalGroupTransactionTypes,
    ...interestGroupTransactionTypes,
    ...feeGroupTransactionTypes,
];

export const cashTransactionSignByTransactionType: Record<
    GroupTransactionType,
    -1 | 1
> = {
    [ASSET_SALE]: 1,
    [ASSET_PURCHASE]: -1,
    [PRINCIPAL_DRAW]: 1,
    [PRINCIPAL_RETURN]: -1,
    [FEES_INCOME]: 1,
    [FEES_PAYMENT]: -1,
    [INTEREST_INCOME]: 1,
    [INTEREST_PAYMENT]: -1,
} as const;
