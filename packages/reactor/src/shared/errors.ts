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
 * An auth operation did not strictly exceed the newest timestamp in its stream.
 *
 * Terminal and asymmetric by design: no ordering rule can reconcile two replicas
 * that each accepted an auth operation offline, because either order hands one
 * authority the other never granted, so the replica ahead holds the arrival.
 */
export class AuthTimestampNotMonotonicError extends Error {
  public readonly documentId: string;
  public readonly branch: string;
  public readonly timestampUtcMs: string;
  public readonly newestTimestampUtcMs: string;

  constructor(
    documentId: string,
    branch: string,
    timestampUtcMs: string,
    newestTimestampUtcMs: string,
  ) {
    super(
      `Auth timestamp not monotonic: ${timestampUtcMs} does not exceed ${newestTimestampUtcMs} in the auth stream of document ${documentId} on branch ${branch}`,
    );
    this.name = "AuthTimestampNotMonotonicError";
    this.documentId = documentId;
    this.branch = branch;
    this.timestampUtcMs = timestampUtcMs;
    this.newestTimestampUtcMs = newestTimestampUtcMs;

    Error.captureStackTrace(this, AuthTimestampNotMonotonicError);
  }

  static isError(error: unknown): error is AuthTimestampNotMonotonicError {
    return (
      Error.isError(error) && error.name === "AuthTimestampNotMonotonicError"
    );
  }
}

/**
 * An operation or action carried a timestamp that is not an ISO-8601 UTC
 * instant.
 *
 * Terminal rather than retryable: the value does not change between attempts,
 * so a retry re-runs the whole job to fail identically. Quarantining, unlike a
 * held auth operation — this is malformed data rather than two replicas
 * disagreeing, and nothing further from that source should be trusted until it
 * is looked at.
 */
export class InvalidOperationTimestampError extends Error {
  public readonly documentId: string;
  public readonly scope: string;
  public readonly timestampUtcMs: string;

  constructor(
    documentId: string,
    scope: string,
    timestampUtcMs: string,
    context: string,
  ) {
    super(
      `Invalid timestamp "${timestampUtcMs}" on ${context} in scope "${scope}" of document ${documentId}`,
    );
    this.name = "InvalidOperationTimestampError";
    this.documentId = documentId;
    this.scope = scope;
    this.timestampUtcMs = timestampUtcMs;

    Error.captureStackTrace(this, InvalidOperationTimestampError);
  }

  static isError(error: unknown): error is InvalidOperationTimestampError {
    return (
      Error.isError(error) && error.name === "InvalidOperationTimestampError"
    );
  }
}

/**
 * A load would move more operations than the bound allows, indicating a real
 * divergence between local and incoming history. Counts only first-time moves,
 * so a re-evaluation pass's re-appends do not make busy documents
 * revocation-proof. Terminal: the condition is deterministic.
 */
export class ExcessiveReshuffleError extends Error {
  public readonly documentId: string;
  public readonly scope: string;
  public readonly count: number;
  public readonly threshold: number;

  constructor(
    documentId: string,
    scope: string,
    count: number,
    threshold: number,
  ) {
    super(
      `Excessive reshuffle detected: ${count} operations in scope "${scope}" of document ${documentId} exceeds the threshold of ${threshold}. This indicates a significant divergence between local and incoming operations.`,
    );
    this.name = "ExcessiveReshuffleError";
    this.documentId = documentId;
    this.scope = scope;
    this.count = count;
    this.threshold = threshold;

    Error.captureStackTrace(this, ExcessiveReshuffleError);
  }

  static isError(error: unknown): error is ExcessiveReshuffleError {
    return Error.isError(error) && error.name === "ExcessiveReshuffleError";
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
 * An UPGRADE_DOCUMENT action's preconditions (fromVersion and the per-scope
 * revision snapshot) did not match the document state the executor loaded.
 *
 * Terminal rather than retryable: the action carries the client's snapshot,
 * which stays stale no matter how often the job re-runs. The client is
 * expected to re-read the document and submit a fresh action instead.
 */
export class UpgradePreconditionFailedError extends Error {
  public readonly documentId: string;
  public readonly detail: string;

  constructor(documentId: string, detail: string) {
    super(`Upgrade precondition failed for document ${documentId}: ${detail}`);
    this.name = "UpgradePreconditionFailedError";
    this.documentId = documentId;
    this.detail = detail;

    Error.captureStackTrace(this, UpgradePreconditionFailedError);
  }

  static isError(error: unknown): error is UpgradePreconditionFailedError {
    return (
      Error.isError(error) && error.name === "UpgradePreconditionFailedError"
    );
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

/**
 * An authorization preflight was asked for while the reactor's decision model
 * is off, so there is no model to answer from.
 *
 * Thrown rather than answered from the legacy host-side permission tables. The
 * two systems do not compose: the tables record which addresses a host lets
 * near a drive, the policy records what a document's own grants permit, and an
 * answer stitched from both would report an admission verdict neither system
 * would reach. A caller that cannot get a prediction disables nothing, which
 * leaves the submit path -- and its real gate -- as the only authority.
 *
 * Detection is by `name`, not `instanceof`: the SharedWorker RPC boundary
 * rebuilds a thrown error from `{ name, message, stack, cause }` alone
 * (`reactor-browser/src/rpc/error-info.ts`), so the class identity and any
 * custom field are lost in transit. This error therefore carries no fields.
 */
export class AuthEnforcementDisabledError extends Error {
  constructor() {
    super(
      "Authorization evaluation requires the authEnforcement feature flag; " +
        "this reactor holds no decision model, and the legacy host-table " +
        "permission system cannot answer for one",
    );
    this.name = "AuthEnforcementDisabledError";

    Error.captureStackTrace(this, AuthEnforcementDisabledError);
  }

  static isError(error: unknown): error is AuthEnforcementDisabledError {
    return (
      Error.isError(error) && error.name === "AuthEnforcementDisabledError"
    );
  }
}
