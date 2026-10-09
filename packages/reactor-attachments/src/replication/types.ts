import type { AttachmentHash, AttachmentRef } from "@powerhousedao/reactor";
import type { OperationWithContext } from "@powerhousedao/shared/document-model";

/**
 * Pulls the attachment refs an operation carries.
 *
 * The replicator depends on this rather than on the schema compiler directly
 * so a host that has no compiled document models (a test, a reactor whose
 * models declare no `AttachmentRef` field but carry refs by another
 * convention) can still feed it. The production implementation is
 * `SchemaCompiledOperationRefs`, which is the same compiler + registry pair
 * `AttachmentReferenceReadModel` uses, so the refs the replicator chases and
 * the refs the reference index records are extracted by one piece of code.
 */
export interface IOperationAttachmentRefs {
  refsOf(item: OperationWithContext): readonly AttachmentRef[];
}

/**
 * What the replicator is doing about one hash.
 *
 * - `queued`: known missing locally, waiting for a concurrency slot.
 * - `fetching`: a transport fetch is in flight.
 * - `held`: the bytes are in the local store. Terminal and the goal; a held
 *   hash leaves the report.
 * - `waiting`: the last answer was an unexpired `pending`, a bounded
 *   `not-found` (see {@link AttachmentRetryPolicy.notFoundAttempts}), or a
 *   transport error; a retry is scheduled.
 * - `not-found`: the `not-found` budget is spent (an expired `pending` counts
 *   as a `not-found`), no document is left unasked and no `pending` is live.
 * - `failed`: the transport kept erroring and no document is left unasked.
 *
 * Both terminal states wait for `retry()`, or for a document not yet seen to
 * reference the hash, which earns one more attempt through that document.
 */
export type AttachmentReplicationState =
  | "queued"
  | "fetching"
  | "held"
  | "waiting"
  | "not-found"
  | "failed";

/**
 * Retry shape for the three answers a fetch can give, honouring the
 * `pending | not-found | data` triad that
 * {@link IAttachmentTransport.fetch} exists to express.
 *
 * `notFoundAttempts` is the reference-index race budget and the reason
 * `not-found` is retried at all: a peer authorizes a byte fetch through its
 * OWN attachment reference index, and that index lags that peer's sync. So the
 * first `not-found` for a freshly synced ref is far more likely to mean "that
 * peer has not indexed this operation yet" than "these bytes do not exist".
 * Retrying it a bounded number of times covers the lag without turning a
 * genuinely missing hash into an unbounded loop -- and the counts keep both
 * outcomes visible rather than papering over either.
 */
export type AttachmentRetryPolicy = {
  /** Fallback wait when a `pending` answer carries no `retryAfterMs`. */
  pendingRetryMs: number;
  /** Shortest wait honoured after a `pending`, whatever it asks for. */
  minPendingRetryMs: number;
  /** Cap for a run of `pending` answers, whose wait doubles per answer. */
  maxPendingRetryMs: number;
  /** `not-found` answers absorbed as index lag; cumulative until `retry()`. */
  notFoundAttempts: number;
  /** Base wait between `not-found` retries; doubles per attempt. */
  notFoundRetryMs: number;
  /** Transport errors in a row before giving up; any answer ends the run. */
  errorAttempts: number;
  /** Base wait between error retries; doubles per attempt. */
  errorRetryMs: number;
  /** Cap for not-found and error waits. */
  maxRetryMs: number;
};

export const DEFAULT_ATTACHMENT_RETRY_POLICY: AttachmentRetryPolicy = {
  pendingRetryMs: 5_000,
  minPendingRetryMs: 250,
  maxPendingRetryMs: 300_000,
  notFoundAttempts: 3,
  notFoundRetryMs: 2_000,
  errorAttempts: 5,
  errorRetryMs: 1_000,
  maxRetryMs: 300_000,
};

/** Default bounded concurrency for in-flight attachment fetches. */
export const DEFAULT_ATTACHMENT_REPLICATION_CONCURRENCY = 3;

/** Default number of held hashes a replicator remembers after dropping their entries. */
export const DEFAULT_ATTACHMENT_HELD_HASH_LIMIT = 10_000;

/** Default page size for the boot re-scan over the reference backlog. */
export const DEFAULT_ATTACHMENT_BACKLOG_PAGE_SIZE = 200;

/**
 * The replicator's observable state: what it has seen, what it holds, and what
 * it is still arguing about.
 *
 * Reported rather than inferred, because the two honest failure modes --
 * a peer that never had the bytes, and a peer whose reference index has not
 * caught up -- are indistinguishable from the outside at the moment they
 * happen and only separable over time. `notFound` and `waiting` are both
 * surfaced so an operator sees which one a reactor is in.
 */
export type AttachmentReplicatorStatus = {
  /** Whether the replicator is subscribed and scheduling. */
  running: boolean;
  /** Distinct hashes tracked: every entry plus the remembered held hashes. */
  refsSeen: number;
  /** Remembered held hashes, at most `heldHashLimit`. */
  held: number;
  /** `storageUsed()` of the local store, in bytes. */
  bytesHeld: number;
  /** Hashes waiting for a concurrency slot. */
  queued: number;
  /** Hashes with a fetch in flight. */
  fetching: number;
  /** Hashes with a retry scheduled (pending, lagging index, or error). */
  waiting: number;
  /** Hashes the peer answered `not-found` for, past the lag budget. */
  notFound: number;
  /** Hashes whose transport kept erroring. */
  failed: number;
  /** Whether the boot re-scan over the reference backlog has completed. */
  backlogScanned: boolean;
  /** The most recent transport error message, for the inspector. */
  lastError: string | undefined;
};

/** One hash's replication record, as reported for diagnostics. */
export type AttachmentReplicationEntry = {
  hash: AttachmentHash;
  state: AttachmentReplicationState;
  /** Documents whose operations referenced the hash; any of them may authorize. */
  documentIds: readonly string[];
  attempts: number;
  notFoundAnswers: number;
  /** Epoch ms of the next scheduled attempt, when one is scheduled. */
  nextAttemptAtMs: number | undefined;
  lastError: string | undefined;
};
