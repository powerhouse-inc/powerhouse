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
import { chatSessionUpgradeManifest } from "../../upgrades/upgrade-manifest.js";
import {
  assertIsChatSessionDocument,
  assertIsChatSessionState,
  isChatSessionDocument,
  isChatSessionState,
} from "./document-schema.js";
import { chatSessionDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type {
  ChatSessionGlobalState,
  ChatSessionLocalState,
  ChatSessionPHState,
} from "./types.js";

export const initialGlobalState: ChatSessionGlobalState = {
  threadId: null,
  resourceId: null,
  agent: null,
  status: "ACTIVE",
  startedAt: null,
  endedAt: null,
  messages: [],
  usage: null,
  interruptRequested: false,
  retryRequestedFor: null,
  retryRequestedAt: null,
};
export const initialLocalState: ChatSessionLocalState = {};

export const utils: DocumentModelUtils<ChatSessionPHState> = {
  fileExtension: "chat",
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
      chatSessionDocumentType,
    );
  },
  saveToFileHandle(document, input) {
    return baseSaveToFileHandle(document, input);
  },
  loadFromInput(input) {
    return baseLoadFromInputVersioned(input, {
      reducers: { 1: reducer as unknown as Reducer<PHBaseState> },
      upgradeManifest: chatSessionUpgradeManifest,
    });
  },
  isStateOfType(state) {
    return isChatSessionState(state);
  },
  assertIsStateOfType(state) {
    return assertIsChatSessionState(state);
  },
  isDocumentOfType(document) {
    return isChatSessionDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsChatSessionDocument(document);
  },
};
