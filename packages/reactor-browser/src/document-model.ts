import * as DocumentModels from "document-model-libs/document-models";
import { DocumentModel } from "document-model/document";
import { module as DocumentModelLib } from "document-model";

export const baseDocumentModelsMap: Record<string, DocumentModel> = {
  DocumentModel: DocumentModelLib as DocumentModel,
  ...(DocumentModels as Record<string, DocumentModel>),
};

export const baseDocumentModels = Object.values(baseDocumentModelsMap);
