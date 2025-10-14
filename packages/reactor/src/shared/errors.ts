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
