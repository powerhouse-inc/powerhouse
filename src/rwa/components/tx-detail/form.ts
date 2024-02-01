import { CalendarDate } from '@internationalized/date';
import { FeeeItem } from '../fees-table';

export type RWATxDetailInputs = {
    assetTypeId: string;
    timestamp: CalendarDate;
    cusipIsinAssetNameId: string;
    transactionType: string;
    assetProceedsUSD: string;
    feesTable: FeeeItem[];
};

export type RWATxDetailKeyInputs = keyof RWATxDetailInputs;

export type RWATxSelectTypes = 'assetTypeId' | 'cusipIsinAssetNameId';
export type RWATxTextTypes = 'transactionType' | 'assetProceedsUSD';
export type RWATxDateTypes = 'timestamp';
export type RWATxFeesTypes = 'feesTable';
