import { type PHDocument } from "./types.js";

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
