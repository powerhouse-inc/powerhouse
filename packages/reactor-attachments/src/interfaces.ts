import type { AttachmentHash, AttachmentRef } from "@powerhousedao/reactor";
import type {
  AttachmentHeader,
  AttachmentMetadata,
  AttachmentResponse,
  AttachmentTransportConfig,
  AttachmentUploadResult,
  Reservation,
  ReserveAttachmentOptions,
  TransportResponse,
} from "./types.js";

/**
 * Client-facing interface for uploading, querying, and retrieving attachments.
 * This is what applications (editors, Connect, CLI tools) interact with.
 */
export interface IAttachmentService {
  /**
   * Reserve a new attachment slot and return an upload handle.
   *
   * The handle abstracts the transport -- the caller streams data
   * through it without knowing whether bytes flow via HTTP, S3,
   * or any other mechanism.
   */
  reserve(options: ReserveAttachmentOptions): Promise<IAttachmentUpload>;

  /**
   * Get attachment metadata by ref.
   *
   * @throws AttachmentNotFound if the ref is unknown.
   */
  stat(ref: AttachmentRef): Promise<AttachmentHeader>;

  /**
   * Retrieve attachment data.
   *
   * Always succeeds for any known ref. The underlying store handles
   * re-fetching evicted data from the transport transparently.
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
   * @returns The content hash, ref, and header for the uploaded attachment.
   */
  send(data: ReadableStream<Uint8Array>): Promise<AttachmentUploadResult>;
}

/**
 * Reactor-facing interface for managing local attachment data.
 * The IAttachmentTransport calls put when it receives data from a remote.
 * The store notifies its configured transport when new data arrives,
 * forming a bidirectional store-transport pair.
 */
export interface IAttachmentStore {
  /**
   * Get attachment metadata without streaming body data.
   * Does NOT update lastAccessedAtUtc -- this is a metadata check,
   * not a data access.
   *
   * @throws AttachmentNotFound if the hash is unknown.
   */
  stat(hash: AttachmentHash): Promise<AttachmentHeader>;

  /**
   * Check whether attachment data is available locally.
   * Returns true if the bytes can be served from this reactor's store
   * without a transport round-trip. Does not trigger a remote fetch.
   */
  has(hash: AttachmentHash): Promise<boolean>;

  /**
   * Retrieve attachment header and data stream by hash.
   * Updates lastAccessedAtUtc on access.
   *
   * If the data has been evicted, re-fetches it from the transport,
   * restores it locally via put(), and returns the data. This makes
   * eviction transparent to callers -- get() always succeeds for
   * any known hash.
   *
   * @throws AttachmentNotFound if the hash is unknown (no metadata
   *         record exists).
   */
  get(hash: AttachmentHash, signal?: AbortSignal): Promise<AttachmentResponse>;

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
   * The transport resolves the hash to a data source (server endpoint,
   * S3 presigned URL, etc.) and returns a stream.
   *
   * @param hash - Content hash of the attachment
   * @param signal - Abort signal for cancellation
   * @returns The attachment data with metadata, or null if not available.
   *          Returns TransportResponse (not AttachmentResponse) because
   *          remote peers cannot populate local concerns like status/source.
   */
  fetch(
    hash: AttachmentHash,
    signal?: AbortSignal,
  ): Promise<TransportResponse | null>;

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
}

/**
 * Factory for creating transport-specific upload handles.
 * The service calls this during reserve() to create a handle
 * that knows how to stream bytes to the appropriate backend.
 */
export interface IAttachmentUploadFactory {
  createUpload(
    reservationId: string,
    options: ReserveAttachmentOptions,
  ): IAttachmentUpload;
}
