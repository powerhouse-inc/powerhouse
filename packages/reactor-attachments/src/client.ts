import type { AttachmentHash, AttachmentRef } from "@powerhousedao/reactor";
import {
  runWithConcurrency,
  type BatchItemResult,
  type RunWithConcurrencyOptions,
} from "./concurrency.js";
import { AttachmentAlreadyExists } from "./errors.js";
export type { AttachmentTransferStage } from "./errors.js";
export {
  runWithConcurrency,
  type BatchItemResult,
  type RunWithConcurrencyOptions,
} from "./concurrency.js";
import type { IAttachmentService, IAttachmentUpload } from "./interfaces.js";
import {
  ProgressEmitter,
  withByteProgress,
  type AttachmentProgress,
  type AttachmentProgressOptions,
} from "./progress.js";
import { createRef } from "./ref.js";
import type {
  AttachmentHeader,
  AttachmentResponse,
  AttachmentSendOptions,
  AttachmentUploadResult,
  HashFirstReserveAttachmentOptions,
} from "./types.js";

export { AttachmentService } from "./attachment-service.js";
export {
  AttachmentAlreadyExists,
  AttachmentNotFound,
  AttachmentPending,
  AttachmentTransferError,
  HashMismatch,
  InvalidAttachmentRef,
  ReservationNotFound,
  SizeMismatch,
  UploadTooLarge,
} from "./errors.js";
export type {
  IAttachmentReader,
  IAttachmentService,
  IAttachmentStore,
  IAttachmentTransport,
  IAttachmentTransportFactory,
  IAttachmentUpload,
  IAttachmentUploadFactory,
  IReservationStore,
} from "./interfaces.js";
export { parseRef, createRef } from "./ref.js";
export type { ParsedRef } from "./ref.js";
export type {
  AttachmentDownloadOptions,
  AttachmentDownloadTarget,
  AttachmentDownloadTargetOptions,
  AttachmentHeader,
  AttachmentMetadata,
  AttachmentResponse,
  AttachmentSendOptions,
  AttachmentStatus,
  AttachmentTransportConfig,
  AttachmentUploadResult,
  AttachmentTargetHeaders,
  AttachmentUploadTarget,
  HashFirstReserveAttachmentOptions,
  UploadFirstReserveAttachmentOptions,
  Reservation,
  ReserveAttachmentOptions,
  TransportFetchResult,
  TransportResponse,
} from "./types.js";
export {
  parseAttachmentDownloadTarget,
  parseAttachmentUploadTarget,
} from "./targets.js";
export {
  SwitchboardAttachmentTransport,
  type SwitchboardTransportConfig,
  RemoteReservationStore,
  type SwitchboardClientConfig,
  RemoteAttachmentUpload,
  RemoteAttachmentUploadFactory,
  RemoteAttachmentStore,
  createRemoteAttachmentService,
  createFetchUploadTransport,
  createXhrUploadTransport,
  type AttachmentUploadRequest,
  type AttachmentUploadResponse,
  type AttachmentUploadTransport,
  type XhrUploadTransportOptions,
} from "./switchboard/index.js";
export { NullAttachmentTransport } from "./null-attachment-transport.js";
export {
  DEFAULT_PROGRESS_THROTTLE_MS,
  progressFraction,
  ProgressEmitter,
  withByteProgress,
  type AttachmentProgress,
  type AttachmentProgressListener,
  type AttachmentProgressOptions,
  type AttachmentStage,
  type ByteProgressHooks,
  type ProgressEmitterOptions,
} from "./progress.js";

export type PreprocessResult = {
  ref: AttachmentRef;
  hash: AttachmentHash;
  sizeBytes: number;
  options: HashFirstReserveAttachmentOptions;
  data: ReadableStream<Uint8Array>;
  stream: () => ReadableStream<Uint8Array>;
};

export type AttachmentUploadInput = {
  file: Blob;
  fileName?: string;
  mimeType?: string;
  /** Per-item cancellation, checked between stages. */
  signal?: AbortSignal;
};

/**
 * Upload bytes that were already hashed by a separate `preprocess()` call.
 *
 * This is the canonical two-call flow: the ref must reach the document before
 * the bytes are committed, so callers preprocess, dispatch the operation, then
 * upload. Passing the result back in skips the hashing stage rather than
 * faking a zero-millisecond one.
 */
