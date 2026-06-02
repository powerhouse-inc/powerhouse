import type { AttachmentHash, AttachmentRef } from "@powerhousedao/reactor";
import type {
  AttachmentHeader,
  AttachmentMetadata,
  AttachmentResponse,
  AttachmentTransportConfig,
  AttachmentUploadResult,
  Reservation,
  ReserveAttachmentOptions,
  TransportFetchResult,
} from "./types.js";

/**
 * Client-facing interface for uploading, querying, and retrieving attachments.
 * This is what applications (editors, Connect, CLI tools) interact with.
 */
export interface IAttachmentService {
  /**
   * Reserve a new attachment slot and return an upload handle.
   *
   * When options.clientHash is provided (hash-first mode):
   * - @throws AttachmentAlreadyExists if data for that hash is currently
   *   available. The error carries the canonical ref; the caller uses it
   *   directly and uploads nothing (dedup fast path).
   * - If the hash is evicted, the reservation is created: the client holds
   *   the bytes and the upload restores them.
   * - If the hash is pending (another in-flight reservation), the
   *   reservation is created: concurrent reservations are deliberately
   *   permitted (see design doc -- no uniqueness race).
   * - The returned handle's ref field is set immediately to the computed ref.
   *
   * When options.clientHash is absent (legacy mode):
   * - No pre-check against the store.
   * - The returned handle's ref field is null until send() completes.
   */
  reserve(options: ReserveAttachmentOptions): Promise<IAttachmentUpload>;

  /**
   * Get attachment metadata by ref.
   *
   * @throws AttachmentNotFound if the ref is unknown.
   * Returns an AttachmentHeader with status='pending' and expiresAtUtc set if
   * the hash has an active reservation but no committed bytes. Callers must
   * check header.status to distinguish pending from available.
   */
  stat(ref: AttachmentRef): Promise<AttachmentHeader>;

  /**
   * Retrieve attachment data.
   *
   * Always succeeds for any known, available ref. The underlying store
   * handles re-fetching evicted data from the transport transparently.
   *
   * @throws AttachmentPending if the hash is reserved but bytes not yet
   *         available. There is no store-level wait; polling across the
   *         pending window is the caller's loop, bounded by the error's
   *         expiresAtUtc. A wait inside get() would hold request handlers
   *         open across multi-second windows and hide retry policy where
   *         callers cannot tune it.
   */
  get(ref: AttachmentRef, signal?: AbortSignal): Promise<AttachmentResponse>;
}

/**
 * Upload handle returned by reserve(). Encapsulates all transport-specific
 * concerns (URLs, credentials, streaming protocols) behind a single send() method.
 */
export interface IAttachmentUpload {
  /**
   * Unique identifier for this reservation.
   */
  reservationId: string;

  /**
   * The ref this upload will produce. Set immediately when the
   * reservation carries a client hash (hash-first mode); null in the
   * legacy flow, where the ref is only known after send() completes.
   */
  ref: AttachmentRef | null;

  /**
   * Reservation TTL contract, from the server in remote mode.
   * ISO 8601 UTC string indicating when the reservation expires.
   * Clients use this to bound retry windows and populate the pending-upload queue.
   */
  readonly expiresAtUtc: string;

  /**
   * Stream attachment data through this handle.
   *
   * The handle manages the full upload lifecycle internally:
   * writing bytes to the backing store, computing or verifying
   * the content hash, creating the attachment record, and
   * cleaning up the reservation.
   *
   * Dedup: if an attachment with the same content hash already
   * exists, send() returns the existing ref. Content-addressed
   * storage means identical uploads converge on the same hash.
   *
   * When the reservation carries a client hash, the handle verifies
   * the received bytes against the claims:
   * - @throws SizeMismatch if the byte count differs from the declared
   *   sizeBytes. The handle may reject mid-stream as soon as the count
   *   exceeds the declaration, without consuming the rest.
   * - @throws HashMismatch if the server-computed hash differs from the
   *   claimed hash. Nothing is committed; the reservation is retained
   *   so the client can retry with the correct bytes.
   *
   * @returns The content hash, ref, and header for the uploaded attachment.
   */
  send(data: ReadableStream<Uint8Array>): Promise<AttachmentUploadResult>;
}

/**
 * Read-only subset of IAttachmentStore.
 *
 * Adapters that cannot safely support the local-only write/GC surface
 * (remote stores, forwarding caches) implement this narrow interface
 * instead of stub-rejecting unsupported methods. Consumers that only
 * need to query metadata or stream attachment bytes can take this type
 * to make their dependency requirements explicit.
 */
export interface IAttachmentReader {
  /**
   * Get attachment metadata without streaming body data.
   * Does NOT update lastAccessedAtUtc -- this is a metadata check,
   * not a data access.
   *
   * @throws AttachmentNotFound if the hash is unknown.
   * Returns an AttachmentHeader with status='pending' and expiresAtUtc set if
   * the hash has an active reservation but no committed bytes. Callers must
   * check header.status to distinguish pending from available.
   */
  stat(hash: AttachmentHash): Promise<AttachmentHeader>;

