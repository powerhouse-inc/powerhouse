import { PHDocumentController } from "../core/controller.js";
import { documentModelDocumentModelModule } from "./module.js";
import type { DocumentModelAction, DocumentModelPHState } from "./types.js";

export * from "../core/controller.js";

export const DocumentModelController = PHDocumentController.forDocumentModel<
  DocumentModelPHState,
  DocumentModelAction
>(documentModelDocumentModelModule);
