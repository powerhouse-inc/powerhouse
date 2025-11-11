import type {
  AssertIsDocumentOfType,
  AssertIsStateOfType,
  CreateDocument,
  CreateState,
  IsDocumentOfType,
  IsStateOfType,
  LoadFromInput,
  SaveToFileHandle,
} from "document-model";
import {
  baseCreateDocument,
  baseLoadFromInput,
  baseSaveToFileHandle,
  defaultBaseState,
  generateId,
} from "document-model/core";
import {
  assertIsDriveDocument,
  assertIsDriveState,
  isDriveDocument,
  isDriveState,
} from "./document-schema.js";
import { driveDocumentType } from "./document-type.js";
import { driveDocumentReducer } from "./reducer.js";
import type {
  DocumentDriveGlobalState,
  DocumentDriveLocalState,
  DocumentDrivePHState,
} from "document-drive";

export const initialGlobalState: DocumentDriveGlobalState = {
  name: "",
  nodes: [],
  icon: null,
};
export const initialLocalState: DocumentDriveLocalState = {
  listeners: [],
  triggers: [],
  sharingType: "private",
  availableOffline: false,
};

export const driveCreateState: CreateState<DocumentDrivePHState> = (
  state: Partial<DocumentDrivePHState> | undefined,
) => {
  return {
    ...defaultBaseState(),
    global: { ...initialGlobalState, ...state?.global },
    local: { ...initialLocalState, ...state?.local },
  };
};

export const driveCreateDocument: CreateDocument<DocumentDrivePHState> = (
  state,
) => {
  const document = baseCreateDocument(driveCreateState, state);

  document.header.documentType = driveDocumentType;

  // for backward compatibility -- but this is NOT a valid document id
  document.header.id = generateId();

  return document;
};

export const driveSaveToFileHandle: SaveToFileHandle = (document, input) => {
  return baseSaveToFileHandle(document, input);
};

export const driveLoadFromInput: LoadFromInput<DocumentDrivePHState> = (
  input,
) => {
  return baseLoadFromInput(input, driveDocumentReducer);
};

export const isStateOfType: IsStateOfType<DocumentDrivePHState> = (state) => {
  return isDriveState(state);
};

export const assertIsStateOfType: AssertIsStateOfType<DocumentDrivePHState> = (
  state,
) => {
  assertIsDriveState(state);
};

export const isDocumentOfType: IsDocumentOfType<DocumentDrivePHState> = (
  document,
) => {
  return isDriveDocument(document);
};

export const assertIsDocumentOfType: AssertIsDocumentOfType<
  DocumentDrivePHState
> = (document) => {
  assertIsDriveDocument(document);
};
