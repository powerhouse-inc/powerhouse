import { ts } from "@tmpl/core";
import type { DocumentModelFileMakerArgs } from "file-builders";

export const documentModelGenUtilsTemplate = (v: DocumentModelFileMakerArgs) =>
  ts`
/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type {
    DocumentModelUtils,
} from "document-model";
import {
    baseCreateDocument,
    baseSaveToFileHandle,
    baseLoadFromInput,
    defaultBaseState,
 } from "document-model";
import { reducer } from './reducer.js';
import { ${v.documentTypeVariableName} } from "./document-type.js";
import {
  ${v.assertIsPhDocumentOfTypeFunctionName},
  ${v.assertIsPhStateOfTypeFunctionName},
  ${v.isPhDocumentOfTypeFunctionName},
  ${v.isPhStateOfTypeFunctionName},
} from "./document-schema.js";
import type { ${v.globalStateName}, ${v.localStateName}, ${v.phStateName} } from './types.js';

export const initialGlobalState: ${v.globalStateName} = ${v.initialGlobalState};
export const initialLocalState: ${v.localStateName} = ${v.initialLocalState};

export const utils: DocumentModelUtils<${v.phStateName}> = {
    fileExtension: "${v.documentModelState.extension}",
    createState(state) {
        return { ...defaultBaseState(), global: { ...initialGlobalState, ...state?.global }, local: { ...initialLocalState, ...state?.local } };
    },
    createDocument(state) {
        return baseCreateDocument(
            utils.createState,
            state,
            ${v.documentTypeVariableName}
        );
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
