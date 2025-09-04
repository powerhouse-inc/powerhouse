import type {
  DocumentDriveDocument,
  DocumentDriveLocalState,
  DocumentDriveState,
} from "document-drive";
import {
  driveDocumentFileExtension,
  driveDocumentReducer,
  driveDocumentType,
} from "document-drive";
import type {
  BaseState,
  CreateDocument,
  CreateState,
  LoadFromFile,
  LoadFromInput,
  PartialState,
  SaveToFile,
  SaveToFileHandle,
} from "document-model";
import {
  baseCreateDocument,
  baseLoadFromInput,
  baseSaveToFileHandle,
  defaultBaseState,
  generateId,
} from "document-model";

export const initialGlobalState: DocumentDriveState = {
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

export const driveCreateState: CreateState<DocumentDriveDocument> = (
  state:
    | PartialState<
        BaseState<
          PartialState<DocumentDriveState>,
          PartialState<DocumentDriveLocalState>
        >
      >
    | undefined,
) => {
  return {
    ...defaultBaseState(),
    global: { ...initialGlobalState, ...state?.global },
    local: { ...initialLocalState, ...state?.local },
  };
};

export const driveCreateDocument: CreateDocument<DocumentDriveDocument> = (
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

export const driveLoadFromInput: LoadFromInput<DocumentDriveDocument> = (
  input,
) => {
  return baseLoadFromInput(input, driveDocumentReducer);
};
