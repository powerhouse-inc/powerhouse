import {
    FormattedNumber,
    GroupTransactionType,
    ItemData,
    TableItem,
    TransactionFeeInput,
    cashTransactionSignByTransactionType,
    formatDateForDisplay,
} from '@/rwa';
import { InputMaybe } from 'document-model/document';

export function isISODate(str: string) {
    if (!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/.test(str)) return false;
    const d = new Date(str);
    return d instanceof Date && !isNaN(d.getTime()) && d.toISOString() === str;
}

export function handleDateInTable(maybeDate: string | Date) {
    const isDate = maybeDate instanceof Date || isISODate(maybeDate);
    if (isDate) {
        const dateStr =
            maybeDate instanceof Date ? maybeDate.toISOString() : maybeDate;
        return formatDateForDisplay(dateStr);
    }
    return maybeDate;
}

export function handleTableDatum(datum: ItemData) {
    if (datum === null || datum === undefined) return '--';

    if (typeof datum === 'number') return <FormattedNumber value={datum} />;

    return handleDateInTable(datum);
}

export function getItemById<TItem extends TableItem = TableItem>(
    id: string | null | undefined,
    items: TItem[] | null | undefined,
) {
    return items?.find(item => item.id === id);
}

export function addItemNumber<TItem extends TableItem>(items: TItem[]) {
    return items.map((item, index) => ({
        ...item,
        itemNumber: index + 1,
    }));
}

export function calculateUnitPrice(
    cashAmount: InputMaybe<number>,
    fixedIncomeAmount: InputMaybe<number>,
) {
    if (!cashAmount || !fixedIncomeAmount) return 0;
    return cashAmount / fixedIncomeAmount;
}

export function calculateCashBalanceChange(
    transactionType: InputMaybe<GroupTransactionType>,
    cashAmount: InputMaybe<number>,
    fees: InputMaybe<TransactionFeeInput[]>,
) {
    if (!cashAmount || !transactionType) return 0;

    const sign = cashTransactionSignByTransactionType[transactionType];

    const feeAmounts = fees?.map(fee => fee.amount).filter(Boolean) ?? [];

    const totalFees = feeAmounts.reduce((acc, fee) => acc + fee, 0);

    return cashAmount * sign - totalFees;
}
