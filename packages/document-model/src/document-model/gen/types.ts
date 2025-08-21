import type { BaseDocument, BaseState } from "../../document/types.js";
import type { DocumentModelAction } from "./actions.js";
import type {
  DocumentModelLocalState,
  DocumentModelState,
} from "./schema/types.js";

export type ExtendedDocumentModelState = BaseState<
  DocumentModelState,
  DocumentModelLocalState
>;
export type DocumentModelDocument = BaseDocument<
  DocumentModelState,
  DocumentModelLocalState
>;
export type {
  DocumentModelAction,
  DocumentModelLocalState,
  DocumentModelState,
};
