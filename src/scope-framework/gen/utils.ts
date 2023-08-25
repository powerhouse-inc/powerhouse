import { DocumentModelUtils, utils as base } from '../../document';
import { ScopeFrameworkAction, ScopeFrameworkState } from './types';
import { reducer } from './reducer';

const initialState: ScopeFrameworkState = {
    "rootPath": "A",
    "elements": [
        {
            "id": "iwPYQckR3Ldv6sIK2wmyCq6JYBY=",
            "name": "Scope Name",
            "version": 1,
            "type": "Scope",
            "path": "A.1",
            "components": {
                "content": "Scope description goes here."
            }
        }
    ]
};

const utils: DocumentModelUtils<ScopeFrameworkState, ScopeFrameworkAction> = {
    fileExtension: 'mdsf',
    createState(state) {
        return  { ...initialState, ...state } ;
    },
    createExtendedState(extendedState) {
        return base.createExtendedState(
            { ...extendedState, documentType: 'makerdao/scope-framework' },
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
        return base.saveToFile(document, path, 'mdsf', name);
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