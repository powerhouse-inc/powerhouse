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

  static isError(error: unknown): error is DocumentDeletedError {
    return Error.isError(error) && error.name === "DocumentDeletedError";
  }
}

/**
 * Error thrown when the auth policy denies an action at the executor gate.
 */
export class AuthorizationDeniedError extends Error {
  public readonly documentId: string;
  public readonly scope: string;
  public readonly operation: string;
  public readonly subject: string | undefined;

  constructor(
    documentId: string,
    scope: string,
    operation: string,
    subject?: string,
  ) {
    super(
      `Authorization denied: ${subject ?? "anonymous"} may not execute ${operation} in scope "${scope}" of document ${documentId}`,
    );
    this.name = "AuthorizationDeniedError";
    this.documentId = documentId;
    this.scope = scope;
    this.operation = operation;
    this.subject = subject;

    Error.captureStackTrace(this, AuthorizationDeniedError);
  }

  static isError(error: unknown): error is AuthorizationDeniedError {
    return Error.isError(error) && error.name === "AuthorizationDeniedError";
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

export { DowngradeNotSupportedError } from "@powerhousedao/shared/document-model";

/**
 * Error thrown when an upgrade manifest is required but not registered.
 */
export class UpgradeManifestNotFoundError extends Error {
  public readonly documentType: string;

  constructor(documentType: string) {
    super(`No upgrade manifest registered for document type: ${documentType}`);
    this.name = "UpgradeManifestNotFoundError";
    this.documentType = documentType;

    Error.captureStackTrace(this, UpgradeManifestNotFoundError);
  }
}

/**
 * Error thrown when a document is not found (no operations exist for the document ID).
 */
export class DocumentNotFoundError extends Error {
  public readonly documentId: string;

  constructor(documentId: string) {
    super(`Document ${documentId} not found`);
    this.name = "DocumentNotFoundError";
    this.documentId = documentId;

    Error.captureStackTrace(this, DocumentNotFoundError);
  }

  static isError(error: unknown): error is DocumentNotFoundError {
    return Error.isError(error) && error.name === "DocumentNotFoundError";
  }
}
