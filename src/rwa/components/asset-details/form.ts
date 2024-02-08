import { FixedIncomeType, SPV } from '@/rwa';
import { CalendarDate } from '@internationalized/date';

export type RWAAssetDetailInputs = {
    fixedIncomeType: FixedIncomeType;
    spv: SPV;
    maturity: CalendarDate;
    name: string;
    ISIN?: string;
    CUSIP?: string;
    coupon?: number;
};
