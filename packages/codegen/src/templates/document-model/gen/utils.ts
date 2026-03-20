import type { DocumentModelTemplateInputs } from "@powerhousedao/codegen/file-builders";
import { ts } from "@tmpl/core";

export const documentModelGenUtilsTemplate = (v: DocumentModelTemplateInputs) =>
  ts`
import type {
    DocumentModelUtils,
} from "document-model";
import {
    baseCreateDocument,
    baseSaveToFileHandle,
    baseLoadFromInput,
    defaultBaseState,
    generateId,
 } from 'document-model';
import {
  ${v.assertIsPhDocumentOfTypeFunctionName},
  ${v.assertIsPhStateOfTypeFunctionName},
  ${v.isPhDocumentOfTypeFunctionName},
  ${v.isPhStateOfTypeFunctionName},
} from "./document-schema.js";
import { ${v.documentTypeVariableName} } from "./document-type.js";
import { reducer } from './reducer.js';
import type { ${v.globalStateName}, ${v.localStateName}, ${v.phStateName} } from './types.js';

export const initialGlobalState: ${v.globalStateName} = ${v.initialGlobalState};
export const initialLocalState: ${v.localStateName} = ${v.initialLocalState};

export const utils: DocumentModelUtils<${v.phStateName}> = {
    fileExtension: "${v.fileExtension}",
    createState(state) {
        return { ...defaultBaseState(), global: { ...initialGlobalState, ...state?.global }, local: { ...initialLocalState, ...state?.local } };
    },
    createDocument(state) {
        const document = baseCreateDocument(
            utils.createState,
            state
        );

        document.header.documentType = ${v.documentTypeVariableName};

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
        return ${v.isPhStateOfTypeFunctionName}(state);
    },
    assertIsStateOfType(state) {
        return ${v.assertIsPhStateOfTypeFunctionName}(state);
    },
    isDocumentOfType(document) {
        return ${v.isPhDocumentOfTypeFunctionName}(document);
    },
    assertIsDocumentOfType(document) {
        return ${v.assertIsPhDocumentOfTypeFunctionName}(document);
    },
};


`.raw;