export type AttachmentPreprocessedUploadInput = {
  preprocessed: PreprocessResult;
  signal?: AbortSignal;
};

/**
 * Every remote download names the document that authorizes its ref; batches
 * may freely mix documents because the anchor travels with each item.
 */
export type AttachmentDownloadInput = {
  documentId: string;
  ref: AttachmentRef;
  signal?: AbortSignal;
};

/**
 * The document keeps its own name and type for an attachment (the same
 * bytes may appear under different names in different documents), so the
 * blob-producing conveniences let callers override what the server header
 * reports from upload time.
 */
export type AttachmentBlobOptions = {
  mimeType?: string;
};

export type AttachmentSaveOptions = {
  fileName?: string;
  mimeType?: string;
};

export type AttachmentBlobResult = {
  blob: Blob;
  header: AttachmentHeader;
};

export type AttachmentObjectUrl = {
  /** Ready for img/iframe/video src. Pins memory until revoke() is called. */
  url: string;
  header: AttachmentHeader;
  revoke: () => void;
};

export type AttachmentShareLinkInput = {
  documentId: string;
  ref: AttachmentRef;
  /** Requested link lifetime in seconds; the server clamps to its maximum. */
  expiresIn?: number;
  signal?: AbortSignal;
};

/**
 * A self-contained public URL: anyone holding it can fetch the bytes until
 * expiresAtUtc, with no login and no document access. Minting one requires
 * document read access; once minted it cannot be revoked before expiry.
 */
export type AttachmentShareLink = {
  url: string;
  expiresAtUtc: string;
};

/**
 * Batch progress is per item, carrying the item's `index`. There is
 * deliberately no batch-wide byte total: weighting items against each other is
 * a presentation decision the client cannot make, and a confirmed dedup would
 * shrink the denominator mid-flight.
 */
export type AttachmentBatchOptions = {
  /** Bounds preprocessing and transfer together. Defaults to 4. */
  concurrency?: number;
  /** Whole-batch cancellation: stops unstarted items. */
  signal?: AbortSignal;
  onProgress?: (progress: AttachmentProgress & { index: number }) => void;
  /**
   * Fired as each item settles, including items the signal skipped before they
   * started, so `settled` always reaches `total`.
   */
  onItemSettled?: (counts: AttachmentBatchCounts) => void;
  /** Min ms between byte events, applied per item rather than batch-wide. */
  throttleMs?: number;
};

export type AttachmentBatchCounts = {
  settled: number;
  completed: number;
  failed: number;
  total: number;
};

export const DEFAULT_ATTACHMENT_BATCH_CONCURRENCY = 4;

export interface IAttachmentClient {
  preprocess(
    file: Blob,
    opts?: { fileName?: string; mimeType?: string },
  ): Promise<PreprocessResult>;
  reserve(
    options: HashFirstReserveAttachmentOptions,
    send: (handle: IAttachmentUpload) => Promise<AttachmentUploadResult>,
  ): Promise<AttachmentUploadResult>;
  /**
   * Hash, reserve, and transfer one file; a confirmed dedup skips the transfer
   * and reports a terminal `done` carrying `deduped: true` and zero bytes.
   *
   * Also accepts an already-preprocessed payload, so the canonical
   * preprocess -> dispatch -> upload flow reports progress too.
   */
  upload(
    input: AttachmentUploadInput | AttachmentPreprocessedUploadInput,
    options?: AttachmentProgressOptions,
  ): Promise<AttachmentUploadResult>;
  /**
   * Document-authorized download of one ref.
   *
   * Resolves as soon as the byte stream is available, with `downloading` as
   * the last event emitted and `loaded: 0`. Byte events and the terminal
   * `done` arrive as the caller reads the stream — and never arrive at all if
   * the caller abandons it.
   */
  download(
    input: AttachmentDownloadInput,
    options?: AttachmentProgressOptions,
  ): Promise<AttachmentResponse>;
  /**
   * Document-authorized download materialized as a typed Blob. The Blob's
   * type comes from the server header unless overridden — that's what makes
   * browsers render PDFs inline and images correctly.
   */
  downloadBlob(
    input: AttachmentDownloadInput,
    options?: AttachmentBlobOptions & AttachmentProgressOptions,
  ): Promise<AttachmentBlobResult>;
  /**
   * Download and hand the bytes to the browser's save-file flow. Browser
   * only. fileName defaults to the server header's; pass the document's own
   * name for per-document naming.
   */
  saveAttachment(
    input: AttachmentDownloadInput,
    options?: AttachmentSaveOptions & AttachmentProgressOptions,
  ): Promise<void>;
  /**
   * Download and expose the bytes as an object URL for inline rendering
   * (img/iframe/video src). Callers MUST call revoke() when done — the URL
   * pins the blob in memory until then.
   */
  downloadObjectUrl(
    input: AttachmentDownloadInput,
    options?: AttachmentBlobOptions & AttachmentProgressOptions,
  ): Promise<AttachmentObjectUrl>;
  /**
   * Mint a public share link: a presigned URL anyone can fetch until it
   * expires, with no login. Authorized exactly like a download (document
   * read access + the reference index). Requires a presigned-capable
   * storage backend (S3); rejects when the server answers with an
   * authenticated switchboard target, which would not be public.
   */
  getShareLink(input: AttachmentShareLinkInput): Promise<AttachmentShareLink>;
  uploadMany(
    inputs: readonly AttachmentUploadInput[],
    options?: AttachmentBatchOptions,
  ): Promise<BatchItemResult<AttachmentUploadResult>[]>;
  downloadMany(
    inputs: readonly AttachmentDownloadInput[],
    options?: AttachmentBatchOptions,
  ): Promise<BatchItemResult<AttachmentResponse>[]>;
}

