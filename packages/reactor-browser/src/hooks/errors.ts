export class DocumentNotFoundError extends Error {
  constructor(documentId: string) {
    super(`Document with id ${documentId} not found`);
  }
}

export class DocumentModelNotFoundError extends Error {
  constructor(documentType: string) {
    super(`Document model module for type ${documentType} not found`);
  }
}

export class DocumentTypeMismatchError extends Error {
  constructor(documentId: string, expectedType: string, actualType: string) {
    super(
      `Document ${documentId} is not of type ${expectedType}. Actual type: ${actualType}`,
    );
  }
}

export class NoSelectedDocumentError extends Error {
  constructor() {
    super(
      "There is no selected document. Call 'setSelectedNode' to select a document.",
    );
  }
}
