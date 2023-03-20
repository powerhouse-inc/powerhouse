import { WritableDraft } from 'immer/dist/internal';
import { BaseAction } from './actions';

export type Action<T = string> = {
    type: T;
    input?: unknown;
};

export type Reducer<State, A extends Action> = (
    state: Document<State, A>,
    action: A
) => Document<State, A>;

export type ImmutableReducer<State, A extends Action> = (
    state: WritableDraft<Document<State, A>>,
    action: A
) => Document<State, A> | void;

export type Operation<A extends Action = Action> = A & { index: number };

export type DocumentHeader = {
    name: string;
    revision: number;
    documentType: string;
    created: string;
    lastModified: string;
};

export type FileRegistry = Record<
    Attachment,
    { data: string; mimeType: string }
>;

export type Document<
    Data = unknown,
    A extends Action = Action
> = DocumentHeader & {
    data: Data;
    operations: Operation<A | BaseAction>[];
    initialState: Omit<Document<Data, A>, 'initialState'>;
    fileRegistry: FileRegistry;
};

export type Attachment = `attachment://${string}`;
