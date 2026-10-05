/**
 * The router's error surface, and the one structured signal the whole advisory
 * posture rests on.
 *
 * Plan agreed decision 4: "backends validate ownership and return structured
 * misroute errors; correctness never depends on the router". This file is the
 * wire form of that sentence -- {@link WrongBackendError} is what a backend
 * raises, {@link misrouteOf} is what the router recognises, and everything else
 * here is a refusal the router owes a caller instead of a silent partial
 * result.
 */

/** The code {@link WrongBackendError} carries, and the marker on its message. */
export const WRONG_BACKEND_CODE = "wrong-backend";

/**
 * reactor-api's gateway spelling of the same thing
 * (`graphql/gateway/drive-middleware.ts`: a 421 body of
 * `{ error: "wrong-shard", driveId }`). Recognised as a misroute so a remote
 * backend whose client surfaces that body needs no router-specific error type.
 */
export const WRONG_SHARD_CODE = "wrong-shard";

/**
 * What the router learned from a refusal. Every field is best-effort: a backend
 * that knows only "not mine" still produces a usable misroute, because the
 * router's recovery does not need the error to name the owner -- it re-probes.
 *
 * `misrouted: false` (the frozen {@link NOT_MISROUTED}) is the answer for any
 * value that is not a misroute at all, so a caller branches on a field rather
 * than on an absent object.
 */
export type MisrouteInfo = {
  readonly misrouted: boolean;
  /** Canonical `DriveCollectionId.key` the refusal names, or `""`. */
  readonly collectionId: string;
  /** Document the refused operation targeted, or `""`. */
  readonly documentId: string;
  /** Backend the refuser believes owns it, or `""` when it cannot say. */
  readonly ownerHint: string;
  /** Backend that refused, or `""` when the error does not name itself. */
  readonly rejectedBy: string;
  readonly reason: string;
};

/** Not a misroute. */
export const NOT_MISROUTED: MisrouteInfo = Object.freeze({
  misrouted: false,
  collectionId: "",
  documentId: "",
  ownerHint: "",
  rejectedBy: "",
  reason: "",
});

/** What a backend states when it refuses an operation it does not own. */
export type WrongBackendDetails = {
  /** Canonical collection id (`DriveCollectionId.key`), when the backend knows it. */
  readonly collectionId?: string;
  /** The document the operation targeted. */
  readonly documentId?: string;
  /** The backend that owns it, when the refuser can say. */
  readonly ownerHint?: string;
  /** The refusing backend's own name. */
  readonly rejectedBy?: string;
  /** The operation that was refused, for the log line. */
  readonly operation?: string;
};

/**
 * Raised by a BACKEND that was handed an operation for a collection or document
 * it does not own. The router catches it, corrects its table and retries
 * elsewhere; nothing else in the system has to be right for that to work.
 *
 * **The message is part of the contract.** It opens with a canonical,
 * machine-readable prefix --
 * `wrong-backend: collection=<key> document=<id> owner=<name> rejectedBy=<name>` --
 * because the only two fields that survive every boundary in this repo are
 * `name` and `message`. The reactor's own `ErrorInfo`
 * (`packages/reactor/src/shared/types.ts`) carries exactly those plus
 * `documentId`, and `structuredClone` of an `Error` keeps neither the prototype
 * nor custom own properties -- so a misroute raised inside a SharedWorker
 * reactor and surfaced through `reactor-browser`'s RPC proxy arrives as a plain
 * `Error` with this name and this message. {@link misrouteOf} therefore reads
 * the instance when it has one and parses the message when it does not, and
 * recovery works identically in both cases.
 */
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

const MESSAGE_FIELD_PATTERN =
  /^wrong-backend: collection=(\S*) document=(\S*) owner=(\S*) rejectedBy=(\S*)/;

/**
 * Reads a thrown value as a misroute, from whichever of the three forms
 * survived the trip:
 *
 * 1. a live {@link WrongBackendError} (same realm, direct client);
 * 2. any error whose name is `WrongBackendError` or whose message carries the
 *    canonical prefix -- the RPC/structured-clone case, where the fields are
 *    recovered from the message;
 * 3. a plain object shaped like reactor-api's 421 body
 *    (`{ error: "wrong-shard", driveId }`), so a GraphQL backend's own refusal
 *    needs no translation layer.
 *
 * Anything else is {@link NOT_MISROUTED} and is rethrown by the caller
 * untouched: a genuine failure must never be re-aimed at another backend.
 */
