import type { Draft } from "mutative";
import type { FC, ReactNode } from "react";
import type {
  Action,
  ActionSigner,
  AttachmentRef,
  Operation,
  PHBaseState,
  PHDocument,
} from "./ph-types.js";

export type Maybe<T> = T | null;
export type InputMaybe<T> = T | null | undefined;
export type Exact<T extends Record<string, unknown>> = {
  [K in keyof T]: T[K];
};
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]?: Maybe<T[SubKey]>;
};
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]: Maybe<T[SubKey]>;
};
export type MakeEmpty<T extends Record<string, unknown>, K extends keyof T> = {
  [_ in K]?: never;
};
export type Incremental<T> =
  | T
  | {
      [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never;
    };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
  Address: {
    input: `${string}:0x${string}`;
    output: `${string}:0x${string}`;
  };
  Attachment: { input: string; output: string };
  DateTime: { input: string; output: string };
  Unknown: { input: unknown; output: unknown };
};

export type OperationsByScope = Partial<Record<string, Operation[]>>;

export type SkipHeaderOperationIndex = Partial<Pick<OperationIndex, "index">> &
  Pick<OperationIndex, "skip">;
export type UndoRedoAction = SchemaRedoAction | SchemaUndoAction;

export type DocumentFile = {
  __typename?: "DocumentFile";
  data: Scalars["String"]["output"];
  extension: Maybe<Scalars["String"]["output"]>;
  fileName: Maybe<Scalars["String"]["output"]>;
  mimeType: Scalars["String"]["output"];
};

export type IAction = {
  type: Scalars["String"]["output"];
};

export type IDocument = {
  created: Scalars["DateTime"]["output"];
  documentType: Scalars["String"]["output"];
  lastModified: Scalars["DateTime"]["output"];
  name: Scalars["String"]["output"];
  operations: Array<IOperation>;
  revision: Scalars["Int"]["output"];
};

export type IOperation = {
  hash: Scalars["String"]["output"];
  index: Scalars["Int"]["output"];
  timestampUtcMs: Scalars["DateTime"]["output"];
  type: Scalars["String"]["output"];
};

export type Load_State = "LOAD_STATE";

export type SchemaLoadStateAction = {
  id: Scalars["String"]["output"];
  timestampUtcMs: Scalars["DateTime"]["output"];
  input: LoadStateActionInput;
  type: Load_State;
  scope: string;
};

export type LoadStateActionInput = {
  operations: Scalars["Int"]["input"];
  state: LoadStateActionStateInput;
};

export type LoadStateActionStateInput = {
  data?: InputMaybe<Scalars["Unknown"]["input"]>;
  name: Scalars["String"]["input"];
};

export type MutationLoadStateArgs = {
  input: SchemaLoadStateAction;
};

export type MutationPruneArgs = {
  input: SchemaPruneAction;
};

export type MutationRedoArgs = {
  input: SchemaRedoAction;
};

export type MutationSetNameArgs = {
  input: SchemaSetNameAction;
};

export type MutationUndoArgs = {
  input: SchemaUndoAction;
};

export type Prune = "PRUNE";

export type SchemaPruneAction = {
  id: Scalars["String"]["output"];
  timestampUtcMs: Scalars["DateTime"]["output"];
  input: PruneActionInput;
  type: Prune;
  scope: string;
};

export type PruneActionInput = {
  end?: InputMaybe<Scalars["Int"]["input"]>;
  start?: InputMaybe<Scalars["Int"]["input"]>;
};

export type Query = {
  __typename?: "Query";
  document: Maybe<IDocument>;
};

export type Redo = "REDO";

export type SchemaRedoAction = {
  id: Scalars["String"]["output"];
  timestampUtcMs: Scalars["DateTime"]["output"];
  input: Scalars["Int"]["input"];
  type: Redo;
  scope: string;
};

export type Set_Name = "SET_NAME";

export type SchemaSetNameAction = {
  id: Scalars["String"]["output"];
  timestampUtcMs: Scalars["DateTime"]["output"];
  input: Scalars["String"]["input"];
  type: Set_Name;
  scope: "global";
};

export type SetNameOperation = IOperation & {
  __typename?: "SetNameOperation";
  hash: Scalars["String"]["output"];
  index: Scalars["Int"]["output"];
  input: Scalars["String"]["output"];
  timestamp: Scalars["DateTime"]["output"];
  type: Scalars["String"]["output"];
};

export type Undo = "UNDO";

export type SchemaUndoAction = {
  id: Scalars["String"]["output"];
  timestampUtcMs: Scalars["DateTime"]["output"];
  input: Scalars["Int"]["input"];
  type: Undo;
  scope: string;
};

export type SchemaNOOPAction = {
  id: Scalars["String"]["output"];
  input: Scalars["Unknown"]["input"];
  scope: string;
  timestampUtcMs: Scalars["DateTime"]["output"];
  type: "NOOP";
};

export type LoadStateAction = Action & {
  type: "LOAD_STATE";
  input: LoadStateActionInput;
};
export type PruneAction = Action & { type: "PRUNE"; input: PruneActionInput };
export type RedoAction = Action & {
  type: "REDO";
  input: SchemaRedoAction["input"];
};
export type SetNameAction = Action & {
  type: "SET_NAME";
  input: SchemaSetNameAction["input"];
};
export type UndoAction = Action & {
  type: "UNDO";
  input: SchemaUndoAction["input"];
};
export type NOOPAction = Action & {
  type: "NOOP";
  input: SchemaNOOPAction["input"];
};

