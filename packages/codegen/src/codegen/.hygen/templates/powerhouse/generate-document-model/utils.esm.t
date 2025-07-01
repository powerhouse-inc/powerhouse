---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/utils.ts"
force: true
---
import { 
    type DocumentModelUtils,
    baseCreateDocument,
    baseCreateExtendedState,
    baseSaveToFile,
    baseSaveToFileHandle,
    baseLoadFromFile,
    baseLoadFromInput,
    generateId,
 } from 'document-model';
import { 
  <%= 'type ' + h.changeCase.pascal(documentType) %>Document,
  <%= 'type ' + h.changeCase.pascal(documentType) %>State,
  <%= 'type ' + h.changeCase.pascal(documentType) %>LocalState
} from './types.js';
import { reducer } from './reducer.js';

export const initialGlobalState: <%= h.changeCase.pascal(documentType) %>State = <%- initialGlobalState %>;
export const initialLocalState: <%= h.changeCase.pascal(documentType) %>LocalState = <%- initialLocalState %>;
//00;a;lioadsf0-==-03940LK#:L$K
const utils: DocumentModelUtils<<%= h.changeCase.pascal(documentType) %>Document> = {
    fileExtension: '<%- fileExtension %>',
    createState(state) {
        return { global: { ...initialGlobalState, ...state?.global }, local: { ...initialLocalState, ...state?.local } };
    },
    createExtendedState(extendedState) {
        return baseCreateExtendedState(
            { ...extendedState },
            utils.createState
        );
    },
    createDocument(state) {
        const document = baseCreateDocument(
            utils.createExtendedState(state),
            utils.createState
        );

        document.header.documentType = '<%- documentTypeId %>';

        // for backwards compatibility, but this is NOT a valid signed document id
        document.header.id = generateId();

        return document;
    },
    saveToFile(document, path, name) {
        return baseSaveToFile(document, path, '<%- fileExtension %>', name);
    },
    saveToFileHandle(document, input) {
        return baseSaveToFileHandle(document, input);
    },
    loadFromFile(path) {
        return baseLoadFromFile(path, reducer);
    },
    loadFromInput(input) {
        return baseLoadFromInput(input, reducer);
    },
};

export default utils;