/**
 * Duck-typed dedup detection: bundlers (notably Vite dev pre-bundling) can
 * load two copies of this package's error classes, one for the service and
 * one for the client wrapper, making a plain instanceof check miss the
 * cross-copy throw. Name plus payload shape identifies the error reliably.
 */
function isAttachmentAlreadyExists(
  err: unknown,
): err is AttachmentAlreadyExists {
  if (err instanceof AttachmentAlreadyExists) return true;
  return (
    err instanceof Error &&
    err.name === "AttachmentAlreadyExists" &&
    typeof (err as { hash?: unknown }).hash === "string" &&
    typeof (err as { ref?: unknown }).ref === "string"
  );
}

function streamFromBuffer(buf: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(buf);
      controller.close();
    },
  });
}

/** Stamps an item's index onto its progress events. */
function itemProgress(
  options: AttachmentBatchOptions | undefined,
  index: number,
): AttachmentProgressOptions | undefined {
  if (!options?.onProgress && options?.throttleMs === undefined) {
    return undefined;
  }
  return {
    ...(options.onProgress
      ? {
          onProgress: (progress: AttachmentProgress) =>
            options.onProgress?.({ ...progress, index }),
        }
      : {}),
    ...(options.throttleMs !== undefined
      ? { throttleMs: options.throttleMs }
      : {}),
  };
}

function batchRunOptions<R>(
  total: number,
  options: AttachmentBatchOptions | undefined,
): RunWithConcurrencyOptions<R> {
  const onItemSettled = options?.onItemSettled;
  let settled = 0;
  let completed = 0;
  let failed = 0;
  return {
    concurrency: options?.concurrency ?? DEFAULT_ATTACHMENT_BATCH_CONCURRENCY,
    ...(options?.signal ? { signal: options.signal } : {}),
    ...(onItemSettled
      ? {
          onSettled: (result: BatchItemResult<R>) => {
            settled += 1;
            if (result.status === "fulfilled") completed += 1;
            else failed += 1;
            onItemSettled({ settled, completed, failed, total });
          },
        }
      : {}),
  };
}

class AttachmentClientImpl implements IAttachmentClient {
  constructor(private readonly service: IAttachmentService) {}

  async preprocess(
    file: Blob,
    opts?: { fileName?: string; mimeType?: string },
  ): Promise<PreprocessResult> {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    const hash = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("") as AttachmentHash;
    const ref = createRef(hash);
    const sizeBytes = file.size;
    const mimeType = opts?.mimeType ?? file.type;
    const fileName =
      opts?.fileName ?? (file instanceof File ? file.name : "attachment");
    const options: HashFirstReserveAttachmentOptions = {
      mimeType,
      fileName,
      clientHash: hash,
      sizeBytes,
    };
    const data = streamFromBuffer(bytes);
    const stream = (): ReadableStream<Uint8Array> => streamFromBuffer(bytes);
    return { ref, hash, sizeBytes, options, data, stream };
  }

