import { FixedIncomeType, SPV } from '@/rwa';
import { CalendarDate } from '@internationalized/date';

export type RWAAssetDetailInputs = {
    fixedIncomeTypeId: FixedIncomeType['id'];
    spvId: SPV['id'];
    maturity: CalendarDate;
    name: string;
    ISIN?: string;
    CUSIP?: string;
    coupon?: number;
};
