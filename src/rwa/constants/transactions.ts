export const groupTransactionTypes = [
    'AssetPurchase',
    'AssetSale',
    'InterestDraw',
    'InterestReturn',
    'PrincipalDraw',
    'PrincipalReturn',
    'FeesPayment',
] as const;

export const groupTransactionTypeLabels = {
    AssetPurchase: 'Asset purchase',
    AssetSale: 'Asset sale',
    InterestDraw: 'Interest draw',
    InterestReturn: 'Interest return',
    PrincipalDraw: 'Principal draw',
    PrincipalReturn: 'Principal return',
    FeesPayment: 'Fees payment',
} as const;
