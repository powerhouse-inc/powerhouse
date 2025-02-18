import { DocumentModel, module as DocumentModelLib } from "document-model";
import * as DocumentModels from "document-model-libs/document-models";

export const baseDocumentModelsMap: Record<string, DocumentModel> = {
  DocumentModel: DocumentModelLib as DocumentModel,
  ...(DocumentModels as Record<string, DocumentModel>),
};

export const baseDocumentModels = Object.values(baseDocumentModelsMap);
