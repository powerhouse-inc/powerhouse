export interface ISignal<T extends string = string, I = unknown> {
    type: T;
    input: I;
}

export type CreateChildDocumentInput = {
    id: string;
    documentType: string;
    initialState?: unknown;
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

export type Signal = CreateChildDocumentSignal | DeleteChildDocumentSignal;

export type SignalDispatch = (signal: Signal) => void;
