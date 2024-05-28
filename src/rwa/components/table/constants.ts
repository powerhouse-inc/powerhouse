import {
    ASSET_PURCHASE,
    ASSET_SALE,
    FEES_PAYMENT,
    GroupTransactionType,
    INTEREST_PAYMENT,
    PRINCIPAL_DRAW,
    PRINCIPAL_RETURN,
} from '@/rwa';

export const defaultColumnCountByTableWidth = {
    1520: 9,
    1394: 8,
    1239: 7,
    1112: 6,
    984: 5,
};

export const cashTransactionSignByTransactionType: Record<
    GroupTransactionType,
    -1 | 1
> = {
    [ASSET_SALE]: 1,
    [PRINCIPAL_DRAW]: 1,
    [ASSET_PURCHASE]: -1,
    [PRINCIPAL_RETURN]: -1,
    [FEES_PAYMENT]: -1,
    [INTEREST_PAYMENT]: -1,
} as const;

export const assetTransactionSignByTransactionType: Record<
    typeof ASSET_PURCHASE | typeof ASSET_SALE,
    -1 | 1
> = {
    [ASSET_SALE]: -1,
    [ASSET_PURCHASE]: 1,
} as const;
