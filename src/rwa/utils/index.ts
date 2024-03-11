import currency from 'currency.js';
import { format } from 'date-fns';

export const USDFormat = (value: number | string) =>
    currency(value, { symbol: '$', precision: 2 }).format();

/**
 * The html datetime local input requires this specific format
 */
export function convertToDateTimeLocalFormat(date: Date | string = new Date()) {
    return format(date, "yyyy-MM-dd'T'HH:mm");
}

export function formatDateForDisplay(date: Date | string) {
    return format(date, 'yyyy-MM-dd HH:mm');
}
