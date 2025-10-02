export class UnsupportedDocumentTypeError extends Error {
  constructor(documentType: string) {
    super(`Document type ${documentType} is not supported`);
    this.name = "UnsupportedDocumentTypeError";
  }
}
