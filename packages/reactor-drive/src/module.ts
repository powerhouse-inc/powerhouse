import type {
  AssertIsDocumentOfType,
  AssertIsStateOfType,
  CreateDocument,
  CreateState,
  DocumentModelGlobalState,
  IsDocumentOfType,
  IsStateOfType,
  LoadFromInput,
  PHDocument,
  SaveToFileHandle,
} from "@powerhousedao/shared/document-model";
import {
  baseCreateDocument,
  baseLoadFromInput,
  baseSaveToFileHandle,
  createReducer,
  createState,
  defaultBaseState,
} from "@powerhousedao/shared/document-model";
import { reactorDriveActions } from "./actions.js";
import {
  REACTOR_DRIVE_DOCUMENT_TYPE,
  REACTOR_DRIVE_FILE_EXTENSION,
} from "./constants.js";
import { reactorDriveStateReducer } from "./reducer/drive.js";
import type {
  ReactorDriveDocumentModelModule,
  ReactorDriveGlobalState,
  ReactorDriveLocalState,
  ReactorDrivePHState,
} from "./types.js";

const initialGlobalState: ReactorDriveGlobalState = {
  name: "",
  icon: null,
};

const initialLocalState: ReactorDriveLocalState = {
  sharingType: "private",
  availableOffline: false,
};

export const reactorDriveCreateState: CreateState<ReactorDrivePHState> = (
  state,
) => {
  return {
    ...defaultBaseState(),
    global: { ...initialGlobalState, ...state?.global },
    local: { ...initialLocalState, ...state?.local },
  };
};

export const reactorDriveCreateDocument: CreateDocument<ReactorDrivePHState> = (
  state,
) => {
  const document = baseCreateDocument(reactorDriveCreateState, state);
  document.header.documentType = REACTOR_DRIVE_DOCUMENT_TYPE;
  return document;
};

const reactorDriveSaveToFileHandle: SaveToFileHandle = (document, input) => {
  return baseSaveToFileHandle(document, input);
};

const reactorDriveLoadFromInput: LoadFromInput<ReactorDrivePHState> = (
  input,
) => {
  return baseLoadFromInput(input, reactorDriveDocumentReducer);
};

const isReactorDriveState: IsStateOfType<ReactorDrivePHState> = (
  state,
): state is ReactorDrivePHState => {
  return (
    typeof state === "object" &&
    state !== null &&
    "global" in state &&
    "local" in state
  );
};

const assertIsReactorDriveState: AssertIsStateOfType<ReactorDrivePHState> = (
  state,
) => {
  if (!isReactorDriveState(state)) {
    throw new Error("Not a reactor-drive state");
  }
};

const isReactorDriveDocument: IsDocumentOfType<ReactorDrivePHState> = (
  document,
): document is PHDocument<ReactorDrivePHState> => {
  return (
    typeof document === "object" &&
    document !== null &&
    "header" in document &&
    (document as { header: { documentType: string } }).header.documentType ===
      REACTOR_DRIVE_DOCUMENT_TYPE
  );
};

const assertIsReactorDriveDocument: AssertIsDocumentOfType<
  ReactorDrivePHState
> = (document) => {
  if (!isReactorDriveDocument(document)) {
    throw new Error("Not a reactor-drive document");
  }
};

export const reactorDriveDocumentReducer = createReducer<ReactorDrivePHState>(
  reactorDriveStateReducer,
);

const reactorDriveDocumentGlobalState: DocumentModelGlobalState = {
  id: REACTOR_DRIVE_DOCUMENT_TYPE,
  name: "ReactorDrive",
  extension: REACTOR_DRIVE_FILE_EXTENSION,
  description: "",
  author: {
    name: "Powerhouse Inc",
    website: "https://www.powerhouse.inc/",
  },
  specifications: [
    {
      version: 1,
      changeLog: [],
      state: {
        global: {
          schema:
            "type ReactorDriveState {\n  name: String!\n  icon: String\n}",
          initialValue: JSON.stringify(JSON.stringify(initialGlobalState)),
          examples: [],
        },
        local: {
          schema:
            "type ReactorDriveLocalState {\n  sharingType: String!\n  availableOffline: Boolean!\n}",
          initialValue: JSON.stringify(JSON.stringify(initialLocalState)),
          examples: [],
        },
      },
      modules: [
        {
          id: "reactor-drive/base-operations",
          name: "base_operations",
          description: "",
          operations: [
            {
              id: "SET_DRIVE_NAME",
              name: "SET_DRIVE_NAME",
              description: "",
              schema: "input SetDriveNameInput { name: String! }",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "SET_DRIVE_ICON",
              name: "SET_DRIVE_ICON",
              description: "",
              schema: "input SetDriveIconInput { icon: String }",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "SET_SHARING_TYPE",
              name: "SET_SHARING_TYPE",
              description: "",
              schema: "input SetSharingTypeInput { sharingType: String! }",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "local",
            },
            {
              id: "SET_AVAILABLE_OFFLINE",
              name: "SET_AVAILABLE_OFFLINE",
              description: "",
              schema:
                "input SetAvailableOfflineInput { availableOffline: Boolean! }",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "local",
            },
            {
              id: "ADD_FOLDER",
              name: "ADD_FOLDER",
              description: "",
              schema:
                "input AddFolderInput { folderId: String! parentFolderId: String name: String! }",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "document",
            },
            {
              id: "UPDATE_FOLDER",
              name: "UPDATE_FOLDER",
              description: "",
              schema:
                "input UpdateFolderInput { folderId: String! name: String parentFolderId: String }",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "document",
            },
            {
              id: "REMOVE_FOLDER",
              name: "REMOVE_FOLDER",
              description: "",
              schema: "input RemoveFolderInput { folderId: String! }",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "document",
            },
          ],
        },
      ],
    },
  ],
};

export const reactorDriveDocumentModelModule: ReactorDriveDocumentModelModule =
  {
    actions: reactorDriveActions,
    reducer: reactorDriveDocumentReducer,
    documentModel: createState(
      defaultBaseState(),
      reactorDriveDocumentGlobalState,
    ),
    utils: {
      fileExtension: REACTOR_DRIVE_FILE_EXTENSION,
      createState: reactorDriveCreateState,
      createDocument: reactorDriveCreateDocument,
      loadFromInput: reactorDriveLoadFromInput,
      saveToFileHandle: reactorDriveSaveToFileHandle,
      isStateOfType: isReactorDriveState,
      assertIsStateOfType: assertIsReactorDriveState,
      isDocumentOfType: isReactorDriveDocument,
      assertIsDocumentOfType: assertIsReactorDriveDocument,
    },
  };
