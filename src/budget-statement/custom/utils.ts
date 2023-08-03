/**
 * This is a scaffold file meant for customization:
 * - modify it by implementing the empty state object
 * - delete the file and run the code generator again to have it reset
 */

import {
    Account,
    AddAccountInput,
    BudgetStatementState,
    LineItem,
    LineItemForecast,
    LineItemInput,
} from '@acaldas/document-model-graphql/budget-statement';
import { reducer } from '..';
import { ExtendedState } from '../../document';
import {
    createDocument,
    FileInput,
    loadFromFile,
    loadFromInput,
    saveToFile,
    saveToFileHandle,
} from '../../document/utils';
import {
    BudgetStatementAction,
    BudgetStatementDocument,
    ExtendedBudgetStatementState,
} from '../gen';

export const createEmptyBudgetStatementState = (): BudgetStatementState => ({
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
});

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
                f1.month.localeCompare(f2.month)
            ) ?? new Array<LineItemForecast>(),
        headcountExpense: input.headcountExpense ?? false,
        group: input.group ?? null,
        category: input.category ?? null,
    };
};

const dateTimeNow = new Date().toISOString();
export const createEmptyExtendedBudgetStatementState =
    (): ExtendedBudgetStatementState => ({
        name: '',
        created: dateTimeNow,
        lastModified: dateTimeNow,
        documentType: 'powerhouse/budget-statement',
        revision: 0,
        state: createEmptyBudgetStatementState(),
        attachments: {},
    });

export const createBudgetStatement = (
    initialState?: Partial<ExtendedState<Partial<BudgetStatementState>>>
): BudgetStatementDocument => {
    return createDocument<BudgetStatementState, BudgetStatementAction>({
        ...createEmptyExtendedBudgetStatementState(),
        ...initialState,
        state: {
            ...createEmptyBudgetStatementState(),
            ...initialState?.state,
        },
    });
};

export const loadBudgetStatementFromFile = async (path: string) => {
    return loadFromFile<BudgetStatementState, BudgetStatementAction>(
        path,
        reducer
    );
};

export const loadBudgetStatementFromInput = async (
    input: FileInput
): Promise<BudgetStatementDocument> => {
    return loadFromInput<BudgetStatementState, BudgetStatementAction>(
        input,
        reducer
    );
};

export const saveBudgetStatementToFile = (
    document: BudgetStatementDocument,
    path: string,
    name?: string
): Promise<string> => {
    return saveToFile(document, path, 'phbs', name);
};

export const saveBudgetStatementToFileHandle = async (
    document: BudgetStatementDocument,
    input: FileSystemFileHandle
) => {
    return saveToFileHandle(document, input);
};
