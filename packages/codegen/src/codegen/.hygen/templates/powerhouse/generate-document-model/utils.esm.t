---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/utils.ts"
force: true
---
import { 
    type CreateDocument,
    type CreateState,
    type LoadFromFile,
    type LoadFromInput,
    baseCreateDocument,
    baseSaveToFile,
    baseSaveToFileHandle,
    baseLoadFromFile,
    baseLoadFromInput,
    defaultBaseState,
    generateId,
 } from 'document-model';
import { 
  <%= 'type ' + h.changeCase.pascal(documentType) %>State,
  <%= 'type ' + h.changeCase.pascal(documentType) %>LocalState
} from './types.js';
import { <%= h.changeCase.pascal(documentType) %>PHState } from './ph-factories.js';
import { reducer } from './reducer.js';

export const initialGlobalState: <%= h.changeCase.pascal(documentType) %>State = <%- initialGlobalState %>;
export const initialLocalState: <%= h.changeCase.pascal(documentType) %>LocalState = <%- initialLocalState %>;

export const createState: CreateState<<%= h.changeCase.pascal(documentType) %>PHState> = (state) => {
    return { 
        ...defaultBaseState(), 
        global: { ...initialGlobalState, ...(state?.global ?? {}) }, 
        local: { ...initialLocalState, ...(state?.local ?? {}) } 
    };
};

export const createDocument: CreateDocument<<%= h.changeCase.pascal(documentType) %>PHState> = (state) => {
    const document = baseCreateDocument(createState, state);
    document.header.documentType = '<%- documentTypeId %>';
    // for backwards compatibility, but this is NOT a valid signed document id
    document.header.id = generateId();
    return document;
};

export const saveToFile = (document: any, path: string, name?: string) => {
    return baseSaveToFile(document, path, '<%- fileExtension %>', name);
};

export const saveToFileHandle = (document: any, input: any) => {
    return baseSaveToFileHandle(document, input);
};

export const loadFromFile: LoadFromFile<<%= h.changeCase.pascal(documentType) %>PHState> = (path) => {
    return baseLoadFromFile(path, reducer);
};

export const loadFromInput: LoadFromInput<<%= h.changeCase.pascal(documentType) %>PHState> = (input) => {
    return baseLoadFromInput(input, reducer);
};

const utils = {
    fileExtension: '<%- fileExtension %>',
    createState,
    createDocument,
    saveToFile,
    saveToFileHandle,
    loadFromFile,
    loadFromInput,
};

export default utils;