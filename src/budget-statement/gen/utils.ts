import { DocumentModelUtils, utils as base } from '../../document';
import { BudgetStatementAction, BudgetStatementState } from './types';
import { reducer } from './reducer';

const initialState: BudgetStatementState = {
    "owner": {
        "ref": null,
        "id": null,
        "title": null
    },
    "month": null,
    "quoteCurrency": null,
    "vesting": [],
    "ftes": null,
    "accounts": [],
    "auditReports": [],
    "comments": []
};

const utils: DocumentModelUtils<BudgetStatementState, BudgetStatementAction> = {
    fileExtension: 'phbs',
    createState(state) {
        return  { ...initialState, ...state } ;
    },
    createExtendedState(extendedState) {
        return base.createExtendedState(
            { ...extendedState, documentType: 'powerhouse/budget-statement' },
            utils.createState
        );
    },
    createDocument(state) {
        return base.createDocument(
            utils.createExtendedState(state),
            utils.createState
        );
    },
    saveToFile(document, path, name) {
        return base.saveToFile(document, path, 'phbs', name);
    },
    saveToFileHandle(document, input) {
        return base.saveToFileHandle(document, input);
    },
    loadFromFile(path) {
        return base.loadFromFile(path, reducer);
    },
    loadFromInput(input) {
        return base.loadFromInput(input, reducer);
    },
};

export default utils;