import { BaseAction, BaseDocument, OperationScope } from "./types.js";

export interface ISignal<TType extends string, TInput> {
  type: TType;
  input: TInput;
}

export type SynchronizationUnit = {
  syncId: string;
  scope: OperationScope;
  branch: string;
};

export type CreateChildDocumentInput<
  TGlobalState,
  TLocalState,
  TAction extends BaseAction,
> = {
  id: string;
  documentType: string;
  document?: BaseDocument<TGlobalState, TLocalState, TAction>;
  synchronizationUnits: SynchronizationUnit[];
};

export type CreateChildDocumentSignal<
  TGlobalState,
  TLocalState,
  TAction extends BaseAction,
> = ISignal<
  "CREATE_CHILD_DOCUMENT",
  CreateChildDocumentInput<TGlobalState, TLocalState, TAction>
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
  synchronizationUnits: SynchronizationUnit[];
};

export type CopyChildDocumentSignal = ISignal<
  "COPY_CHILD_DOCUMENT",
  CopyChildDocumentInput
>;

export type Signal<TGlobalState, TLocalState, TAction extends BaseAction> =
  | CreateChildDocumentSignal<TGlobalState, TLocalState, TAction>
  | DeleteChildDocumentSignal
  | CopyChildDocumentSignal;

export type SignalDispatch<
  TGlobalState,
  TLocalState,
  TAction extends BaseAction,
> = (signal: Signal<TGlobalState, TLocalState, TAction>) => void;
