export interface ISignal<T extends string = string, I = unknown> {
    type: T;
    input: I;
}

export type CreateChildDocumentInput = {
    id: string;
    documentType: string;
    document?: Document;
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
