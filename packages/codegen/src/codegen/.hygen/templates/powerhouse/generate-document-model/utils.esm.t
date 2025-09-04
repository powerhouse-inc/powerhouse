---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/utils.ts"
force: true
---
import { 
    type DocumentModelUtils,
    baseCreateDocument,
    baseSaveToFileHandle,
    baseLoadFromInput,
    defaultBaseState,
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

const utils: DocumentModelUtils<<%= h.changeCase.pascal(documentType) %>Document> = {
    fileExtension: '<%- fileExtension %>',
    createState(state) {
        return { ...defaultBaseState(), global: { ...initialGlobalState, ...state?.global }, local: { ...initialLocalState, ...state?.local } };
    },
    createDocument(state) {
        const document = baseCreateDocument(
            utils.createState,
            state
        );

        document.header.documentType = '<%- documentTypeId %>';

        // for backwards compatibility, but this is NOT a valid signed document id
        document.header.id = generateId();

        return document;
    },
    saveToFileHandle(document, input) {
        return baseSaveToFileHandle(document, input);
    },
    loadFromInput(input) {
        return baseLoadFromInput(input, reducer);
    },
};

export const createDocument = utils.createDocument;
export const createState = utils.createState;
export const saveToFileHandle = utils.saveToFileHandle;
export const loadFromInput = utils.loadFromInput;

export default utils;