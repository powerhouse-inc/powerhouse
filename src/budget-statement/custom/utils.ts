import { createDocument } from '../../document';
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
