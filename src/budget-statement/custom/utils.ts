import JSZip from 'jszip';
import { createDocument, loadFromFile, saveToFile } from '../../document';
import { readFile } from '../../document/utils/node';
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

export const loadBudgetStatementFromFile = async (
    path: string
): Promise<BudgetStatement> => {
    const state = await loadFromFile<State, BudgetStatementAction>(
        path,
        reducer
    );

    const auditReports = state.data.auditReports;
    if (!auditReports.length) {
        return state;
    }

    const file = readFile(path);
    const zip = new JSZip();
    await zip.loadAsync(file);
    const fileRegistry = { ...state.fileRegistry };
    await Promise.all(
        auditReports.map(async audit => {
            const path = audit.report.slice('attachment://'.length);
            const file = await zip.file(path);
            if (!file) {
                throw new Error(`Attachment ${audit.report} not found`);
            }
            const data = await file.async('base64');
            const mimeType = file.comment;
            fileRegistry[audit.report] = { data, mimeType };
        })
    );
    return { ...state, fileRegistry };
};
