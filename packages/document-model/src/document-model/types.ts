import { DocumentModelModule } from "@document/types.js";
import { DocumentModelLocalState, DocumentModelState } from "./gen/types.js";
import { DocumentModelAction } from "./gen/actions.js";
export type DocumentModelDocumentModelModule = DocumentModelModule<
  DocumentModelState,
  DocumentModelLocalState,
  DocumentModelAction
>;
