import { DocumentModelModule } from "../document/types.js";
import { DocumentModelAction } from "./gen/actions.js";
import { DocumentModelLocalState, DocumentModelState } from "./gen/types.js";
export type DocumentModelDocumentModelModule = DocumentModelModule<
  DocumentModelState,
  DocumentModelLocalState,
  DocumentModelAction
>;
