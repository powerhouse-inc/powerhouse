import JSZip from 'jszip';
import { createDocument, loadFromFile, saveToFile } from '../../document/utils';
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

/**
 *
 * Creates a new BudgetStatement document with an initial state.
 * @param initialState - The initial state of the document.
 * @returns {BudgetStatement} The new BudgetStatement document.
 */
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

/**
 * Creates a new Account with default properties and the given input properties.
 * @param {AccountInput} input - The input properties of the account.
 * @returns {Account} The new Account object.
 */
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

/**
 * Creates a new LineItem with default properties and the given input properties.
 * @param input - The input properties of the line item.
 * @returns {LineItem} The new LineItem object.
 */
export const createLineItem = (
    input: Partial<LineItem> & Pick<LineItem, 'category' | 'group'>
): LineItem => ({
    budgetCap: null,
    payment: null,
    actual: null,
    forecast: [],
    ...input,
});

/**
 * Saves the BudgetStatement document to the specified file path.
 * @param {BudgetStatement} document - The BudgetStatement document to save.
 * @param {string} path - The file path to save the document to.
 * @returns {Promise<string>} A promise that resolves with the saved file path.
 */
export const saveBudgetStatementToFile = (
    document: BudgetStatement,
    path: string
): Promise<string> => {
    return saveToFile(document, path, 'phbs');
};

/**
 * Loads the BudgetStatement document from the specified file path.
 * @param {string} path - The file path to load the document from.
 * @returns {Promise<BudgetStatement>} A promise that resolves with the loaded BudgetStatement document.
 */
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
