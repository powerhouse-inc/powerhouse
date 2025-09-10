import type { DocumentModelModule } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import type { DocumentModelPHState } from "document-model/document-model/gen/ph-factories";

export const baseDocumentModelsMap: Record<
  string,
  DocumentModelModule<DocumentModelPHState>
> = {
  DocumentModel:
    documentModelDocumentModelModule as DocumentModelModule<DocumentModelPHState>,
};

export const baseDocumentModels = Object.values(baseDocumentModelsMap);
