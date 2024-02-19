export function maybeStripTime(
    maybeDate: string | number | Date | null | undefined,
) {
    if (!maybeDate || typeof maybeDate === 'number') return maybeDate;
    const isDate =
        maybeDate instanceof Date || !isNaN(new Date(maybeDate).getTime());
    if (isDate) {
        const dateStr =
            maybeDate instanceof Date ? maybeDate.toISOString() : maybeDate;
        return dateStr.split('T')[0];
    }
    return maybeDate;
}
