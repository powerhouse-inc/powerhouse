export type Action<T = string> = {
    type: T;
    input: unknown;
};

export type Reducer<State, A extends Action> = (
    state: State,
    action: A
) => State;

export type Operation = Action & { index: number };

export type DocumentHeader = {
    name: string;
    revision: number;
    documentType: string;
    created: string;
    lastModified: string;
};

export type Document<Data = unknown> = DocumentHeader & {
    data: Data;
    operations: Operation[];
};
