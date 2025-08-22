import type { PHDocument } from "../../document/types.js";
import type { DocumentModelAction } from "./actions.js";
import { DocumentModelPHState } from "./ph-factories.js";
import type {
  DocumentModelLocalState,
  DocumentModelState,
} from "./schema/types.js";

export type DocumentModelDocument = PHDocument<DocumentModelPHState>;
export { DocumentModelAction, DocumentModelLocalState, DocumentModelState };
