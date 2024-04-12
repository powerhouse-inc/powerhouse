import type { Draft } from 'immer';
import type { FC } from 'react';
import type { DocumentModelState } from '../document-model/';
import type { BaseAction } from './actions/types';
import { BaseDocument } from './object';
import { FileInput } from './utils';
import { SignalDispatch } from './signal';
export { z } from './schema';
export type * from './schema/types';
export type { FileInput } from './utils';
export type { Immutable } from 'immer';

export type ActionSigner = {
    user: {
        address: string;
        chainId: string;
    };
    app: {
        name: string; // Connect
        key: string;
    };
    signature: string;
};

export type ActionContext = {
    signer?: ActionSigner;
};

/**
 * Defines the basic structure of an action.
 *
 * @typeParam T - The name of the action type. A `string` type by default.
 */
export type Action<
    T extends string = string,
    I = unknown,
    S extends OperationScope = OperationScope,
> = {
    /** The name of the action. */
    type: T;
    /** The payload of the action. */
    input: I;
    /** The scope of the action, can either be 'global' or 'local' */
    scope: S;
    /** The attachments included in the action. */
    attachments?: AttachmentInput[] | undefined;
    /** The context of the action. */
    context?: ActionContext;
};

export type ActionWithAttachment<
    T extends string = string,
    I = unknown,
    S extends OperationScope = OperationScope,
> = Action<T, I, S> & {
    attachments: AttachmentInput[];
};

export type ReducerOptions = {
    /** The number of operations to skip before this new action is applied */
    skip?: number;
    /** When true the skip count is ignored and the action is applied regardless of the skip count */
    ignoreSkipOperations?: boolean;
};

/**
 * A pure function that takes an action and the previous state
 * of the document and returns the new state.
 *
 * @typeParam State - The type of the document data.
 * @typeParam A - The type of the actions supported by the reducer.
 */
export type Reducer<State, A extends Action, LocalState> = (
    state: Document<State, A, LocalState>,
    action: A | BaseAction,
    dispatch?: SignalDispatch,
    options?: ReducerOptions,
) => Document<State, A, LocalState>;

/**
 * A {@link Reducer} that prevents mutable code from changing the previous state.
 *
 * @remarks
 * This reducer is wrapped with {@link https://immerjs.github.io/immer/ | Immer}.
 * This allows the reducer code to be mutable, making it simpler and
 * avoiding unintended changes in the provided state.
 * The returned state will always be a new object.
 *
 * @typeParam State - The type of the document data.
 * @typeParam A - The type of the actions supported by the reducer.
 */
export type ImmutableReducer<State, A extends Action, LocalState> = (
    state: Draft<Document<State, A, LocalState>>,
    action: A | BaseAction,
    dispatch?: SignalDispatch,
) => Document<State, A, LocalState> | undefined;

export type ImmutableStateReducer<S, A extends Action, L = unknown> = (
    state: Draft<State<S, L>>,
    action: A,
    dispatch?: SignalDispatch,
) => State<S, L> | undefined;

/**
 * Scope of an operation.
 * Global: The operation is synchronized everywhere in the network. This is the default document operation.
 * Local: The operation is applied only locally (to a local state). Used for local settings such as a drive's local path
 */
export type OperationScope = 'global' | 'local';
/**
 * An operation that was applied to a {@link Document}.
 *
 * @remarks
 * Wraps an action with an index, to be added to the operations history of a Document.
 * The `index` field is used to keep all operations in order and enable replaying the
 * document's history from the beginning.
 *
 * @typeParam A - The type of the action.
 */
export type Operation<A extends Action = Action> = A & {
    /** Position of the operation in the history */
    index: number;
    /** Timestamp of when the operation was added */
    timestamp: string;
    /** Hash of the resulting document data after the operation */
    hash: string;
    /** The number of operations skipped with this Operation */
    skip: number;
};

/**
 * The base attributes of a {@link Document}.
 */
