export class UnsupportedDocumentTypeError extends Error {
  constructor(documentType: string) {
    super(`Document type ${documentType} is not supported`);
    this.name = "UnsupportedDocumentTypeError";
  }

  static isError(error: unknown): error is UnsupportedDocumentTypeError {
    return (
      Error.isError(error) && error.name === "UnsupportedDocumentTypeError"
    );
  }
}

export class DocumentNotFoundError extends Error {
  constructor(documentId: string) {
    super(`Document with id ${documentId} not found`);
  }
}

export class DocumentModelNotFoundError extends Error {
  readonly documentType: string;
  readonly name = "DocumentModelNotFoundError";

  constructor(documentType: string) {
    super(`Document model module for type ${documentType} not found`);
    this.documentType = documentType;
  }

  static isError(error: unknown): error is DocumentModelNotFoundError {
    return Error.isError(error) && error.name === "DocumentModelNotFoundError";
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
      "There is no selected document. Did you mean to call 'useSelectedDocumentSafe' instead?",
    );
  }
}
