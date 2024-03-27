import { FormattedNumber, TableItem, formatDateForDisplay } from '@/rwa';

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

export function handleTableDatum(
    datum: string | number | Date | null | undefined,
) {
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
