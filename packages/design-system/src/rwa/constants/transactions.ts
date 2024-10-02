export const ASSET_PURCHASE = 'AssetPurchase';
export const ASSET_SALE = 'AssetSale';
export const PRINCIPAL_DRAW = 'PrincipalDraw';
export const PRINCIPAL_RETURN = 'PrincipalReturn';
export const INTEREST_INCOME = 'InterestIncome';
export const INTEREST_PAYMENT = 'InterestPayment';
export const FEES_INCOME = 'FeesIncome';
export const FEES_PAYMENT = 'FeesPayment';

export const principalGroupTransactions = [
    PRINCIPAL_DRAW,
    PRINCIPAL_RETURN,
] as const;

export const assetGroupTransactions = [ASSET_PURCHASE, ASSET_SALE] as const;

export const feesTransactions = [FEES_INCOME, FEES_PAYMENT] as const;

export const interestTransactions = [
    INTEREST_INCOME,
    INTEREST_PAYMENT,
] as const;

export const allGroupTransactionTypes = [
    ...principalGroupTransactions,
    ...assetGroupTransactions,
    ...feesTransactions,
    ...interestTransactions,
] as const;

export const groupTransactionTypeLabels = {
    AssetPurchase: 'Asset purchase',
    AssetSale: 'Asset sale',
    PrincipalDraw: 'Principal draw',
    PrincipalReturn: 'Principal return',
    InterestIncome: 'Interest income',
    InterestPayment: 'Interest payment',
    FeesIncome: 'Fees income',
    FeesPayment: 'Fees payment',
} as const;
