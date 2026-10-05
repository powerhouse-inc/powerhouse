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
import { connectionUpgradeManifest } from "../../upgrades/upgrade-manifest.js";
import {
  assertIsConnectionDocument,
  assertIsConnectionState,
  isConnectionDocument,
  isConnectionState,
} from "./document-schema.js";
import { connectionDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type {
  ConnectionGlobalState,
  ConnectionLocalState,
  ConnectionPHState,
} from "./types.js";

export const initialGlobalState: ConnectionGlobalState = {
  name: "",
  connectorId: "",
  authType: "NONE",
  config: {},
  secretRefs: [],
  status: "UNCONFIGURED",
  lastCheckedAt: null,
  lastError: null,
  accountLabel: null,
};
export const initialLocalState: ConnectionLocalState = {};

export const utils: DocumentModelUtils<ConnectionPHState> = {
  fileExtension: ".conn",
  createState(state) {
    return {
      ...createBaseState(state?.auth, { version: 1, ...state?.document }),
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createDocument(state) {
    return baseCreateDocument(utils.createState, state, connectionDocumentType);
  },
  saveToFileHandle(document, input) {
    return baseSaveToFileHandle(document, input);
  },
  loadFromInput(input) {
    return baseLoadFromInputVersioned(input, {
      reducers: { 1: reducer as unknown as Reducer<PHBaseState> },
      upgradeManifest: connectionUpgradeManifest,
    });
  },
  isStateOfType(state) {
    return isConnectionState(state);
  },
  assertIsStateOfType(state) {
    return assertIsConnectionState(state);
  },
  isDocumentOfType(document) {
    return isConnectionDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsConnectionDocument(document);
  },
};
