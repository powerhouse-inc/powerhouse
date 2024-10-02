import {
    ASSET_PURCHASE,
    ASSET_SALE,
    FEES_INCOME,
    FEES_PAYMENT,
    INTEREST_INCOME,
    INTEREST_PAYMENT,
    PRINCIPAL_DRAW,
    PRINCIPAL_RETURN,
} from '../../constants';
import type { GroupTransactionType } from '../../types';

export const defaultColumnCountByTableWidth = {
    1520: 10,
    1394: 9,
    1239: 8,
    1112: 7,
    984: 6,
};

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

export const assetTransactionSignByTransactionType: Record<
    typeof ASSET_PURCHASE | typeof ASSET_SALE,
    -1 | 1
> = {
    [ASSET_SALE]: -1,
    [ASSET_PURCHASE]: 1,
} as const;
