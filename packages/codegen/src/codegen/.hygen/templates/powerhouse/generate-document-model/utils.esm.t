---
to: "<%= rootDir %>/<%= paramCaseDocumentType %>/gen/utils.ts"
force: true
---
import type {
    DocumentModelUtils,
} from "document-model";
import { 
    baseCreateDocument,
    baseSaveToFileHandle,
    baseLoadFromInput,
    defaultBaseState,
    generateId,
 } from 'document-model/core';
import type { 
  <%= globalStateName %>,
  <%= localStateName %>
} from './types.js';
import type { <%= phStateName %> } from './types.js';
import { reducer } from './reducer.js';
import { <%= documentTypeVariableName %> } from "./document-type.js";
import {
  <%= isPhDocumentOfTypeFunctionName %>,
  <%= assertIsPhDocumentOfTypeFunctionName %>,
  <%= isPhStateOfTypeFunctionName %>,
  <%= assertIsPhStateOfTypeFunctionName %>,
} from "./document-schema.js";

export const initialGlobalState: <%= globalStateName %> = <%- initialGlobalState %>;
export const initialLocalState: <%= localStateName %> = <%- initialLocalState %>;

export const utils: DocumentModelUtils<<%= phStateName %>> = {
    fileExtension: '<%- fileExtension %>',
    createState(state) {
        return { ...defaultBaseState(), global: { ...initialGlobalState, ...state?.global }, local: { ...initialLocalState, ...state?.local } };
    },
    createDocument(state) {
        const document = baseCreateDocument(
            utils.createState,
            state
        );

        document.header.documentType = <%= documentTypeVariableName %>;

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
    isStateOfType(state) {
        return <%= isPhStateOfTypeFunctionName %>(state);
    },
    assertIsStateOfType(state) {
        return <%= assertIsPhStateOfTypeFunctionName %>(state);
    },
    isDocumentOfType(document) {
        return <%= isPhDocumentOfTypeFunctionName %>(document);
    },
    assertIsDocumentOfType(document) {
        return <%= assertIsPhDocumentOfTypeFunctionName %>(document);
    },
};

export const createDocument = utils.createDocument;
export const createState = utils.createState;
export const saveToFileHandle = utils.saveToFileHandle;
export const loadFromInput = utils.loadFromInput;
export const isStateOfType = utils.isStateOfType;
export const assertIsStateOfType = utils.assertIsStateOfType;
export const isDocumentOfType = utils.isDocumentOfType;
export const assertIsDocumentOfType = utils.assertIsDocumentOfType;
