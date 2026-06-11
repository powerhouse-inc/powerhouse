import { ts } from "@tmpl/core";
import type { DocumentModelFileMakerArgs } from "file-builders";

function makeOlderReducerImports(
  versions: number[],
  currentVersion: number,
): string {
  return versions
    .filter((k) => k < currentVersion)
    .map(
      (k) =>
        `import { reducer as reducerV${k} } from "../../v${k}/gen/reducer.js";`,
    )
    .join("\n");
}

function makeReducersObject(
  versions: number[],
  currentVersion: number,
): string {
  const entries = versions
    .filter((k) => k <= currentVersion)
    .map((k) => {
      const name = k === currentVersion ? "reducer" : `reducerV${k}`;
      return `${k}: ${name} as unknown as Reducer<PHBaseState>`;
    })
    .join(", ");
  return `{ ${entries} }`;
}

export const documentModelGenUtilsTemplate = (v: DocumentModelFileMakerArgs) =>
  ts`
/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type {
    DocumentModelUtils,
    PHBaseState,
    Reducer,
} from "document-model";
import {
    baseCreateDocument,
    baseSaveToFileHandle,
    baseLoadFromInputVersioned,
    defaultBaseState,
 } from "document-model";
import { reducer } from './reducer.js';
${makeOlderReducerImports(v.versions, v.version) ? makeOlderReducerImports(v.versions, v.version) + "\n" : ""}import { ${v.upgradeManifestName} } from "../../upgrades/upgrade-manifest.js";
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
        return baseLoadFromInputVersioned(input, {
            reducers: ${makeReducersObject(v.versions, v.version)},
            upgradeManifest: ${v.upgradeManifestName},
        });
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
