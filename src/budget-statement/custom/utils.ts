import { createDocument, loadFromFile, saveToFile } from '../../document';
import { reducer } from './reducer';
import {
    Account,
    AccountInput,
    BudgetStatement,
    BudgetStatementAction,
    LineItem,
    State,
} from './types';

export const createBudgetStatement = (
    initialState?: Partial<
        Omit<BudgetStatement, 'data'> & {
            data: Partial<BudgetStatement['data']>;
        }
    >
): BudgetStatement =>
    createDocument<State, BudgetStatementAction>({
        documentType: 'powerhouse/budget-statement',
        ...initialState,
        data: {
            owner: {
                ref: null,
                id: null,
                title: null,
            },
            month: null,
            status: 'Draft',
            quoteCurrency: null,
            accounts: [],
            auditReports: [],
            ...initialState?.data,
        },
    });

export const createAccount = (input: AccountInput): Account => ({
    name: '',
    accountBalance: {
        timestamp: null,
        value: null,
    },
    targetBalance: {
        comment: null,
        value: null,
    },
    topupTransaction: {
        id: null,
        requestedValue: null,
        value: null,
    },
    lineItems: [],
    ...input,
});

export const createLineItem = (
    input: Partial<LineItem> & Pick<LineItem, 'category' | 'group'>
): LineItem => ({
    budgetCap: null,
    payment: null,
    actual: null,
    forecast: [],
    ...input,
});

export const saveBudgetStatementToFile = (
    document: BudgetStatement,
    path: string
): Promise<string> => {
    return saveToFile(document, path, 'phbs');
};

export const loadBudgetStatementFromFile = (
    path: string
): Promise<BudgetStatement> => {
    return loadFromFile<State, BudgetStatementAction>(path, reducer);
};
