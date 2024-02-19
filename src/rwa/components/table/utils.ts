export function isISODate(str: string) {
    if (!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/.test(str)) return false;
    const d = new Date(str);
    return d instanceof Date && !isNaN(d.getTime()) && d.toISOString() === str;
}

export function maybeStripTime(
    maybeDate: string | number | Date | null | undefined,
) {
    if (!maybeDate || typeof maybeDate === 'number') return maybeDate;
    const isDate = maybeDate instanceof Date || isISODate(maybeDate);
    if (isDate) {
        const dateStr =
            maybeDate instanceof Date ? maybeDate.toISOString() : maybeDate;
        return dateStr.split('T')[0];
    }
    return maybeDate;
}
