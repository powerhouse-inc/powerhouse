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

/** A remote drive's id is already taken by a local document it can't sync into. */
export class LocalDriveIdConflictError extends Error {
  readonly name = "LocalDriveIdConflictError";
  readonly driveId: string;
  /** The live local document's name; undefined when it is deleted. */
  readonly localName: string | undefined;

  constructor(driveId: string, local: { name?: string } | "deleted") {
    super(
      local === "deleted"
        ? `A deleted local document still holds the id "${driveId}", so this remote drive can't sync here.`
        : `A local drive${local.name ? ` "${local.name}"` : ""} already uses the id "${driveId}" and isn't synced with this remote. Delete it to add this remote drive.`,
    );
    this.driveId = driveId;
    this.localName = local === "deleted" ? undefined : local.name;
  }

  static isError(error: unknown): error is LocalDriveIdConflictError {
    return Error.isError(error) && error.name === "LocalDriveIdConflictError";
  }
}