export function misrouteOf(value: unknown): MisrouteInfo {
  if (value instanceof WrongBackendError) {
    return Object.freeze({
      misrouted: true,
      collectionId: value.collectionId,
      documentId: value.documentId,
      ownerHint: value.ownerHint,
      rejectedBy: value.rejectedBy,
      reason: value.message,
    });
  }
  const fromMessage = misrouteFromMessage(value);
  if (fromMessage.misrouted) {
    return fromMessage;
  }
  return misrouteFromWrongShard(value);
}

/** Whether the value is a misroute in any of its recognised forms. */
export function isMisroute(value: unknown): boolean {
  return misrouteOf(value).misrouted;
}

function misrouteFromMessage(value: unknown): MisrouteInfo {
  if (typeof value !== "object" || value === null) {
    return NOT_MISROUTED;
  }
  const candidate = value as { name?: unknown; message?: unknown };
  if (typeof candidate.message !== "string") {
    return NOT_MISROUTED;
  }
  const match = MESSAGE_FIELD_PATTERN.exec(candidate.message);
  if (match === null) {
    // A `WrongBackendError` whose message was rewritten still identifies
    // itself by name; it just carries no fields, which recovery survives.
    if (candidate.name === "WrongBackendError") {
      return Object.freeze({
        misrouted: true,
        collectionId: "",
        documentId: "",
        ownerHint: "",
        rejectedBy: "",
        reason: candidate.message,
      });
    }
    return NOT_MISROUTED;
  }
  return Object.freeze({
    misrouted: true,
    collectionId: match[1],
    documentId: match[2],
    ownerHint: match[3],
    rejectedBy: match[4],
    reason: candidate.message,
  });
}

function misrouteFromWrongShard(value: unknown): MisrouteInfo {
  if (typeof value !== "object" || value === null) {
    return NOT_MISROUTED;
  }
  const candidate = value as { error?: unknown; driveId?: unknown };
  if (candidate.error !== WRONG_SHARD_CODE) {
    return NOT_MISROUTED;
  }
  const driveId =
    typeof candidate.driveId === "string" ? candidate.driveId : "";
  return Object.freeze({
    misrouted: true,
    collectionId: "",
    documentId: driveId,
    ownerHint: "",
    rejectedBy: "",
    reason: `${WRONG_SHARD_CODE}: driveId=${driveId}`,
  });
}

/** A `collections` override, or a misroute hint, naming a backend that is not here. */
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

/**
 * No backend can hold the collection: every candidate failed its requirements.
 * Names the reason per backend, because "nothing is eligible" without them
 * sends an operator to read the placement code.
 */
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

/**
 * A misroute the router could not resolve inside its attempt budget: every
 * backend it aimed at refused. The operation did NOT happen anywhere, which is
 * the whole point of refusing rather than resolving.
 */
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

/**
 * A v1 constraint: a batch never spans reactors.
 *
 * A batch's whole value is its dependency ordering inside one executor's queue,
 * and there is no cross-reactor transaction to order it in. Splitting it per
 * backend would run the halves independently -- dependent jobs racing, and a
 * failure leaving one backend committed and the other not -- so the router
 * refuses by name instead (plan: "batches never span reactors"). Place the
 * documents on one reactor, or submit one batch per reactor and sequence them
 * yourself.
 */
export class CrossBackendBatchError extends Error {
  constructor(
    readonly operation: string,
    readonly placement: readonly { documentId: string; backend: string }[],
  ) {
    const byBackend = placement
      .map((entry) => `${entry.documentId}@${entry.backend}`)
      .join(", ");
    super(
      `${operation} spans multiple reactor backends, which this router does not support (v1 constraint): ${byBackend}.` +
        ` Submit one ${operation} per backend, or place these documents on one reactor.`,
    );
    this.name = "CrossBackendBatchError";
  }
}

/**
 * A v1 constraint: a relationship is WRITTEN within one reactor.
 *
 * The write is an operation on the source document, and the executor validates
 * the target the same way it validates any other referenced document -- a
 * target that is not in its store is not a relationship it can record. READS
 * are fanned in and merged, so a relationship that exists on either side is
 * visible through the router (plan: "cross-reactor relationships are READ-level
 * only").
 */
export class CrossBackendRelationshipError extends Error {
  constructor(
    readonly operation: string,
    readonly source: string,
    readonly sourceBackend: string,
    readonly target: string,
    readonly targetBackend: string,
  ) {
    super(
      `${operation} would cross reactor backends, which this router does not support (v1 constraint):` +
        ` source ${JSON.stringify(source)} is on ${sourceBackend}, target ${JSON.stringify(target)} is on ${targetBackend}.` +
        ` Cross-reactor relationships are read-level only.`,
    );
    this.name = "CrossBackendRelationshipError";
  }
}

