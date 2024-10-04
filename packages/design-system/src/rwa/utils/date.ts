import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

/**
 * The html datetime local input requires this specific format
 */
export function convertToDateTimeLocalFormat(date: Date | string = new Date()) {
    return format(date, "yyyy-MM-dd'T'HH:mm");
}
export function formatDateForDisplay(date: Date | string, displayTime = true) {
    const formatString = displayTime
        ? 'yyyy/MM/dd, HH:mm:ss zzz'
        : 'yyyy/MM/dd';

    return formatInTimeZone(date, 'UTC', formatString);
}

export function isISODate(str: string) {
    if (!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/.test(str)) return false;
    const d = new Date(str);
    return d instanceof Date && !isNaN(d.getTime()) && d.toISOString() === str;
}
