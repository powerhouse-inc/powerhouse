import type {
  DocumentDriveGlobalState,
  DocumentDriveLocalState,
  DocumentDrivePHState,
} from "document-drive";
import { driveDocumentReducer, driveDocumentType } from "document-drive";
import type {
  CreateDocument,
  CreateState,
  LoadFromInput,
  SaveToFileHandle,
} from "document-model";
import {
  baseCreateDocument,
  baseLoadFromInput,
  baseSaveToFileHandle,
  defaultBaseState,
  generateId,
} from "document-model";

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
