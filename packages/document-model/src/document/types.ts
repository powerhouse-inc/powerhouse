import { type DocumentModelHeaderAction } from "#document-model/gen/actions.js";
import { type DocumentModelState } from "#document-model/gen/types.js";
import type { Draft, Immutable } from "mutative";
import type { FC } from "react";
import { type DocumentAction } from "./actions/types.js";
import {
  type PHBaseState,
  type PHDocumentHeader,
  type PHDocumentHistory,
} from "./ph-types.js";
import type {
  CreateChildDocumentInput,
  Signal,
  SignalDispatch,
  SignalResult,
} from "./signal.js";
import { type FileInput } from "./utils/file.js";
export type { NOOPAction } from "./schema/types.js";
export type {
  CreateChildDocumentInput,
  DocumentAction,
  FileInput,
  Immutable,
  Signal,
  SignalDispatch,
  SignalResult,
};
//  [
//     signerAddress,
//     hash (docID, scope, operationID, operationName, operationInput),
//     prevStateHash,
//     signature bytes
//  ]
export type Signature = [string, string, string, string, string];

export type ActionSigner = {
  user: {
    address: string;
    networkId: string; // CAIP-2
    chainId: number; // CAIP-10
  };
  app: {
    name: string; // Connect
    key: string;
  };
  signatures: Signature[];
};

export type ActionContext = {
  signer?: ActionSigner;
};

/**
 * Defines the basic structure of an action.
 */
export type BaseAction<TType extends string, TInput> = {
  /** The name of the action. */
  type: TType;
  /** The payload of the action. */
  input: TInput;
  /** The scope of the action */
  scope: string;
  /** The attachments included in the action. */
  attachments?: AttachmentInput[] | undefined;
  /** The context of the action. */
  context?: ActionContext;
};

export type BaseActionWithAttachment<TType extends string, TInput> = BaseAction<
  TType,
  TInput
> & {
  attachments: AttachmentInput[];
};

export type DefaultAction = DocumentAction | DocumentModelHeaderAction;

export type CustomAction = BaseAction<string, unknown>;

export type Action<
  TType extends string = string,
  TInput = unknown,
> = BaseAction<TType, TInput>;

export type ReducerOptions = {
  /** The number of operations to skip before this new action is applied */
  skip?: number;
  /** When true the skip count is ignored and the action is applied regardless of the skip count */
  ignoreSkipOperations?: boolean;
  /** if true reuses the provided action hash  */
  reuseHash?: boolean;
  /** if true reuses the provided action resulting state instead of replaying it */
  reuseOperationResultingState?: boolean;
  /** if true checks the hashes of the operations */
  checkHashes?: boolean;
  /** Optional parser for the operation resulting state, uses JSON.parse by default */
  operationResultingStateParser?: <TState>(
    state: string | null | undefined,
  ) => TState;
};

/**
 * A pure function that takes an action and the previous state
 * of the document and returns the new state.
 */
export type Reducer<TDocument extends PHDocument> = <
  TAction extends ActionFromDocument<TDocument>,
>(
  document: TDocument,
  action: TAction | Operation<TAction> | DefaultAction,
  dispatch?: SignalDispatch,
  options?: ReducerOptions,
) => TDocument;

export type PHReducer<TDocument extends PHDocument = PHDocument> =
  Reducer<TDocument>;

export type StateReducer<TDocument extends PHDocument> = <
  TAction extends ActionFromDocument<TDocument>,
>(
  state: Draft<BaseStateFromDocument<TDocument>>,
  action: TAction | DefaultAction | Operation<TAction>,
  dispatch?: SignalDispatch,
) => BaseStateFromDocument<TDocument> | undefined;

export type PHStateReducer<TDocument extends PHDocument = PHDocument> =
  StateReducer<TDocument>;

/**
 * An operation that was applied to a {@link BaseDocument}.
 *
 * @remarks
 * Wraps an action with an index, to be added to the operations history of a Document.
 * The `index` field is used to keep all operations in order and enable replaying the
 * document's history from the beginning.
 *
 * @typeParam A - The type of the action.
 */
export type Operation<TAction extends Action = Action> = TAction & {
  /** Position of the operation in the history */
  index: number;
  /** Timestamp of when the operation was added */
  timestamp: string;
  /** Hash of the resulting document data after the operation */
  hash: string;
  /** The number of operations skipped with this Operation */
  skip: number;
  /** Error message for a failed action */
  error?: string;
  /** The resulting state after the operation */
  resultingState?: string;
  /** Unique operation id */
  id?: string;
};

export type Meta = {
  preferredEditor?: string;
};

/**
 * The attributes stored for a file. Namely, attachments of a document.
 */
export type Attachment = {
  /** The binary data of the attachment in Base64 */
  data: string;

  /** The MIME type of the attachment */
  mimeType: string;

  // The extension of the attachment.
  extension?: string | null;

  // The file name of the attachment.
  fileName?: string | null;
};

