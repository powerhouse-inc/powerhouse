import { BudgetStatement } from './types';
import { createDocument } from '../../document';
import { BudgetStatementAction } from './types';
import { Account, AccountInput, LineItem, LineItemInput, State } from './types';

export const createBudgetStatement = (
    initialState?: Partial<BudgetStatement>
): BudgetStatement =>
    createDocument<State, BudgetStatementAction>({
        documentType: 'powerhouse/budget-statement',
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
        },
        ...initialState,
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

export const createLineItem = (input: LineItemInput): LineItem => ({
    budgetCap: null,
    payment: null,
    actual: null,
    forecast: [],
    ...input,
});
