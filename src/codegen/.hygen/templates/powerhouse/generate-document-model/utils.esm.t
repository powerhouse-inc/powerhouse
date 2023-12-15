---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/utils.ts"
force: true
---
import { DocumentModelUtils, utils as base } from 'document-model/document';
import { <%= h.changeCase.pascal(documentType) %>Action, <%= h.changeCase.pascal(documentType) %>State, <%= h.changeCase.pascal(documentType) %>LocalState } from './types';
import { reducer } from './reducer';

export const initialGlobalState: <%= h.changeCase.pascal(documentType) %>State = <%- initialGlobalState %>;
export const initialLocalState: <%= h.changeCase.pascal(documentType) %>LocalState = <%- initialLocalState %>;

const utils: DocumentModelUtils<<%= h.changeCase.pascal(documentType) %>State, <%= h.changeCase.pascal(documentType) %>Action, <%= h.changeCase.pascal(documentType) %>LocalState> = {
    fileExtension: '<%- fileExtension %>',
    createState(state) {
        return { global: { ...initialGlobalState, ...state?.global }, local: { ...initialLocalState, ...state?.local } };
    },
    createExtendedState(extendedState) {
        return base.createExtendedState(
            { ...extendedState, documentType: '<%- documentTypeId %>' },
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
        return base.saveToFile(document, path, '<%- fileExtension %>', name);
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