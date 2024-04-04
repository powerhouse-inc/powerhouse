export const ASSET_PURCHASE = 'AssetPurchase';
export const ASSET_SALE = 'AssetSale';
export const PRINCIPAL_DRAW = 'PrincipalDraw';
export const PRINCIPAL_RETURN = 'PrincipalReturn';
export const INTEREST_PAYMENT = 'InterestPayment';
export const FEES_PAYMENT = 'FeesPayment';

export const principalGroupTransactions = [
    PRINCIPAL_DRAW,
    PRINCIPAL_RETURN,
] as const;

export const assetGroupTransactions = [ASSET_PURCHASE, ASSET_SALE] as const;

export const allGroupTransactionTypes = [
    ...principalGroupTransactions,
    ...assetGroupTransactions,
    INTEREST_PAYMENT,
    FEES_PAYMENT,
] as const;

export const groupTransactionTypeLabels = {
    AssetPurchase: 'Asset purchase',
    AssetSale: 'Asset sale',
    PrincipalDraw: 'Principal draw',
    PrincipalReturn: 'Principal return',
    InterestPayment: 'Interest payment',
    FeesPayment: 'Fees payment',
} as const;
