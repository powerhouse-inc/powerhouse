import { Document, OperationScope } from './types';

export interface ISignal<T extends string = string, I = unknown> {
    type: T;
    input: I;
}

export type SynchronizationUnit = {
    syncId: string;
    scope: OperationScope;
    branch: string;
};

export type CreateChildDocumentInput = {
    id: string;
    documentType: string;
    document?: Document;
    synchronizationUnits: SynchronizationUnit[];
};

export type CreateChildDocumentSignal = ISignal<
    'CREATE_CHILD_DOCUMENT',
    CreateChildDocumentInput
>;

export type DeleteChildDocumentInput = {
    id: string;
};

export type DeleteChildDocumentSignal = ISignal<
    'DELETE_CHILD_DOCUMENT',
    DeleteChildDocumentInput
>;

export type CopyChildDocumentInput = {
    id: string;
    newId: string;
    synchronizationUnits: SynchronizationUnit[];
};

export type CopyChildDocumentSignal = ISignal<
    'COPY_CHILD_DOCUMENT',
    CopyChildDocumentInput
>;

export type Signal =
    | CreateChildDocumentSignal
    | DeleteChildDocumentSignal
    | CopyChildDocumentSignal;

export type SignalDispatch = (signal: Signal) => void;