export type AttachmentInput = Attachment & {
  hash: string;
};

/**
 * Object that indexes attachments of a Document.
 *
 * @remarks
 * This is used to reduce memory usage to avoid
 * multiple instances of the binary data of the attachments.
 *
 */
export type FileRegistry = Record<AttachmentRef, Attachment>;

export type BaseState<TDocumentState, TLocalState> =
  PHBaseState<TDocumentState> & {
    /**
     * Use {@link PHBaseState} `document` instead.
     */
    global: TDocumentState;

    /**
     * Not a requirement for BaseState, but could be in extended states.
     */
    local: TLocalState;
  };

export type PartialState<TState> = TState | Partial<TState>;

export type CreateState<TDocument extends PHDocument> = (
  state?: PartialState<
    BaseState<
      PartialState<GlobalStateFromDocument<TDocument>>,
      PartialState<LocalStateFromDocument<TDocument>>
    >
  >,
) => BaseStateFromDocument<TDocument>;

export type CreateExtendedState<TDocument extends BaseDocument<any, any, any>> =
  (
    extendedState?: Partial<
      ExtendedState<
        PartialState<GlobalStateFromDocument<TDocument>>,
        PartialState<LocalStateFromDocument<TDocument>>
      >
    >,
    createState?: CreateState<TDocument>,
  ) => ExtendedStateFromDocument<TDocument>;

export type SaveToFileHandle = (
  document: PHDocument,
  input: FileSystemFileHandle,
) => void | Promise<void>;

export type SaveToFile = (
  document: PHDocument,
  path: string,
  name?: string,
) => string | Promise<string>;

export type LoadFromInput<TDocument extends BaseDocument<any, any, any>> = (
  input: FileInput,
) => TDocument | Promise<TDocument>;

export type LoadFromFile<TDocument extends BaseDocument<any, any, any>> = (
  path: string,
) => TDocument | Promise<TDocument>;

export type CreateDocument<TDocument extends BaseDocument<any, any, any>> = (
  initialState?: Partial<
    ExtendedState<
      PartialState<GlobalStateFromDocument<TDocument>>,
      PartialState<LocalStateFromDocument<TDocument>>
    >
  >,
  createState?: CreateState<TDocument>,
) => TDocument;

export type ExtendedState<TDocumentState, TLocalState> = {
  /** The document model specific state. */
  state: BaseState<TDocumentState, TLocalState>;

  /** The index of document attachments. */
  attachments?: FileRegistry;
};

export type DocumentOperations<TAction extends Action = Action> = Record<
  string,
  Operation<TAction>[]
>;

export type MappedOperation<TAction extends Action = Action> = {
  ignore: boolean;
  operation: Operation<TAction>;
};

export type DocumentOperationsIgnoreMap<TAction extends Action = Action> =
  Record<string, MappedOperation<TAction>[]>;

export type OperationSignatureContext<TAction extends Action = Action> = {
  documentId: string;
  signer: Omit<ActionSigner, "signatures"> & { signatures?: Signature[] };
  operation: Operation<TAction>;
  previousStateHash: string;
};

export type OperationSigningHandler = (
  message: Uint8Array,
) => Promise<Uint8Array>;

export type OperationVerificationHandler = (
  publicKey: string,
  signature: Uint8Array,
  data: Uint8Array,
) => Promise<boolean>;

/**
 * The base type of a document model.
 *
 * @remarks
 * This type is extended by all Document models.
 *
 * @typeParam Data - The type of the document data attribute.
 * @typeParam A - The type of the actions supported by the Document.
 */
export type BaseDocument<
  TDocumentState,
  TLocalState,
  TAction extends Action,
> = {
  /** The header of the document. */
  header: PHDocumentHeader;

  /** The history of the document. */
  history: PHDocumentHistory;
} & ExtendedState<TDocumentState, TLocalState> & {
    /** The operations history of the document. */
    operations: DocumentOperations<TAction>;
    /** The initial state of the document, enabling replaying operations. */
    initialState: ExtendedState<TDocumentState, TLocalState>;
    /** A list of undone operations */
    clipboard: Operation<TAction>[];
  };

export type PHDocument<
  TGlobalState = unknown,
  TLocalState = unknown,
  TAction extends Action = Action,
> = BaseDocument<TGlobalState, TLocalState, TAction>;

/**
 * String type representing an attachment in a Document.
 *
 * @remarks
 * Attachment string is formatted as `attachment://<filename>`.
 */
export type AttachmentRef = string; // TODO `attachment://${string}`;

export type DocumentModelUtils<TDocument extends PHDocument> = {
  fileExtension: string;
  createState: CreateState<TDocument>;
  createExtendedState: CreateExtendedState<TDocument>;
  createDocument: CreateDocument<TDocument>;
  loadFromFile: LoadFromFile<TDocument>;
  loadFromInput: LoadFromInput<TDocument>;
  saveToFile: SaveToFile;
  saveToFileHandle: SaveToFileHandle;
};

