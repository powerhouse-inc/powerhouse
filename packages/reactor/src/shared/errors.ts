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

/**
 * Error thrown when attempting to downgrade a document version.
 */
export class DowngradeNotSupportedError extends Error {
  public readonly documentType: string;
  public readonly fromVersion: number;
  public readonly toVersion: number;

  constructor(documentType: string, fromVersion: number, toVersion: number) {
    super(
      `Downgrade not supported for ${documentType}: cannot upgrade from version ${fromVersion} to ${toVersion}`,
    );
    this.name = "DowngradeNotSupportedError";
    this.documentType = documentType;
    this.fromVersion = fromVersion;
    this.toVersion = toVersion;

    Error.captureStackTrace(this, DowngradeNotSupportedError);
  }
}

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
