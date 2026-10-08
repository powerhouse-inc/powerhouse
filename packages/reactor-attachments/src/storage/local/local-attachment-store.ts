import type { AttachmentHash } from "@powerhousedao/reactor";
import { AttachmentNotFound, AttachmentPending } from "../../errors.js";
import type {
  IAttachmentStore,
  IAttachmentTransport,
} from "../../interfaces.js";
import type {
  AttachmentHeader,
  AttachmentMetadata,
  AttachmentResponse,
} from "../../types.js";
import { sha256Hex } from "../../replication/hash.js";
import { collectStream, streamFromBytes } from "./bytes.js";
import type {
  ILocalAttachmentBackend,
  LocalAttachmentRecord,
} from "./types.js";

function headerOf(record: LocalAttachmentRecord): AttachmentHeader {
  return {
    hash: record.hash,
    mimeType: record.mimeType,
    fileName: record.fileName,
    sizeBytes: record.sizeBytes,
    extension: record.extension,
    status: record.status,
    source: record.source,
    createdAtUtc: record.createdAtUtc,
    lastAccessedAtUtc: record.lastAccessedAtUtc,
    // A local store holds no reservations, so a committed record never carries
    // an expiry. See LocalAttachmentRecord.
    expiresAtUtc: null,
  };
}

/**
 * A realm-resident, content-addressed {@link IAttachmentStore} over a
 * {@link ILocalAttachmentBackend} -- the browser-capable half of attachment
 * byte movement (multi-reactor W3.4).
 *
 * The same class serves both backends, so an IndexedDB store in a tab and the
 * memory twin a Node test runs cannot diverge in behaviour: every semantic the
 * `IAttachmentStore` contract states is implemented once, here.
 *
 * Differences from `KyselyAttachmentStore`, all of them deliberate:
 *
 * - No reservation table, so `stat()`/`get()` never synthesize `pending` from
 *   local state. `pending` only ever arrives as a TRANSPORT answer, which
 *   `get()` raises as {@link AttachmentPending} exactly as the Kysely store
 *   does for a remote pending.
 * - `get()` reads the whole blob before it hands back a stream, so there is no
 *   such thing as an in-flight read for `evict()` to destroy. The contract's
 *   "skip hashes with active readers" clause is satisfied by construction
 *   rather than by a refcount; a caller already holding a stream holds a
 *   snapshot.
 * - `sizeBytes` is the measured length of the bytes received, not the
 *   producer's `AttachmentMetadata.sizeBytes` claim, so `storageUsed()` cannot
 *   be talked into a wrong number by a remote.
 */