/** The code {@link ReactorOperationNotSupportedError} carries on its message. */
export const OPERATION_NOT_SUPPORTED_CODE = "operation-not-supported";

/** What a backend states when it cannot serve an operation by contract. */
export type ReactorOperationNotSupportedDetails = {
  /** The backend that cannot serve the operation. */
  readonly backend: string;
  /** The `IReactorClient` member that is not served. */
  readonly operation: string;
  /** Why it is not served, for the diagnostic line. */
  readonly reason?: string;
};

/**
 * Raised by a BACKEND that, BY CONTRACT, cannot answer a given operation -- its
 * client serves only a subset of `IReactorClient` and the member asked for is
 * outside it.
 *
 * This is categorically NOT a failure. A fan-in read that reaches a backend
 * which cannot serve the read treats that backend as NOT APPLICABLE to the read
 * and EXCLUDES it from the union (surfacing the exclusion through the router's
 * diagnostic), rather than raising {@link FanInPartialFailureError} -- because a
 * backend that was never going to answer is not evidence the result is
 * incomplete, where a CAPABLE backend that errors at runtime is. That
 * distinction is the whole point: the capability contract drives routing, so a
 * capability-limited backend cannot brick a fan-in the way a generic throw
 * would (multi-reactor motivation 3: capability variance is modelled, not
 * papered over).
 *
 * **The message carries the code** -- it opens with {@link OPERATION_NOT_SUPPORTED_CODE} --
 * so the signal survives a structured-clone/RPC boundary that keeps only `name`
 * and `message`, the same reasoning as {@link WrongBackendError}. The remote
 * backend that raises this today throws it SYNCHRONOUSLY in the router's own
 * realm, so {@link isOperationNotSupported} usually matches the instance; the
 * message and name checks keep it recognised if it ever crosses a boundary.
 */
export class ReactorOperationNotSupportedError extends Error {
  readonly code = OPERATION_NOT_SUPPORTED_CODE;
  readonly backend: string;
  readonly operation: string;

  constructor(details: ReactorOperationNotSupportedDetails) {
    const backend = details.backend;
    const operation = details.operation;
    const reason = details.reason ?? "";
    super(
      `${OPERATION_NOT_SUPPORTED_CODE}: backend ${JSON.stringify(backend)} does not support ${JSON.stringify(operation)}` +
        (reason === "" ? "" : ` -- ${reason}`),
    );
    this.name = "ReactorOperationNotSupportedError";
    this.backend = backend;
    this.operation = operation;
  }
}

/**
 * Whether a thrown value is a {@link ReactorOperationNotSupportedError} in any
 * of the forms that survive the trip: the live instance (same realm, the
 * common case), an error whose name is `ReactorOperationNotSupportedError`, or
 * any error whose message carries {@link OPERATION_NOT_SUPPORTED_CODE} (the
 * structured-clone/RPC case). Anything else is `false` and is treated as a
 * genuine failure.
 */
export function isOperationNotSupported(value: unknown): boolean {
  if (value instanceof ReactorOperationNotSupportedError) {
    return true;
  }
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as { name?: unknown; message?: unknown };
  if (candidate.name === "ReactorOperationNotSupportedError") {
    return true;
  }
  return (
    typeof candidate.message === "string" &&
    candidate.message.startsWith(`${OPERATION_NOT_SUPPORTED_CODE}:`)
  );
}

/**
 * A strict fan-in lost a backend. Carries what DID answer, because a caller
 * that can act on a partial page should be able to -- but it has to opt into
 * knowing the page is partial, rather than being handed a short list that looks
 * complete.
 *
 * A backend EXCLUDED for being not applicable to the operation
 * ({@link ReactorOperationNotSupportedError}) is never one of these failures:
 * it is excluded and surfaced, never counted as incompleteness.
 */
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

/** A paged cursor the router minted for a fan-in, handed back malformed. */
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

/**
 * Rethrows a caught value exactly as it was thrown.
 *
 * The cast is for the type system only. A caught value may be anything -- a
 * plain object is one of the three recognised misroute forms -- and wrapping it
 * in an `Error` to satisfy a signature would destroy the structure the router's
 * recovery reads.
 */
export function rethrow(value: unknown): never {
  throw value as Error;
}

/**
 * A promise rejected with a caught value, unchanged. Same reasoning as
 * {@link rethrow}, for the places that must return a rejection rather than
 * throw.
 */
export function rejectedWith<T>(value: unknown): Promise<T> {
  return new Promise<T>((_resolve, reject) => {
    reject(value as Error);
  });
}

/** The message of anything that was thrown, including what was not an Error. */
export function messageOf(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  return String(value);
}