export type DocumentHeader = {
    /** The name of the document. */
    name: string;
    /** The number of operations applied to the document. */
    revision: Required<Record<OperationScope, number>>;
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

export type State<GlobalState, LocalState> = {
    global: GlobalState;
    local: LocalState;
};

export type PartialState<S> = S | Partial<S>;

export type CreateState<S, L> = (
    state?: Partial<State<PartialState<S>, PartialState<L>>>,
) => State<S, L>;

export type ExtendedState<
    GlobalState,
    LocalState = unknown,
> = DocumentHeader & {
    /** The document model specific state. */
    state: State<GlobalState, LocalState>;
    /** The index of document attachments. */
    attachments: FileRegistry;
};

export type DocumentOperations<A extends Action> = Required<
    Record<OperationScope, Operation<A | BaseAction>[]>
>;

export type MappedOperation<A extends Action> = {
    ignore: boolean;
    operation: Operation<A | BaseAction>;
};

export type DocumentOperationsIgnoreMap<A extends Action> = Required<
    Record<OperationScope, MappedOperation<A>[]>
>;

/**
 * The base type of a document model.
 *
 * @remarks
 * This type is extended by all Document models.
 *
 * @typeParam Data - The type of the document data attribute.
 * @typeParam A - The type of the actions supported by the Document.
 */
export type Document<
    GlobalState = unknown,
    A extends Action = Action,
    LocalState = unknown,
> =
    /** The document model specific state. */
    ExtendedState<GlobalState, LocalState> & {
        /** The operations history of the document. */
        operations: DocumentOperations<A>;
        /** The initial state of the document, enabling replaying operations. */
        initialState: ExtendedState<GlobalState, LocalState>;
        /** A list of undone operations */
        clipboard: Operation<BaseAction | A>[];
    };

/**
 * String type representing an attachment in a Document.
 *
 * @remarks
 * Attachment string is formatted as `attachment://<filename>`.
 */
export type AttachmentRef = string; // TODO `attachment://${string}`;

export interface DocumentClass<
    S,
    A extends Action = Action,
    L = unknown,
    C extends BaseDocument<S, A, L> = BaseDocument<S, A, L>,
> {
    fileExtension: string;
    fromFile: (path: string) => Promise<C>;
    new (initialState?: ExtendedState<S, L>): C;
}

export type DocumentModelUtils<
    S = unknown,
    A extends Action = Action,
    L = unknown,
> = {
    fileExtension: string;
    createState: CreateState<S, L>;
    createExtendedState: (
        extendedState?: Partial<
            ExtendedState<PartialState<S>, PartialState<L>>
        >,
        createState?: CreateState<S, L>,
    ) => ExtendedState<S, L>;
    createDocument: (
        document?: Partial<ExtendedState<PartialState<S>, PartialState<L>>>,
        createState?: CreateState<S, L>,
    ) => Document<S, A, L>;
    loadFromFile: (path: string) => Promise<Document<S, A, L>>;
    loadFromInput: (input: FileInput) => Promise<Document<S, A, L>>;
    saveToFile: (
        document: Document<S, A, L>,
        path: string,
        name?: string,
    ) => Promise<string>;
    saveToFileHandle: (
        document: Document<S, A, L>,
        input: FileSystemFileHandle,
    ) => Promise<void>;
};

export type ActionCreator<A extends Action> = // TODO remove any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    | ((input: any) => A)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    | ((input: any, attachments: AttachmentInput[]) => A)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    | ((...input: any) => BaseAction);

export type DocumentModel<
    S = unknown,
    A extends Action = Action,
    L = unknown,
    C extends BaseDocument<S, A, L> = BaseDocument<S, A, L>,
> = {
    Document: DocumentClass<S, A, L, C>;
    reducer: Reducer<S, A, L>;
    actions: Record<string, ActionCreator<A>>;
    utils: DocumentModelUtils<S, A, L>;
    documentModel: DocumentModelState;
};

export type ENSInfo = {
    name?: string;
    avatarUrl?: string;
};

export type User = {
    address: `0x${string}`;
    chainId: number;
    ens?: ENSInfo;
};

export type EditorContext = {
    theme: 'light' | 'dark';
    debug?: boolean;
    user?: User;
};

export type ActionErrorCallback = (error: unknown) => void;

export type EditorProps<S, A extends Action, L> = {
    document: Document<S, A, L>;
    dispatch: (
        action: A | BaseAction,
        onErrorCallback?: ActionErrorCallback,
    ) => void;
    context: EditorContext;
    error?: unknown;
};

export type Editor<S = unknown, A extends Action = Action, L = unknown> = {
    Component: FC<EditorProps<S, A, L>>;
    documentTypes: string[];
};

export type DocumentModelLib = {
    documentModels: DocumentModel[];
    editors: Editor[];
};

export type UndoRedoProcessResult<T, A extends Action, L> = {
    document: Document<T, A, L>;
    action: A | BaseAction;
    skip: number;
};

export type ValidationError = { message: string; details: object };
