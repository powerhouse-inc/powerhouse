/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { DocumentModelUtils, PHBaseState, Reducer } from "document-model";
import {
  baseCreateDocument,
  baseLoadFromInputVersioned,
  baseSaveToFileHandle,
  createBaseState,
} from "document-model";
import { reactorGroupUpgradeManifest } from "../../upgrades/upgrade-manifest.js";
import {
  assertIsReactorGroupDocument,
  assertIsReactorGroupState,
  isReactorGroupDocument,
  isReactorGroupState,
} from "./document-schema.js";
import { reactorGroupDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type {
  ReactorGroupGlobalState,
  ReactorGroupLocalState,
  ReactorGroupPHState,
} from "./types.js";

export const initialGlobalState: ReactorGroupGlobalState = {
  name: "",
  description: "",
  members: [],
};
export const initialLocalState: ReactorGroupLocalState = {};

export const utils: DocumentModelUtils<ReactorGroupPHState> = {
  fileExtension: ".phrg",
  createState(state) {
    return {
      ...createBaseState(state?.auth, { version: 1, ...state?.document }),
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createDocument(state) {
    return baseCreateDocument(
      utils.createState,
      state,
      reactorGroupDocumentType,
    );
  },
  saveToFileHandle(document, input) {
    return baseSaveToFileHandle(document, input);
  },
  loadFromInput(input) {
    return baseLoadFromInputVersioned(input, {
      reducers: { 1: reducer as unknown as Reducer<PHBaseState> },
      upgradeManifest: reactorGroupUpgradeManifest,
    });
  },
  isStateOfType(state) {
    return isReactorGroupState(state);
  },
  assertIsStateOfType(state) {
    return assertIsReactorGroupState(state);
  },
  isDocumentOfType(document) {
    return isReactorGroupDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsReactorGroupDocument(document);
  },
};
