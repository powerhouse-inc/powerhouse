import { DocumentModelUtils, utils as base } from '../../document';
import { DocumentModelAction, DocumentModelState } from './types';
import { reducer } from './reducer';

const initialState: DocumentModelState = {
    id: '',
    name: '',
    extension: '',
    description: '',
    author: {
        name: '',
        website: '',
    },
    specifications: [
        {
            version: 1,
            changeLog: [],
            state: {
                schema: '',
                initialValue: '',
                examples: [],
            },
            modules: [],
        },
    ],
};

const utils: DocumentModelUtils<DocumentModelState, DocumentModelAction> = {
    fileExtension: 'phdm',
    createState(state) {
        return { ...initialState, ...state };
    },
    createExtendedState(extendedState) {
        return base.createExtendedState(
            { ...extendedState, documentType: 'powerhouse/document-model' },
            utils.createState,
        );
    },
    createDocument(state) {
        return base.createDocument(
            utils.createExtendedState(state),
            utils.createState,
        );
    },
    saveToFile(document, path, name) {
        return base.saveToFile(document, path, 'phdm', name);
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
