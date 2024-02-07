import currency from 'currency.js';

export const USDFormat = (value: number | string) =>
    currency(value, { symbol: '$', precision: 2 }).format();
