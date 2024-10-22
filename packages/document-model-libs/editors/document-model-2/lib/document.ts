import { TDocumentModel } from "../schemas/document-model";

export function getDocumentMetadata(document: TDocumentModel) {
  return {
    name: document.name,
    documentType: document.documentType,
    description: document.state.global.description ?? "",
    extension: document.state.global.extension ?? "",
    author: document.state.global.author,
  };
}
