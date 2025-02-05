import { ActionCreator, Reducer, DocumentModelUtils } from "@document/types.js";
import {
  DocumentModelAction,
  DocumentModelLocalState,
  DocumentModelState,
} from "./gen/types.js";

export type DocumentModelDocumentModelModule = {
  reducer: Reducer<
    DocumentModelState,
    DocumentModelLocalState,
    DocumentModelAction
  >;
  actions: Record<string, ActionCreator<DocumentModelAction>>;
  utils: DocumentModelUtils<
    DocumentModelState,
    DocumentModelLocalState,
    DocumentModelAction
  >;
  documentModelState: DocumentModelState;
};
