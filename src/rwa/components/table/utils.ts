export function maybeStripTime(maybeDate: string | number | null | undefined) {
    if (!maybeDate || typeof maybeDate === 'number') return maybeDate;
    const isDate = !isNaN(new Date(maybeDate).getTime());
    if (isDate) {
        return maybeDate.split('T')[0];
    }
    return maybeDate;
}
