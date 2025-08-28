import type { DocumentModelModule } from "document-model";
import { documentModelDocumentModelModule } from "document-model";

export const baseDocumentModelsMap: Record<string, DocumentModelModule> = {
  DocumentModel: documentModelDocumentModelModule as DocumentModelModule,
};

export const baseDocumentModels = Object.values(baseDocumentModelsMap);
