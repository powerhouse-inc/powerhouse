import { CalendarDate } from '@internationalized/date';

export type RWAAssetDetailInputs = {
    id: string;
    assetTypeId: string;
    purchaseTimestamp: CalendarDate;
    maturityId: string;
    cuisp: string;
    isin: string;
    assetName: string;
    notional: string;
    purchaseProceedsUSD: string;
};
