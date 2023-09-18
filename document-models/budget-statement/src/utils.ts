import {
    Account,
    AddAccountInput,
    LineItem,
    LineItemForecast,
    LineItemInput,
} from '../gen/schema/types';

/**
 * Creates a new Account with default properties and the given input properties.
 * @param input - The input properties of the account.
 * @returns The new Account object.
 */
export const createAccount = (input: AddAccountInput): Account => ({
    ...input,
    name: input.name ?? '',
    lineItems: input.lineItems?.map(createLineItem) ?? new Array<LineItem>(),
});

/**
 * Creates a new LineItem with default properties and the given input properties.
 * @param input - The input properties of the line item.
 * @returns The new LineItem object.
 */
export const createLineItem = (input: LineItemInput): LineItem => {
    return {
        budgetCap: null,
        payment: null,
        actual: null,
        comment: null,
        ...input,
        forecast:
            input.forecast?.sort((f1, f2) =>
                f1.month.localeCompare(f2.month),
            ) ?? new Array<LineItemForecast>(),
        headcountExpense: input.headcountExpense ?? false,
        group: input.group ?? null,
        category: input.category ?? null,
    };
};
