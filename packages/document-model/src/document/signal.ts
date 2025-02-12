import { BaseDocument, OperationScope } from "./types.js";

export interface ISignal<TType extends string, TInput> {
  type: TType;
  input: TInput;
}

export type SynchronizationUnitInput = {
  syncId: string;
  scope: OperationScope;
  branch: string;
};

export type CreateChildDocumentInput<TGlobalState, TLocalState> = {
  id: string;
  documentType: string;
  document?: BaseDocument<TGlobalState, TLocalState>;
  synchronizationUnits: SynchronizationUnitInput[];
};

export type CreateChildDocumentSignal<TGlobalState, TLocalState> = ISignal<
  "CREATE_CHILD_DOCUMENT",
  CreateChildDocumentInput<TGlobalState, TLocalState>
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

export type Signal<TGlobalState, TLocalState> =
  | CreateChildDocumentSignal<TGlobalState, TLocalState>
  | DeleteChildDocumentSignal
  | CopyChildDocumentSignal;

export type SignalDispatch = <TGlobalState, TLocalState>(
  signal: Signal<TGlobalState, TLocalState>,
) => void;
