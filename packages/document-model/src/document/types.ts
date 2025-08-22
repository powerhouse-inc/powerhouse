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

export type UserActionSigner = {
  address: string;
  networkId: string; // CAIP-2
  chainId: number; // CAIP-10
};

export type AppActionSigner = {
  name: string; // Connect
  key: string;
};

export type ActionSigner = {
  user: UserActionSigner;
  app: AppActionSigner;
  signatures: Signature[];
};

export type ActionContext = {
  /** The index of the previous operation, showing intended ordering. */
  prevOpIndex?: number;

  /** The hash of the previous operation, showing intended state. */
  prevOpHash?: string;

  /** A nonce, to cover specific signing attacks and to prevent replay attacks from no-ops. */
  nonce?: string;

  /** The signer of the action. */
  signer?: ActionSigner;
};

/**
 * Defines the basic structure of an action.
 */
export type Action = {
  /** The id of the action. This is distinct from the operation id. */
  id: string;

  /** The name of the action. */
  type: string;

  /** The timestamp of the action. */
  timestampUtcMs: string;

  /** The payload of the action. */
  input: unknown;

  /** The scope of the action */
  scope: string;

  /** The attachments included in the action. */
  attachments?: AttachmentInput[] | undefined;

  /** The context of the action. */
  context?: ActionContext;
};

export type ActionWithAttachment = Action & {
  attachments: AttachmentInput[];
};

export type ReducerOptions = {
  /** The number of operations to skip before this new action is applied. This overrides the skip count in the operation. */
  skip?: number;

  /** When true the skip count is ignored and the action is applied regardless of the skip count */
  ignoreSkipOperations?: boolean;

  /** if true reuses the provided action resulting state instead of replaying it */
  reuseOperationResultingState?: boolean;

  /** if true checks the hashes of the operations */
  checkHashes?: boolean;

  /** Options for performing a replay. */
  replayOptions?: {
    /** The previously created operation to verify against. */
    operation: Operation;
  };

  /** Optional parser for the operation resulting state, uses JSON.parse by default */
  operationResultingStateParser?: <TState>(
    state: string | null | undefined,
  ) => TState;

  /**
   * When true (default), the reducer will prune operations (garbage collect) when processing a skip.
   * When false, it will recompute state for the skip but preserve the existing operations history.
   */
  pruneOnSkip?: boolean;
};

/**
 * A pure function that takes an action and the previous state
 * of the document and returns the new state.
 */
export type Reducer<TState extends PHBaseState = PHBaseState> = (
  document: PHDocument<TState>,
  action: Action,
  dispatch?: SignalDispatch,
  options?: ReducerOptions,
) => PHDocument<TState>;

export type StateReducer<TState extends PHBaseState = PHBaseState> = (
  state: Draft<TState>,
  action: Action,
  dispatch?: SignalDispatch,
) => TState | undefined;

export type PHStateReducer<TState extends PHBaseState = PHBaseState> =
  StateReducer<TState>;

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
export type Operation = {
  /** Position of the operation in the history */
  index: number;

  /** Timestamp of when the operation was added */
  timestampUtcMs: string;

  /** Hash of the resulting document data after the operation */
  hash: string;

  /** The number of operations skipped with this Operation */
  skip: number;

  /** Error message for a failed action */
  error?: string;

  /** The resulting state after the operation */
  resultingState?: string;

  /** Unique operation id. This is distinct from the action id and can be undefined and assigned later. */
  id?: string;

  /**
   * The action that was applied to the document to produce this operation.
   */
  action: Action;
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

export type PartialState<TState> = TState | Partial<TState>;

export type CreateState<TState extends PHBaseState = PHBaseState> = (
  state?: PartialState<TState>,
) => TState;

export type SaveToFileHandle = (
  document: PHDocument,
  input: FileSystemFileHandle,
) => void | Promise<void>;

export type SaveToFile = (
  document: PHDocument,
  path: string,
  name?: string,
) => string | Promise<string>;

export type LoadFromInput<TState extends PHBaseState = PHBaseState> = (
  input: FileInput,
) => PHDocument<TState> | Promise<PHDocument<TState>>;

export type LoadFromFile<TState extends PHBaseState = PHBaseState> = (
  path: string,
) => PHDocument<TState> | Promise<PHDocument<TState>>;

export type CreateDocument<TState extends PHBaseState = PHBaseState> = (
  initialState?: Partial<TState>,
  createState?: CreateState<TState>,
) => PHDocument<TState>;

export type DocumentOperations = Record<string, Operation[]>;

export type MappedOperation = {
  ignore: boolean;
  operation: Operation;
};

export type DocumentOperationsIgnoreMap = Record<string, MappedOperation[]>;

export type ActionSignatureContext = {
  documentId: string;
  signer: ActionSigner;
  action: Action;
  previousStateHash: string;
};

export type ActionSigningHandler = (message: Uint8Array) => Promise<Uint8Array>;

export type ActionVerificationHandler = (
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
export type BaseDocument<TState extends PHBaseState = PHBaseState> = {
  /** The header of the document. */
  header: PHDocumentHeader;

  /** The history of the document. */
  history: PHDocumentHistory;

  /** The document model specific state. */
  state: TState;

  /** The initial state of the document, enabling replaying operations. */
  initialState: TState;

  /** The operations history of the document. */
  operations: DocumentOperations;

  /** A list of undone operations */
  clipboard: Operation[];

  /** The index of document attachments. */
  attachments?: FileRegistry;
};

export type PHDocument<TState extends PHBaseState = PHBaseState> =
  BaseDocument<TState>;

/**
 * String type representing an attachment in a Document.
 *
 * @remarks
 * Attachment string is formatted as `attachment://<filename>`.
 */
export type AttachmentRef = string; // TODO `attachment://${string}`;

export type DocumentModelUtils<TState extends PHBaseState = PHBaseState> = {
  fileExtension: string;
  createState: CreateState<TState>;
  createDocument: CreateDocument<TState>;
  loadFromFile: LoadFromFile<TState>;
  loadFromInput: LoadFromInput<TState>;
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
  debug?: boolean;
  readMode?: boolean;
  selectedTimelineRevision?: string | number | null;
  getDocumentRevision?: (
    options?: GetDocumentOptions,
  ) => Promise<PHDocument> | undefined;
};

export type ActionErrorCallback = (error: unknown) => void;

export type EditorDispatch = (
  action: Action,
  onErrorCallback?: ActionErrorCallback,
) => void;

export type EditorProps = {
  document: PHDocument;
  context: EditorContext;
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

export type EditorModule = {
  Component: FC<EditorProps>;
  documentTypes: string[];
  config: {
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

export type DocumentModelLib<TState extends PHBaseState = PHBaseState> = {
  manifest: Manifest;
  documentModels: DocumentModelModule<TState>[];
  editors: EditorModule[];
  subgraphs: SubgraphModule[];
  importScripts: ImportScriptModule[];
};

export type ValidationError = { message: string; details: object };

export type DocumentModelModule<TState extends PHBaseState = PHBaseState> = {
  reducer: Reducer<TState>;
  actions: Record<string, (input: any) => Action>;
  utils: DocumentModelUtils<TState>;
  documentModel: DocumentModelState;
};

export type Maybe<T> = T | null;
export type InputMaybe<T> = T | null | undefined;
