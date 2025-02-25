import { OperationScope, PHDocument } from "./types.js";

export interface ISignal<TType extends string, TInput> {
  type: TType;
  input: TInput;
}

export type SynchronizationUnitInput = {
  syncId: string;
  scope: OperationScope;
  branch: string;
};

export type CreateChildDocumentInput<
  TDocument extends PHDocument = PHDocument,
> = {
  id: string;
  documentType: string;
  document?: TDocument;
  synchronizationUnits: SynchronizationUnitInput[];
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
  synchronizationUnits: SynchronizationUnitInput[];
};

export type CopyChildDocumentSignal = ISignal<
  "COPY_CHILD_DOCUMENT",
  CopyChildDocumentInput
>;

export type Signal =
  | CreateChildDocumentSignal
  | DeleteChildDocumentSignal
  | CopyChildDocumentSignal;

export type SignalDispatch = (signal: Signal) => void;
