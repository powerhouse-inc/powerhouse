type NumericKeys<T> = {
    [K in keyof T]: T[K] extends number ? K : never;
}[keyof T];

export function sumTotalForProperty<T extends Record<string, any>>(
    items: T[],
    property: NumericKeys<T>,
): number {
    return items.reduce((acc, item) => acc + Number(item[property]), 0);
}