  /**
   * Reserve, distinguishing a confirmed dedup from a live upload handle in the
   * type rather than with a flag: the two outcomes move a different number of
   * bytes, and every caller has to account for that.
   */
  private async reserveOrDedup(
    options: HashFirstReserveAttachmentOptions,
  ): Promise<
    | { kind: "handle"; handle: IAttachmentUpload }
    | { kind: "deduped"; result: AttachmentUploadResult }
  > {
    try {
      return { kind: "handle", handle: await this.service.reserve(options) };
    } catch (err) {
      if (!isAttachmentAlreadyExists(err)) throw err;
      const header = await this.service.stat(err.ref);
      return {
        kind: "deduped",
        result: { hash: err.hash, ref: err.ref, header },
      };
    }
  }

  async reserve(
    options: HashFirstReserveAttachmentOptions,
    send: (handle: IAttachmentUpload) => Promise<AttachmentUploadResult>,
  ): Promise<AttachmentUploadResult> {
    const outcome = await this.reserveOrDedup(options);
    if (outcome.kind === "deduped") return outcome.result;
    return send(outcome.handle);
  }

  async upload(
    input: AttachmentUploadInput | AttachmentPreprocessedUploadInput,
    options?: AttachmentProgressOptions,
  ): Promise<AttachmentUploadResult> {
    const emitter = new ProgressEmitter(options);
    const signal = input.signal;
    try {
      signal?.throwIfAborted();

      let preprocessed: PreprocessResult;
      if ("preprocessed" in input) {
        preprocessed = input.preprocessed;
      } else {
        // Hashing is genuinely unobservable: preprocess() runs one
        // crypto.subtle.digest over the whole buffer and WebCrypto has no
        // streaming digest. The stage is still reported, with a denominator
        // and indeterminate never cleared, so a UI can name what it waits on.
        emitter.stage("hashing", { total: input.file.size });
        preprocessed = await this.preprocess(input.file, {
          ...(input.fileName !== undefined ? { fileName: input.fileName } : {}),
          ...(input.mimeType !== undefined ? { mimeType: input.mimeType } : {}),
        });
      }
      const sizeBytes = preprocessed.sizeBytes;

      signal?.throwIfAborted();
      emitter.stage("reserving");
      const outcome = await this.reserveOrDedup(preprocessed.options);

      // A confirmed dedup never enters `uploading` — the server already holds
      // these bytes, so none are sent. Reporting zero of zero keeps the byte
      // model honest instead of stalling at 0 and then jumping to done.
      if (outcome.kind === "deduped") {
        emitter.finishDeduped();
        return outcome.result;
      }

      signal?.throwIfAborted();
      emitter.stage("uploading", { total: sizeBytes });
      // `onProgress` only when someone is listening. The XHR transport keys
      // its `upload.onprogress` registration off the option being present, and
      // that registration alone forces a CORS preflight on a presigned PUT —
      // a cost an unwatched upload must not pay for a callback that would
      // discard every event anyway.
      const sendOptions: AttachmentSendOptions = {
        ...(emitter.active
          ? {
              onProgress: (loaded: number, total?: number) =>
                emitter.bytes(loaded, total ?? sizeBytes),
            }
          : {}),
        ...(signal ? { signal } : {}),
      };
      const result = await outcome.handle.send(
        preprocessed.stream(),
        sendOptions,
      );
      emitter.finish();
      return result;
    } catch (err) {
      emitter.fail();
      throw err;
    }
  }

  /**
   * The single site where download bytes are instrumented.
   *
   * It sits here, above the service, rather than in any store or transport:
   * one logical get can be several byte streams underneath (an evicted
   * attachment is fetched from the transport, written to disk, then re-read),
   * so counting lower down would double-count that path and still miss
   * local-filesystem reads. Wrapping what `service.get` returns covers the
   * presigned, switchboard, legacy and local paths by construction, and
   * `downloadBlob`/`saveAttachment`/`downloadObjectUrl` inherit it.
   */
  private async getWithProgress(
    input: AttachmentDownloadInput,
    emitter: ProgressEmitter,
  ): Promise<AttachmentResponse> {
    const { header, body } = await this.service.get(input.ref, {
      documentId: input.documentId,
      signal: input.signal,
    });
    emitter.stage("downloading", { total: header.sizeBytes });
    if (!emitter.active) return { header, body };
    return {
      header,
      body: withByteProgress(body, {
        onBytes: (loaded) => emitter.bytes(loaded),
        onDone: () => emitter.finish(),
        onError: () => emitter.fail(),
      }),
    };
  }

