export const WRONG_BACKEND_CODE = "wrong-backend";

/** What the router learned from a refusal. Fields it cannot read are `""`. */
export type MisrouteInfo = {
  readonly misrouted: boolean;
  readonly collectionId: string;
  readonly documentId: string;
  readonly ownerHint: string;
  readonly rejectedBy: string;
  readonly reason: string;
};

export const NOT_MISROUTED: MisrouteInfo = Object.freeze({
  misrouted: false,
  collectionId: "",
  documentId: "",
  ownerHint: "",
  rejectedBy: "",
  reason: "",
});

export type WrongBackendDetails = {
  readonly collectionId?: string;
  readonly documentId?: string;
  readonly ownerHint?: string;
  readonly rejectedBy?: string;
  readonly operation?: string;
};

/** The backend does not hold the target; nothing ran, so the router re-aims. */
export class WrongBackendError extends Error {
  readonly code = WRONG_BACKEND_CODE;
  readonly collectionId: string;
  readonly documentId: string;
  readonly ownerHint: string;
  readonly rejectedBy: string;
  readonly operation: string;

  constructor(details: WrongBackendDetails) {
    const collectionId = details.collectionId ?? "";
    const documentId = details.documentId ?? "";
    const ownerHint = details.ownerHint ?? "";
    const rejectedBy = details.rejectedBy ?? "";
    const operation = details.operation ?? "";
    super(
      `${WRONG_BACKEND_CODE}: collection=${collectionId} document=${documentId} owner=${ownerHint} rejectedBy=${rejectedBy}` +
        ` -- this reactor does not own the target of ${operation === "" ? "the operation" : operation}`,
    );
    this.name = "WrongBackendError";
    this.collectionId = collectionId;
    this.documentId = documentId;
    this.ownerHint = ownerHint;
    this.rejectedBy = rejectedBy;
    this.operation = operation;
  }
}

/** A WrongBackendError by name, or the GraphQL client's 421 refusal. */
export function misrouteOf(value: unknown): MisrouteInfo {
  if (!Error.isError(value)) {
    return NOT_MISROUTED;
  }
  if (value.name === "WrongBackendError") {
    const fields = value as Partial<WrongBackendError>;
    return Object.freeze({
      misrouted: true,
      collectionId: fields.collectionId ?? "",
      documentId: fields.documentId ?? "",
      ownerHint: fields.ownerHint ?? "",
      rejectedBy: fields.rejectedBy ?? "",
      reason: value.message,
    });
  }
  const refusal = value as { status?: unknown; driveId?: unknown };
  if (
    value.name === "GraphQLWrongBackendError" &&
    refusal.status === 421 &&
    typeof refusal.driveId === "string"
  ) {
    return Object.freeze({
      misrouted: true,
      collectionId: "",
      documentId: refusal.driveId,
      ownerHint: "",
      rejectedBy: "",
      reason: value.message,
    });
  }
  return NOT_MISROUTED;
}

export function isMisroute(value: unknown): boolean {
  return misrouteOf(value).misrouted;
}

export class UnknownBackendError extends Error {
  constructor(
    readonly backend: string,
    readonly known: readonly string[],
    context: string,
  ) {
    super(
      `Unknown reactor backend ${JSON.stringify(backend)} (${context}); this router holds ${JSON.stringify(known)}`,
    );
    this.name = "UnknownBackendError";
  }
}

/** Every backend fails the collection's requirements; `reasons` says why. */
export class NoEligibleBackendError extends Error {
  constructor(
    readonly collectionId: string,
    readonly reasons: readonly string[],
  ) {
    super(
      `No reactor backend can hold collection ${JSON.stringify(collectionId)}: ${reasons.join("; ")}`,
    );
    this.name = "NoEligibleBackendError";
  }
}

/** Every backend the operation was aimed at refused it. It ran nowhere. */
export class MisrouteUnresolvedError extends Error {
  constructor(
    readonly operation: string,
    readonly target: string,
    readonly refusedBy: readonly string[],
    readonly lastReason: string,
  ) {
    super(
      `${operation} on ${JSON.stringify(target)} was refused by every backend it was routed to (${JSON.stringify(refusedBy)}) within the attempt budget; last refusal: ${lastReason}`,
    );
    this.name = "MisrouteUnresolvedError";
  }
}

/** No cross-reactor transaction exists to order a spanning batch in. */
export class CrossBackendBatchError extends Error {
  constructor(
    readonly operation: string,
    readonly placement: readonly { documentId: string; backend: string }[],
  ) {
    const byBackend = placement
      .map((entry) => `${entry.documentId}@${entry.backend}`)
      .join(", ");
    super(
      `${operation} spans multiple reactor backends, which this router does not support: ${byBackend}.` +
        ` Submit one ${operation} per backend, or place these documents on one reactor.`,
    );
    this.name = "CrossBackendBatchError";
  }
}

/** A relationship is written within one backend; reads are not limited. */
export class CrossBackendRelationshipError extends Error {
  constructor(
    readonly operation: string,
    readonly source: string,
    readonly sourceBackend: string,
    readonly target: string,
    readonly targetBackend: string,
  ) {
    super(
      `${operation} would cross reactor backends, which this router does not support:` +
        ` source ${JSON.stringify(source)} is on ${sourceBackend}, target ${JSON.stringify(target)} is on ${targetBackend}.`,
    );
    this.name = "CrossBackendRelationshipError";
  }
}

/** A fan-in read some backend failed, so the result would be silently short. */
export class FanInPartialFailureError extends Error {
  constructor(
    readonly operation: string,
    readonly failures: readonly { backend: string; error: unknown }[],
    readonly partial: unknown,
  ) {
    const named = failures
      .map((failure) => `${failure.backend}: ${messageOf(failure.error)}`)
      .join("; ");
    super(
      `${operation} could not be answered by every backend, so its result would be silently incomplete (${named})`,
    );
    this.name = "FanInPartialFailureError";
  }
}

export class InvalidFanInCursorError extends Error {
  constructor(
    readonly cursor: string,
    reason: string,
  ) {
    super(
      `Malformed router fan-in cursor ${JSON.stringify(cursor)}: ${reason}`,
    );
    this.name = "InvalidFanInCursorError";
  }
}

/** Rethrows a caught value unchanged; wrapping it would hide a misroute. */
export function rethrow(value: unknown): never {
  throw value as Error;
}

export function rejectedWith<T>(value: unknown): Promise<T> {
  return new Promise<T>((_resolve, reject) => {
    reject(value as Error);
  });
}

export function messageOf(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  return String(value);
}
