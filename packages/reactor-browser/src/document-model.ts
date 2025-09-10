import type { DocumentModelModule } from "document-model";
import { documentModelDocumentModelModule } from "document-model";

export const baseDocumentModelsMap: Record<
  string,
  DocumentModelModule<DocumentModelPHState>
> = {
  DocumentModel:
    documentModelDocumentModelModule as DocumentModelModule<DocumentModelPHState>,
};

export const baseDocumentModels = Object.values(baseDocumentModelsMap);