  async download(
    input: AttachmentDownloadInput,
    options?: AttachmentProgressOptions,
  ): Promise<AttachmentResponse> {
    const emitter = new ProgressEmitter(options);
    try {
      input.signal?.throwIfAborted();
      emitter.stage("requesting-download-target");
      return await this.getWithProgress(input, emitter);
    } catch (err) {
      emitter.fail();
      throw err;
    }
  }

  async downloadBlob(
    input: AttachmentDownloadInput,
    options?: AttachmentBlobOptions & AttachmentProgressOptions,
  ): Promise<AttachmentBlobResult> {
    const emitter = new ProgressEmitter(options);
    try {
      input.signal?.throwIfAborted();
      emitter.stage("requesting-download-target");
      const { header, body } = await this.getWithProgress(input, emitter);
      const reader = body.getReader();
      const chunks: BlobPart[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value as BlobPart);
      }
      const blob = new Blob(chunks, {
        type: options?.mimeType ?? header.mimeType,
      });
      // Draining the stream already finished the emitter; latching makes this
      // a no-op there, and a guarantee for any body that closes without one.
      emitter.finish();
      return { blob, header };
    } catch (err) {
      emitter.fail();
      throw err;
    }
  }

  async saveAttachment(
    input: AttachmentDownloadInput,
    options?: AttachmentSaveOptions & AttachmentProgressOptions,
  ): Promise<void> {
    if (typeof document === "undefined") {
      throw new Error(
        "saveAttachment requires a browser environment; use downloadBlob elsewhere",
      );
    }
    const { blob, header } = await this.downloadBlob(input, options);
    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = options?.fileName ?? header.fileName;
      anchor.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async downloadObjectUrl(
    input: AttachmentDownloadInput,
    options?: AttachmentBlobOptions & AttachmentProgressOptions,
  ): Promise<AttachmentObjectUrl> {
    const { blob, header } = await this.downloadBlob(input, options);
    const url = URL.createObjectURL(blob);
    let revoked = false;
    return {
      url,
      header,
      revoke: () => {
        if (revoked) return;
        revoked = true;
        URL.revokeObjectURL(url);
      },
    };
  }

  async getShareLink(
    input: AttachmentShareLinkInput,
  ): Promise<AttachmentShareLink> {
    input.signal?.throwIfAborted();
    const target = await this.service.getDownloadTarget(input.ref, {
      documentId: input.documentId,
      ...(input.expiresIn !== undefined ? { expiresIn: input.expiresIn } : {}),
      ...(input.signal !== undefined ? { signal: input.signal } : {}),
    });
    if (target.kind !== "presigned-get") {
      throw new Error(
        "Public share links require a presigned-capable storage backend (S3); this server answered with an authenticated target",
      );
    }
    return { url: target.url, expiresAtUtc: target.expiresAtUtc };
  }

  uploadMany(
    inputs: readonly AttachmentUploadInput[],
    options?: AttachmentBatchOptions,
  ): Promise<BatchItemResult<AttachmentUploadResult>[]> {
    return runWithConcurrency(
      inputs,
      (input, index) => this.upload(input, itemProgress(options, index)),
      batchRunOptions(inputs.length, options),
    );
  }

  /**
   * `concurrency` bounds download-target negotiation, not simultaneous byte
   * transfer: each item resolves when its stream is handed over, and the bytes
   * move only as the caller reads. Byte progress makes that pre-existing
   * behavior visible; it does not change it.
   */
  downloadMany(
    inputs: readonly AttachmentDownloadInput[],
    options?: AttachmentBatchOptions,
  ): Promise<BatchItemResult<AttachmentResponse>[]> {
    return runWithConcurrency(
      inputs,
      (input, index) => this.download(input, itemProgress(options, index)),
      batchRunOptions(inputs.length, options),
    );
  }
}

export function createAttachmentClient(
  service: IAttachmentService,
): IAttachmentClient {
  return new AttachmentClientImpl(service);
}