export class LocalAttachmentStore implements IAttachmentStore {
  constructor(
    private readonly backend: ILocalAttachmentBackend,
    private readonly transport: IAttachmentTransport,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async stat(hash: AttachmentHash): Promise<AttachmentHeader> {
    const record = await this.backend.readRecord(hash);
    if (!record) {
      throw new AttachmentNotFound(hash);
    }
    return headerOf(record);
  }

  async has(hash: AttachmentHash): Promise<boolean> {
    const record = await this.backend.readRecord(hash);
    return record?.status === "available";
  }

  async get(
    hash: AttachmentHash,
    signal?: AbortSignal,
    documentId?: string,
  ): Promise<AttachmentResponse> {
    const record = await this.backend.readRecord(hash);
    if (!record || record.status === "evicted") {
      return this.fetchRemote(hash, signal, documentId);
    }

    const bytes = await this.backend.readBytes(hash);
    if (!bytes) {
      // A record that says `available` over a missing blob is a torn write the
      // backend contract forbids. Treat it as absent rather than serving an
      // empty body: the transport can restore it, and the next put() repairs
      // the row.
      return this.fetchRemote(hash, signal, documentId);
    }

    const accessedAt = this.now().toISOString();
    await this.backend.touch(hash, accessedAt);

    return {
      header: { ...headerOf(record), lastAccessedAtUtc: accessedAt },
      body: streamFromBytes(bytes),
    };
  }

  put(
    hash: AttachmentHash,
    metadata: AttachmentMetadata,
    data: ReadableStream<Uint8Array>,
  ): Promise<void> {
    return this.store(hash, metadata, data, "sync", false);
  }

  async evict(hash: AttachmentHash): Promise<void> {
    const record = await this.backend.readRecord(hash);
    if (!record || record.status === "evicted") {
      return;
    }
    await this.backend.evict({ ...record, status: "evicted" });
  }

  storageUsed(): Promise<number> {
    return this.backend.availableBytes();
  }

  /** Releases the backend handle. */
  close(): Promise<void> {
    return this.backend.close();
  }

  /**
   * Stores bytes this realm produced itself, as `source: "local"`.
   *
   * `put()` is the transport's entry point and marks everything `sync`, which
   * is the right provenance for a replicated blob and the wrong one for a blob
   * that originated here. The server-side store gets `source: "local"` rows
   * from its upload handles; a local store has no upload handle, so this is
   * how a producer (an editor that just hashed a file, a test that seeds a
   * peer) says the bytes are its own.
   */
  putLocal(
    hash: AttachmentHash,
    metadata: AttachmentMetadata,
    data: ReadableStream<Uint8Array>,
  ): Promise<void> {
    return this.store(hash, metadata, data, "local", false);
  }

  /**
   * `overwrite` skips the available-hash dedup check.
   *
   * Only {@link fetchRemote} sets it, and only because it is reached when the
   * local copy is unusable -- including the torn case where the record says
   * `available` over a missing blob. Without it, that record would deduplicate
   * away its own repair and the hash could never be restored.
   */
  private async store(
    hash: AttachmentHash,
    metadata: AttachmentMetadata,
    data: ReadableStream<Uint8Array>,
    source: "local" | "sync",
    overwrite: boolean,
  ): Promise<void> {
    const existing = await this.backend.readRecord(hash);
    if (!overwrite && existing?.status === "available") {
      await data.cancel();
      return;
    }

    const bytes = await collectStream(data);
    await this.backend.write(
      {
        hash,
        mimeType: metadata.mimeType,
        fileName: metadata.fileName,
        sizeBytes: bytes.byteLength,
        extension: metadata.extension ?? null,
        status: "available",
        // A restored record keeps the provenance it was first stored with.
        source: existing?.source ?? source,
        createdAtUtc: existing?.createdAtUtc ?? metadata.createdAtUtc,
        lastAccessedAtUtc: this.now().toISOString(),
      },
      bytes,
    );
  }

  /**
   * Restores `hash` from the transport on behalf of `documentId`, persists it
   * through the same write path `put` uses (so provenance follows one rule)
   * and serves the result from the store rather than from the transport's
   * stream, which has already been consumed.
   *
   * The fetched bytes are hashed and refused when they are not what was asked
   * for, mirroring {@link AttachmentReplicator}: a transport peer is another
   * reactor rather than a trusted server, and a content-addressed store that
   * accepts bytes it never verified is no longer content-addressed. A mismatch
   * is surfaced as an error and nothing is written, so a lying peer cannot
   * poison the store.
   */
  private async fetchRemote(
    hash: AttachmentHash,
    signal: AbortSignal | undefined,
    documentId: string | undefined,
  ): Promise<AttachmentResponse> {
    if (documentId === undefined) {
      // Nothing authorizes a remote fetch, so only local bytes could have
      // answered, and there are none.
      throw new AttachmentNotFound(hash);
    }

    const remote = await this.transport.fetch(hash, documentId, signal);
    if (remote.kind === "pending") {
      throw new AttachmentPending(hash, remote.expiresAtUtc);
    }
    if (remote.kind === "not-found") {
      throw new AttachmentNotFound(hash);
    }

    const fetchedBytes = await collectStream(remote.response.body);
    const actual = await sha256Hex(fetchedBytes);
    if (actual !== hash) {
      throw new Error(
        `Attachment bytes for ${hash} hashed to ${actual}; the transport served content that is not what was asked for`,
      );
    }

    await this.store(
      hash,
      remote.response.metadata,
      streamFromBytes(fetchedBytes),
      "sync",
      true,
    );

    const record = await this.backend.readRecord(hash);
    const bytes = await this.backend.readBytes(hash);
    if (!record || record.status !== "available" || !bytes) {
      // The put did not land. Reporting not-found is the only honest answer,
      // and it does not re-enter the transport: a retry is the caller's (or
      // the replicator's) decision, not a loop inside get().
      throw new AttachmentNotFound(hash);
    }
    return { header: headerOf(record), body: streamFromBytes(bytes) };
  }
}
