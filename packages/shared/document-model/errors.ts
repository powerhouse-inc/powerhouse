import type { ZodIssue } from "zod";
import type { PHDocument } from "./documents.js";
import type { Operation } from "./operations.js";

export const FileSystemError = new Error("File system not available.");

export class InvalidActionInputError extends Error {
  public data: unknown;
  constructor(data: unknown) {
    super();
    this.name = "InvalidActionInputError";
    this.data = data;
    this.message =
      this.message || `Invalid action input: ${JSON.stringify(data, null, 2)}`;
  }
}

export class InvalidActionInputZodError extends InvalidActionInputError {
  public issues: ZodIssue[];

  constructor(issues: ZodIssue[]) {
    super(issues);
    this.issues = issues;
    this.name = "InvalidActionInputZodError";
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
  }
}

/**
 * Thrown when INITIALIZE_AUTH is applied to an already-initialized auth scope.
 * The genesis action is valid only at auth revision zero.
 */
export class AuthAlreadyInitializedError extends Error {
  public readonly documentId: string;

  constructor(documentId: string) {
    super(
      `Auth scope already initialized for document ${documentId}: INITIALIZE_AUTH is valid only at auth revision zero`,
    );
    this.name = "AuthAlreadyInitializedError";
    this.documentId = documentId;
  }
}

/**
 * Thrown when INITIALIZE_AUTH is not signed by the document creator (its signer
 * does not match `header.sig.publicKey`), so it cannot set the auth policy.
 */
export class AuthInitializerNotCreatorError extends Error {
  public readonly documentId: string;

  constructor(documentId: string) {
    super(
      `INITIALIZE_AUTH for document ${documentId} must be signed by the document creator`,
    );
    this.name = "AuthInitializerNotCreatorError";
    this.documentId = documentId;
  }
}

/**
 * Thrown when INITIALIZE_AUTH carries a version below 1. Version 0 is reserved
 * for the uninitialized auth scope.
 */
export class InvalidAuthVersionError extends Error {
  public readonly documentId: string;
  public readonly version: number;

  constructor(documentId: string, version: number) {
    super(
      `Invalid auth policy version ${version} for document ${documentId}: INITIALIZE_AUTH requires an integer version >= 1`,
    );
    this.name = "InvalidAuthVersionError";
    this.documentId = documentId;
    this.version = version;
  }
}

/** Thrown when a duplicate would lose the source policy's version or creator binding. */
export class AuthPolicyNotPreservedError extends Error {
  public readonly documentId: string;

  constructor(documentId: string) {
    super(
      `Duplicating document ${documentId} would not preserve its auth policy: the copy loses the policy version or its creator binding`,
    );
    this.name = "AuthPolicyNotPreservedError";
    this.documentId = documentId;
  }
}

/**
 * Thrown when a grant referenced by REMOVE_GRANT or MOVE_GRANT does not exist.
 */
export class GrantNotFoundError extends Error {
  public readonly grantId: string;

  constructor(grantId: string) {
    super(`Grant not found in auth scope: ${grantId}`);
    this.name = "GrantNotFoundError";
    this.grantId = grantId;
  }
}

/**
 * Thrown when a disallowed action (UNDO, REDO, PRUNE) targets the auth scope.
 */
export class AuthActionNotAllowedError extends Error {
  public readonly actionType: string;

  constructor(actionType: string) {
    super(`${actionType} is not permitted on the auth scope`);
    this.name = "AuthActionNotAllowedError";
    this.actionType = actionType;
  }
}

export class HashMismatchError extends Error {
  protected _scope: string;
  protected _document: PHDocument;
  protected _operation: Operation;

  constructor(scope: string, document: PHDocument, operation: Operation) {
    super();
    this.name = "HashMismatchError";
    this._document = document;
    this._scope = scope;
    this._operation = operation;

    this.message = JSON.stringify(
      {
        error: `Hash mismatch on document ${document.header.id}, scope ${scope}, index ${operation.index}`,
        document,
        operation,
      },
      null,
      1,
    );
  }

  get document() {
    return this._document;
  }

  get scope() {
    return this._scope;
  }

  get operation() {
    return this._operation;
  }
}
