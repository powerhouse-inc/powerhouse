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
import { workflowUpgradeManifest } from "../../upgrades/upgrade-manifest.js";
import {
  assertIsWorkflowDocument,
  assertIsWorkflowState,
  isWorkflowDocument,
  isWorkflowState,
} from "./document-schema.js";
import { workflowDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type {
  WorkflowGlobalState,
  WorkflowLocalState,
  WorkflowPHState,
} from "./types.js";

export const initialGlobalState: WorkflowGlobalState = {
  name: "",
  description: null,
  status: "DRAFT",
  version: 0,
  trigger: null,
  steps: [],
  edges: [],
  variables: [],
  policy: {
    concurrency: "QUEUE",
    maxParallelRuns: null,
    runTimeoutSeconds: 3600,
    maxSuspensionDays: 30,
    defaultRetry: {
      maxAttempts: 1,
      backoff: "FIXED",
      initialDelaySeconds: 5,
      maxDelaySeconds: 300,
      retryOn: [],
    },
    onFailure: "PARK",
    retainRunsDays: 30,
    journalAsDocument: false,
  },
  lastRunAt: null,
  lastRunStatus: null,
};
export const initialLocalState: WorkflowLocalState = {};

export const utils: DocumentModelUtils<WorkflowPHState> = {
  fileExtension: ".flow",
  createState(state) {
    return {
      ...createBaseState(state?.auth, { version: 1, ...state?.document }),
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createDocument(state) {
    return baseCreateDocument(utils.createState, state, workflowDocumentType);
  },
  saveToFileHandle(document, input) {
    return baseSaveToFileHandle(document, input);
  },
  loadFromInput(input) {
    return baseLoadFromInputVersioned(input, {
      reducers: { 1: reducer as unknown as Reducer<PHBaseState> },
      upgradeManifest: workflowUpgradeManifest,
    });
  },
  isStateOfType(state) {
    return isWorkflowState(state);
  },
  assertIsStateOfType(state) {
    return assertIsWorkflowState(state);
  },
  isDocumentOfType(document) {
    return isWorkflowDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsWorkflowDocument(document);
  },
};
