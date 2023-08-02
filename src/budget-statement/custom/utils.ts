import { LineItemForecast } from '@acaldas/document-model-graphql/budget-statement';
import { ExtendedState } from '../../document';
import type { FileInput } from '../../document/utils';
import {
    createDocument,
    loadFromFile,
    loadFromInput,
    saveToFile,
    saveToFileHandle,
} from '../../document/utils';
import { reducer } from './reducer';
import {
    Account,
    AccountInput,
    BudgetStatementAction,
    BudgetStatementDocument,
    BudgetStatementState,
    LineItem,
    LineItemInput,
} from './types';

/**
 *
 * Creates a new BudgetStatement document with an initial state.
 * @param initialState - The initial state of the document.
 * @returns The new BudgetStatement document.
 */

export function createBudgetStatement(
    initialState?: Partial<ExtendedState<Partial<BudgetStatementState>>>
): BudgetStatementDocument {
    return createDocument<BudgetStatementState, BudgetStatementAction>({
        documentType: 'powerhouse/budget-statement',
        ...initialState,
        state: {
            owner: {
                ref: null,
                id: null,
                title: null,
            },
            month: null,
            quoteCurrency: null,
            vesting: [],
            ftes: null,
            accounts: [],
            auditReports: [],
            comments: [],
            ...initialState?.state,
        },
    });
}

/**
 * Creates a new Account with default properties and the given input properties.
 * @param input - The input properties of the account.
 * @returns The new Account object.
 */
export const createAccount = (input: AccountInput): Account => ({
    ...input,
    name: input.name ?? '',
    lineItems: input.lineItems?.map(createLineItem) ?? new Array<LineItem>(),
});

/**
 * Creates a new LineItem with default properties and the given input properties.
 * @param input - The input properties of the line item.
 * @returns The new LineItem object.
 */
export const createLineItem = (input: LineItemInput): LineItem => ({
    budgetCap: null,
    payment: null,
    actual: null,
    comment: null,
    ...input,
    forecast:
        input.forecast?.sort((f1, f2) => f1.month.localeCompare(f2.month)) ??
        new Array<LineItemForecast>(),
    headcountExpense: input.headcountExpense ?? false,
    group: input.group ?? null,
    category: input.category ?? null,
});

/**
 * Saves the BudgetStatement document to the specified file path.
 * @param document - The BudgetStatement document to save.
 * @param path - The file path to save the document to.
 * @returns  A promise that resolves with the saved file path.
 */
export const saveBudgetStatementToFile = (
    document: BudgetStatementDocument,
    path: string,
    name?: string
): Promise<string> => {
    return saveToFile(document, path, 'phbs', name);
};

/**
 * Loads the BudgetStatement document from the specified file path.
 * @param path - The file path to load the document from.
 * @returns A promise that resolves with the loaded BudgetStatement document.
 */
export const loadBudgetStatementFromFile = async (
    path: string
): Promise<BudgetStatementDocument> => {
    return loadFromFile(path, reducer);
};

export const loadBudgetStatementFromInput = async (
    input: FileInput
): Promise<BudgetStatementDocument> => {
    return loadFromInput(input, reducer);
};

export const saveBudgetStatementToFileHandle = async (
    document: BudgetStatementDocument,
    input: FileSystemFileHandle
) => {
    return saveToFileHandle(document, input);
};
