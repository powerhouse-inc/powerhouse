import { DocumentModelHeaderAction } from "#document-model/gen/actions.js";
import { DocumentModelState } from "#document-model/gen/types.js";
import type { Draft, Immutable } from "mutative";
import type { FC } from "react";
import { DocumentAction } from "./actions/types.js";
import type {
  CreateChildDocumentInput,
  Signal,
  SignalDispatch,
  SynchronizationUnitInput,
} from "./signal.js";
import { FileInput } from "./utils/file.js";
export type { NOOPAction } from "./schema/types.js";
export type {
  CreateChildDocumentInput,
  DocumentAction,
  FileInput,
  Immutable,
  Signal,
  SignalDispatch,
  SynchronizationUnitInput,
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
export type BaseAction<
  TType extends string,
  TInput,
  TScope extends OperationScope = OperationScope,
> = {
  /** The name of the action. */
  type: TType;
  /** The payload of the action. */
  input: TInput;
  /** The scope of the action, can either be 'global' or 'local' */
  scope: TScope;
  /** The attachments included in the action. */
  attachments?: AttachmentInput[] | undefined;
  /** The context of the action. */
  context?: ActionContext;
};

export type BaseActionWithAttachment<
  TType extends string,
  TInput,
  TScope extends OperationScope,
> = BaseAction<TType, TInput, TScope> & {
  attachments: AttachmentInput[];
};

export type DefaultAction = DocumentAction | DocumentModelHeaderAction;

export type CustomAction = BaseAction<string, unknown>;

export type Action<
  TType extends string = string,
  TInput = unknown,
  TScope extends OperationScope = OperationScope,
> = DefaultAction | BaseAction<TType, TInput, TScope>;

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
export type Reducer<
  TGlobalState,
  TLocalState,
  TCustomAction extends CustomAction = never,
> = <TAction extends TCustomAction>(
  document: BaseDocument<
    TGlobalState,
    TLocalState,
    TAction | Action | Operation<TAction>
  >,
  action: TAction | Action | Operation<TAction>,
  dispatch?: SignalDispatch,
  options?: ReducerOptions,
) => BaseDocument<
  TGlobalState,
  TLocalState,
  TAction | Action | Operation<TAction>
>;

export type StateReducer<
  TGlobalState,
  TLocalState,
  TCustomAction extends CustomAction = never,
> = <TAction extends TCustomAction>(
  state: Draft<BaseState<TGlobalState, TLocalState>>,
  action: TAction,
  dispatch?: SignalDispatch,
) => BaseState<TGlobalState, TLocalState> | undefined;

/**
 * Scope of an operation.
 * Global: The operation is synchronized everywhere in the network. This is the default document operation.
 * Local: The operation is applied only locally (to a local state). Used for local settings such as a drive's local path
 */
export type OperationScope = "global" | "local";
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
export type Operation<TAction = CustomAction | DefaultAction> =
  (TAction extends CustomAction | DefaultAction ? TAction : never) & {
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

/**
 * The base attributes of a {@link BaseDocument}.
 */
export type DocumentHeader = {
  /** The name of the document. */
  name: string;
  /** The number of operations applied to the document. */
  revision: Record<OperationScope, number>;
  /** The type of the document model. */
  documentType: string;
  /** The timestamp of the creation date of the document. */
  created: string;
  /** The timestamp of the last change in the document. */
  lastModified: string;
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

export type BaseState<TGlobalState, TLocalState> = {
  global: TGlobalState;
  local: TLocalState;
};

export type PartialState<TGlobalOrLocalState> =
  | TGlobalOrLocalState
  | Partial<TGlobalOrLocalState>;

export type CreateState<TGlobalState, TLocalState> = (
  state?: Partial<
    BaseState<PartialState<TGlobalState>, PartialState<TLocalState>>
  >,
) => BaseState<TGlobalState, TLocalState>;

export type CreateExtendedState<TGlobalState, TLocalState> = (
  extendedState?: Partial<
    ExtendedState<PartialState<TGlobalState>, PartialState<TLocalState>>
  >,
  createState?: CreateState<TGlobalState, TLocalState>,
) => ExtendedState<TGlobalState, TLocalState>;

export type SaveToFileHandle = (
  document: BaseDocument<unknown, unknown>,
  input: FileSystemFileHandle,
) => void | Promise<void>;

export type SaveToFile = (
  document: BaseDocument<unknown, unknown>,
  path: string,
  name?: string,
) => string | Promise<string>;

export type LoadFromInput<TGlobalState, TLocalState, TAction = Action> = (
  input: FileInput,
) =>
  | BaseDocument<TGlobalState, TLocalState, TAction>
  | Promise<BaseDocument<TGlobalState, TLocalState, TAction>>;

export type LoadFromFile<TGlobalState, TLocalState, TAction = Action> = (
  path: string,
) =>
  | BaseDocument<TGlobalState, TLocalState, TAction>
  | Promise<BaseDocument<TGlobalState, TLocalState, TAction>>;

export type CreateDocument<TGlobalState, TLocalState, TAction = Action> = (
  document?: Partial<
    ExtendedState<PartialState<TGlobalState>, PartialState<TLocalState>>
  >,
  createState?: CreateState<TGlobalState, TLocalState>,
) => BaseDocument<TGlobalState, TLocalState, TAction>;

export type ExtendedState<TGlobalState, TLocalState> = DocumentHeader & {
  /** The document model specific state. */
  state: BaseState<TGlobalState, TLocalState>;
  /** The index of document attachments. */
  attachments?: FileRegistry;
};

export type DocumentOperations<TAction = Action> = Record<
  OperationScope,
  Operation<TAction>[]
>;

export type MappedOperation<TAction = Action> = {
  ignore: boolean;
  operation: Operation<TAction>;
};

export type DocumentOperationsIgnoreMap<TAction = Action> = Record<
  OperationScope,
  MappedOperation<TAction>[]
>;

export type OperationSignatureContext<TAction = Action> = {
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
export type BaseDocument<TGlobalState, TLocalState, TAction = Action> =
  /** The document model specific state. */
  ExtendedState<TGlobalState, TLocalState> & {
    /** The operations history of the document. */
    operations: DocumentOperations<TAction>;
    /** The initial state of the document, enabling replaying operations. */
    initialState: ExtendedState<TGlobalState, TLocalState>;
    /** A list of undone operations */
    clipboard: Operation<TAction>[];
  };

export type PHDocument<
  TGlobalState = unknown,
  TLocalState = unknown,
  TAction = Action,
> = BaseDocument<TGlobalState, TLocalState, TAction>;

/**
 * String type representing an attachment in a Document.
 *
 * @remarks
 * Attachment string is formatted as `attachment://<filename>`.
 */
export type AttachmentRef = string; // TODO `attachment://${string}`;

export type DocumentModelUtils<TGlobalState, TLocalState, TAction = Action> = {
  createState: CreateState<TGlobalState, TLocalState>;
  createExtendedState: CreateExtendedState<TGlobalState, TLocalState>;
  createDocument: CreateDocument<TGlobalState, TLocalState, TAction>;
  loadFromFile: LoadFromFile<TGlobalState, TLocalState, TAction>;
  loadFromInput: LoadFromInput<TGlobalState, TLocalState, TAction>;
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

export type EditorContext = {
  theme: "light" | "dark";
  debug?: boolean;
  user?: User;
};

export type ActionErrorCallback = (error: unknown) => void;

export type EditorDispatch<TAction extends Action | CustomAction = Action> = (
  action: TAction,
  onErrorCallback?: ActionErrorCallback,
) => void;

export type EditorProps<
  TGlobalState,
  TLocalState,
  TAction extends CustomAction | Action = Action,
> = {
  document: BaseDocument<TGlobalState, TLocalState, TAction>;
  dispatch: EditorDispatch<TAction>;
  context: EditorContext;
  error?: unknown;
  documentNodeName?: string;
};

export type EditorModule<
  TGlobalState = unknown,
  TLocalState = unknown,
  TAction extends CustomAction | Action = Action,
  TCustomProps = unknown,
  TEditorConfig extends Record<string, unknown> = Record<string, unknown>,
> = {
  Component: FC<
    EditorProps<TGlobalState, TLocalState, TAction> &
      TCustomProps &
      Record<string, unknown>
  >;
  documentTypes: string[];
  config?: TEditorConfig;
};

export type Manifest = {
  name: string;
  description: string;
  category: string;
  publisher: {
    name: string;
    url: string;
  };
  documentModels: {
    id: string;
    name: string;
  }[];
  editors: {
    id: string;
    name: string;
    documentTypes: string[];
  }[];
};

export type DocumentModelLib<
  TGlobalState = unknown,
  TLocalState = unknown,
  TCustomAction extends CustomAction | Action = Action,
> = {
  manifest: Manifest;
  documentModels: DocumentModelModule<
    TGlobalState,
    TLocalState,
    TCustomAction
  >[];
  editors: EditorModule<TGlobalState, TLocalState, TCustomAction>[];
};

export type ValidationError = { message: string; details: object };

export type DocumentModelModule<
  TGlobalState = unknown,
  TLocalState = unknown,
  TCustomAction extends CustomAction = Action,
> = {
  documentModelName: string;
  documentType: string;
  fileExtension: string;
  reducer: Reducer<TGlobalState, TLocalState, TCustomAction>;
  actions: Record<
    string,
    (input: any) => TCustomAction | CustomAction | DefaultAction
  >;
  utils: DocumentModelUtils<TGlobalState, TLocalState>;
  documentModelState: DocumentModelState;
};

export type Maybe<T> = T | null;
export type InputMaybe<T> = T | null | undefined;
