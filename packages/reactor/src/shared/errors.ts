/**
 * Error thrown when attempting to access a deleted document.
 */
export class DocumentDeletedError extends Error {
  public readonly documentId: string;
  public readonly deletedAtUtcIso: string | null;

  constructor(documentId: string, deletedAtUtcIso: string | null = null) {
    const message = deletedAtUtcIso
      ? `Document ${documentId} was deleted at ${deletedAtUtcIso}`
      : `Document ${documentId} has been deleted`;

    super(message);
    this.name = "DocumentDeletedError";
    this.documentId = documentId;
    this.deletedAtUtcIso = deletedAtUtcIso;

    Error.captureStackTrace(this, DocumentDeletedError);
  }
}

/**
 * Error thrown when attempting to add operations before CREATE_DOCUMENT.
 */
export class CreateDocumentRequiredError extends Error {
  public readonly documentId: string;
  public readonly scope: string;

  constructor(documentId: string, scope: string) {
    const message = `Document ${documentId} requires a CREATE_DOCUMENT operation at revision 0 in the "document" scope before operations can be added to scope "${scope}"`;

    super(message);
    this.name = "CreateDocumentRequiredError";
    this.documentId = documentId;
    this.scope = scope;

    Error.captureStackTrace(this, CreateDocumentRequiredError);
  }
}

/**
 * Error thrown when an operation has an invalid signature.
 */
export class InvalidSignatureError extends Error {
  public readonly documentId: string;
  public readonly reason: string;

  constructor(documentId: string, reason: string) {
    super(`Invalid signature in document ${documentId}: ${reason}`);
    this.name = "InvalidSignatureError";
    this.documentId = documentId;
    this.reason = reason;

    Error.captureStackTrace(this, InvalidSignatureError);
  }
}
