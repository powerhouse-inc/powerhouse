import type { BaseDocument, ExtendedState } from "../../document/types.js";
import type {
  DocumentModelState,
  DocumentModelLocalState,
} from "./schema/types.js";
import type { DocumentModelAction } from "./actions.js";

export type ExtendedDocumentModelState = ExtendedState<
  DocumentModelState,
  DocumentModelLocalState
>;
export type DocumentModelDocument = BaseDocument<
  DocumentModelState,
  DocumentModelLocalState
>;
export { DocumentModelState, DocumentModelAction, DocumentModelLocalState };
