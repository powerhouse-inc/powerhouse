import type {
  DocumentModelModule,
  DocumentModelPHState,
  PHDocument,
} from "document-model";

export type DocumentModelDocument = PHDocument<DocumentModelPHState>;
export type DocumentModelDocumentModelModule =
  DocumentModelModule<DocumentModelPHState>;
export * from "./gen/types.js";