export type ENSInfo = {
  name?: string;
  avatarUrl?: string;
};

export type User = {
  address: `0x${string}`;
  networkId: string; // CAIP-2
  chainId: number; // CAIP-10
  ens?: ENSInfo;
};

export type PartialRecord<K extends keyof any, T> = {
  [P in K]?: T;
};

export type RevisionsFilter = PartialRecord<string, number>;

export type GetDocumentOptions = ReducerOptions & {
  revisions?: RevisionsFilter;
  checkHashes?: boolean;
};

export type EditorContext = {
  theme: "light" | "dark";
  debug?: boolean;
  user?: User;
  readMode?: boolean;
  selectedTimelineRevision?: string | number | null;
  getDocumentRevision?: (
    options?: GetDocumentOptions,
  ) => Promise<PHDocument> | undefined;
};

export type ActionErrorCallback = (error: unknown) => void;

export type EditorDispatch<TAction extends Action | CustomAction = Action> = (
  action: TAction,
  onErrorCallback?: ActionErrorCallback,
) => void;

export type EditorProps<TDocument extends PHDocument> = {
  document: TDocument;
  dispatch: EditorDispatch<ActionFromDocument<TDocument>>;
  context: EditorContext;
  error?: unknown;
  documentNodeName?: string;
};

export type SubgraphModule = {
  id: string;
  name: string;
  gql: string;
  endpoint: string;
};

export type ImportScriptModule = {
  id: string;
  name: string;
  gql: string;
  endpoint: string;
};

export type EditorModule<
  TDocument extends PHDocument = PHDocument,
  TCustomProps = unknown,
  TEditorConfig extends Record<string, unknown> = Record<string, unknown>,
> = {
  Component: FC<
    EditorProps<TDocument> & TCustomProps & Record<string, unknown>
  >;
  documentTypes: string[];
  config: TEditorConfig & {
    id: string;
    disableExternalControls?: boolean;
    documentToolbarEnabled?: boolean;
    showSwitchboardLink?: boolean;
    timelineEnabled?: boolean;
  };
};

export type App = {
  id: string;
  name: string;
  driveEditor?: string;
};

export type Manifest = {
  name: string;
  description: string;
  category: string;
  publisher: {
    name: string;
    url: string;
  };
  documentModels?: {
    id: string;
    name: string;
  }[];
  editors?: {
    id: string;
    name: string;
    documentTypes: string[];
  }[];
  processors?: {
    id: string;
    name: string;
  }[];
  subgraphs?: {
    id: string;
    name: string;
  }[];
  importScripts?: {
    id: string;
    name: string;
    documentTypes: string[];
  }[];
  apps?: App[];
};

export type DocumentModelLib<TDocument extends PHDocument = PHDocument> = {
  manifest: Manifest;
  documentModels: DocumentModelModule<TDocument>[];
  editors: EditorModule<TDocument>[];
  subgraphs: SubgraphModule[];
  importScripts: ImportScriptModule[];
};

export type ValidationError = { message: string; details: object };

type ExtractPHDocumentGenerics<T> =
  T extends BaseDocument<infer DocumentState, infer LocalState, infer Action>
    ? {
        documentState: DocumentState;
        action: Action;

        // deprecated
        globalState: DocumentState;
        localState: LocalState;
      }
    : never;

export type DocumentModelModule<TDocument extends PHDocument = PHDocument> = {
  reducer: Reducer<TDocument>;
  actions: Record<
    string,
    (input: any) => ActionFromDocument<TDocument> | DefaultAction
  >;
  utils: DocumentModelUtils<TDocument>;
  documentModel: DocumentModelState;
};

export type DocumentStateFromDocument<TDocument extends PHDocument> =
  ExtractPHDocumentGenerics<TDocument>["documentState"];

export type GlobalStateFromDocument<TDocument extends PHDocument> =
  ExtractPHDocumentGenerics<TDocument>["globalState"];

export type LocalStateFromDocument<TDocument extends PHDocument> =
  ExtractPHDocumentGenerics<TDocument>["localState"];

export type BaseStateFromDocument<TDocument extends PHDocument> = BaseState<
  DocumentStateFromDocument<TDocument>,
  LocalStateFromDocument<TDocument>
>;

export type ExtendedStateFromDocument<TDocument extends PHDocument> =
  ExtendedState<
    PartialState<DocumentStateFromDocument<TDocument>>,
    PartialState<LocalStateFromDocument<TDocument>>
  >;

export type ActionFromDocument<TDocument extends PHDocument> =
  ExtractPHDocumentGenerics<TDocument>["action"];

export type OperationFromDocument<TDocument extends PHDocument> = Operation<
  ActionFromDocument<TDocument>
>;

export type OperationsFromDocument<TDocument extends PHDocument> =
  DocumentOperations<ActionFromDocument<TDocument>>;

export type Maybe<T> = T | null;
export type InputMaybe<T> = T | null | undefined;