  /**
   * Retrieve attachment header and data stream by hash.
   * Updates lastAccessedAtUtc on access.
   *
   * If the data has been evicted, re-fetches it from the transport,
   * restores it locally via put(), and returns the data. This makes
   * eviction transparent to callers -- get() always succeeds for
   * any known, available hash.
   *
   * @throws AttachmentNotFound if the hash is unknown (no metadata
   *         record exists and no pending reservation).
   * @throws AttachmentPending if the hash is reserved by an in-flight
   *         upload; bytes are not yet available. There is no store-level
   *         wait -- polling is the caller's responsibility.
   */
  get(hash: AttachmentHash, signal?: AbortSignal): Promise<AttachmentResponse>;
}

/**
 * Reactor-facing interface for managing local attachment data.
 * The IAttachmentTransport calls put when it receives data from a remote.
 * The store notifies its configured transport when new data arrives,
 * forming a bidirectional store-transport pair.
 */
export interface IAttachmentStore extends IAttachmentReader {
  /**
   * Check whether attachment data is available locally.
   * Returns true if the bytes can be served from this reactor's store
   * without a transport round-trip. Does not trigger a remote fetch.
   * Returns false for pending and evicted hashes.
   */
  has(hash: AttachmentHash): Promise<boolean>;

  /**
   * Store attachment data received from a remote (during sync or re-fetch).
   * Called by IAttachmentTransport implementations during sync, and
   * internally by get() when restoring evicted data.
   *
   * Behavior depends on existing state:
   * - No existing row: INSERT with source='sync', status='available'.
   * - Existing row with status='evicted': restore data, set status
   *   to 'available'.
   * - Existing row with status='available': no-op (dedup).
   */
  put(
    hash: AttachmentHash,
    metadata: AttachmentMetadata,
    data: ReadableStream<Uint8Array>,
  ): Promise<void>;

  /**
   * Evict attachment data to reclaim storage.
   *
   * Removes the local bytes and sets status to 'evicted'. The
   * metadata record is retained so the hash is still known. If the
   * data is needed again, the service fetches it via the transport.
   *
   * Eviction must not destroy data while a get() stream is in
   * flight. Implementations must skip hashes with active readers
   * (e.g. via a refcount or lease) and revisit them on the next
   * GC pass.
   *
   * On immutable backends, this unpins/stops serving rather
   * than deleting.
   */
  evict(hash: AttachmentHash): Promise<void>;

  /**
   * Get the total storage used by locally available attachment data.
   * Used by the GC policy to decide when to evict.
   */
  storageUsed(): Promise<number>;
}

/**
 * Transport for moving attachment data between reactors.
 *
 * Forms a bidirectional pair with IAttachmentStore. The store calls
 * announce/push when new data arrives locally. The transport calls
 * store.put() when data arrives from a remote.
 */
export interface IAttachmentTransport {
  /**
   * Fetch attachment data by hash from a remote source.
   *
   * Returns a three-way discriminated union so callers can distinguish
   * "data available", "upload in flight -- retry after expiry", and
   * "not found -- possibly permanently". Conflating the last two would
   * cause callers to apply long backoff to transient pending state,
   * or to retry indefinitely on a permanently missing hash.
   *
   * @param hash - Content hash of the attachment
   * @param signal - Abort signal for cancellation
   */
  fetch(
    hash: AttachmentHash,
    signal?: AbortSignal,
  ): Promise<TransportFetchResult>;

  /**
   * Announce that this reactor has attachment data available.
   *
   * For server-centric transports, this may be a no-op (the server
   * already has the data after upload).
   */
  announce(hash: AttachmentHash): Promise<void>;

  /**
   * Push attachment data to a specific remote.
   *
   * Used for eager replication strategies where the source reactor
   * pushes data to known peers rather than waiting for pull requests.
   *
   * @param hash - Content hash of the attachment
   * @param remote - Target remote identifier
   * @param data - The attachment data stream
   */
  push(
    hash: AttachmentHash,
    remote: string,
    data: ReadableStream<Uint8Array>,
  ): Promise<void>;
}

/**
 * Factory for creating attachment transport instances.
 * Mirrors IChannelFactory for operation sync.
 */
export interface IAttachmentTransportFactory {
  instance(config: AttachmentTransportConfig): IAttachmentTransport;
}

/**
 * Store for managing attachment reservations.
 * Reservations are transient records tracking in-progress uploads.
 */
export interface IReservationStore {
  create(options: ReserveAttachmentOptions): Promise<Reservation>;
  get(reservationId: string): Promise<Reservation>;
  delete(reservationId: string): Promise<void>;

  /**
   * Delete reservations whose expires_at_utc is at or before `now`.
   * Returns the number of rows deleted.
   *
   * Reservations are not auto-swept; consumers should call this on a
   * cron / interval to clean up rows left behind by aborted uploads.
   */
  deleteExpired(now?: Date): Promise<number>;
}

/**
 * Factory for creating transport-specific upload handles.
 * The service calls this during reserve() to create a handle
 * that knows how to stream bytes to the appropriate backend.
 */
export interface IAttachmentUploadFactory {
  createUpload(reservation: Reservation): IAttachmentUpload;
}
