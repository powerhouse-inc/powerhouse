import {
  ActionCreator,
  Reducer,
  TEditor,
  DocumentModelUtils,
  BaseAction,
} from "@document/types.js";
import { DocumentModelState } from "./gen/types.js";

export type DocumentModelModule<
  TGlobalState = unknown,
  TLocalState = unknown,
  TAction extends BaseAction = BaseAction,
> = {
  reducer: Reducer<TGlobalState, TLocalState, TAction>;
  actions: Record<string, ActionCreator<TAction>>;
  utils: DocumentModelUtils<TGlobalState, TLocalState, TAction>;
  documentModelState: DocumentModelState;
};

export type DocumentModelLib<
  TGlobalState = unknown,
  TLocalState = unknown,
  TAction extends BaseAction = BaseAction,
> = {
  documentModels: DocumentModelModule<TGlobalState, TLocalState, TAction>[];
  editors: TEditor<TGlobalState, TLocalState, TAction>[];
};