export type CreateDocumentActionInput = {
  model: string; // e.g., 'ph/todo'
  version: "0.0.0";
  documentId: string; // equals signature when signed; UUID when unsigned
  signing?: {
    signature: string;
    publicKey: JsonWebKey;
    nonce: string;
    createdAtUtcIso: string;
    documentType: string;
  };
};

export type UpgradeDocumentActionInput = {
  model: string;
  fromVersion: string; // '0.0.0' for first upgrade
  toVersion: string; // current model version
  documentId: string;
  initialState?: object; // optional; defaults to model.defaultState()
};

export type DeleteDocumentActionInput = {
  documentId: string;
  propagate?: "none" | "cascade"; // Deletion propagation mode
};

export type CreateDocumentAction = Action & {
  type: "CREATE_DOCUMENT";
  input: CreateDocumentActionInput;
};

export type UpgradeDocumentAction = Action & {
  type: "UPGRADE_DOCUMENT";
  input: UpgradeDocumentActionInput;
};

export type DeleteDocumentAction = Action & {
  type: "DELETE_DOCUMENT";
  input: DeleteDocumentActionInput;
};

export type DocumentAction =
  | LoadStateAction
  | PruneAction
  | RedoAction
  | SetNameAction
  | UndoAction
  | NOOPAction;

export interface ISignal<TType extends string, TInput> {
  type: TType;
  input: TInput;
}

export type ISignalResult<TTYpe, TInput, TResult> = {
  signal: { type: TTYpe; input: TInput };
  result: TResult;
};

export type CreateChildDocumentInput = {
  id: string;
  documentType: string;
};

export type CreateChildDocumentSignal = ISignal<
  "CREATE_CHILD_DOCUMENT",
  CreateChildDocumentInput
>;

export type DeleteChildDocumentInput = {
  id: string;
};

export type DeleteChildDocumentSignal = ISignal<
  "DELETE_CHILD_DOCUMENT",
  DeleteChildDocumentInput
>;

export type CopyChildDocumentInput = {
  id: string;
  newId: string;
};

export type CopyChildDocumentSignal = ISignal<
  "COPY_CHILD_DOCUMENT",
  CopyChildDocumentInput
>;

export type Signal =
  | CreateChildDocumentSignal
  | CopyChildDocumentSignal
  | DeleteChildDocumentSignal;

export type SignalDispatch = (signal: Signal) => void;

export type SignalResult =
  | ISignalResult<
      CreateChildDocumentSignal["type"],
      CreateChildDocumentSignal["input"],
      PHDocument
    >
  | ISignalResult<
      CopyChildDocumentSignal["type"],
      CopyChildDocumentSignal["input"],
      boolean
    >
  | ISignalResult<
      DeleteChildDocumentSignal["type"],
      DeleteChildDocumentSignal["input"],
      PHDocument
    >;

export type SignalResults = {
  CREATE_CHILD_DOCUMENT: PHDocument;
  COPY_CHILD_DOCUMENT: PHDocument;
  DELETE_CHILD_DOCUMENT: boolean;
};

export type SignalType<T extends Signal> = T["type"];

export type FileInput = string | number[] | Uint8Array | ArrayBuffer | Blob;

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

export type ActionErrorCallback = (error: unknown) => void;

export type EditorDispatch = (
  action: Action,
  onErrorCallback?: ActionErrorCallback,
) => void;

export type EditorProps = {
  children: ReactNode;
  className?: string;
  document?: PHDocument;
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
    name: string;
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

export type ValidationError = { message: string; details: object };

export type SkipHeaderOperations = Partial<Record<string, number>>;

export type ReplayDocumentOptions = {
  // if false then reuses the hash from the operations
  // and only checks the final hash of each scope
  checkHashes?: boolean;
  // if true then looks for the latest operation with
  // a resulting state and uses it as a starting point
  reuseOperationResultingState?: boolean;
  // Optional parser for the operation resulting state, uses JSON.parse by default
  operationResultingStateParser?: <TState>(state: string) => TState;
};

export type OperationIndex = {
  index: number;
  skip: number;
  id?: string;
  timestampUtcMs?: string;
};

/**
 * Parameters used in a document signature.
 */
export type SigningParameters = {
  documentType: string;
  createdAtUtcIso: string;

  /**
   * The nonce can act as both a salt and a typical nonce.
   */
  nonce: string;
};

/**
 * Describes a signer. This may only have a public key for verification.
 */
export interface ISigner {
  /** The corresponding public key */
  publicKey(): Promise<JsonWebKey>;

  /**
   * Signs data.
   *
   * @param data - The data to sign.
   *
   * @returns The signature of the data.
   */
  sign: (data: Uint8Array) => Promise<Uint8Array>;

  /**
   * Verifies a signature.
   *
   * @param data - The data to verify.
   * @param signature - The signature to verify.
   */
  verify: (data: Uint8Array, signature: Uint8Array) => Promise<void>;
}
