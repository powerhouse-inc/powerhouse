import { FixedIncome } from '@/rwa/types';

export function makeFixedIncomeOptionLabel(fixedIncome: FixedIncome) {
    let label = fixedIncome.name;
    if (fixedIncome.ISIN) {
        label += ` - ${fixedIncome.ISIN}`;
    }
    if (fixedIncome.CUSIP) {
        label += ` - ${fixedIncome.CUSIP}`;
    }
    return label;
}
