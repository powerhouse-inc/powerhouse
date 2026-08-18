import type { AttachmentHash, AttachmentRef } from "@powerhousedao/reactor";
import { runWithConcurrency, type BatchItemResult } from "./concurrency.js";
import { AttachmentAlreadyExists } from "./errors.js";
export type { AttachmentTransferStage } from "./errors.js";
export {
  runWithConcurrency,
  type BatchItemResult,
  type RunWithConcurrencyOptions,
} from "./concurrency.js";
import type { IAttachmentService, IAttachmentUpload } from "./interfaces.js";
import type { AttachmentStage } from "./progress.js";
import { createRef } from "./ref.js";
import type {
  AttachmentHeader,
  AttachmentResponse,
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

export type AttachmentStageListener = (stage: AttachmentStage) => void;

export type AttachmentUploadInput = {
  file: Blob;
  fileName?: string;
  mimeType?: string;
  /** Per-item cancellation, checked between stages. */
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

export type AttachmentBatchOptions = {
  /** Bounds preprocessing and transfer together. Defaults to 4. */
  concurrency?: number;
  /** Whole-batch cancellation: stops unstarted items. */
  signal?: AbortSignal;
  onStage?: (index: number, stage: AttachmentStage) => void;
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
  /** Hash, reserve, and transfer one file; confirmed dedup skips the transfer. */
  upload(
    input: AttachmentUploadInput,
    onStage?: AttachmentStageListener,
  ): Promise<AttachmentUploadResult>;
  /** Document-authorized download of one ref. */
  download(
    input: AttachmentDownloadInput,
    onStage?: AttachmentStageListener,
  ): Promise<AttachmentResponse>;
  /**
   * Document-authorized download materialized as a typed Blob. The Blob's
   * type comes from the server header unless overridden — that's what makes
   * browsers render PDFs inline and images correctly.
   */
  downloadBlob(
    input: AttachmentDownloadInput,
    options?: AttachmentBlobOptions,
    onStage?: AttachmentStageListener,
  ): Promise<AttachmentBlobResult>;
  /**
   * Download and hand the bytes to the browser's save-file flow. Browser
   * only. fileName defaults to the server header's; pass the document's own
   * name for per-document naming.
   */
  saveAttachment(
    input: AttachmentDownloadInput,
    options?: AttachmentSaveOptions,
    onStage?: AttachmentStageListener,
  ): Promise<void>;
  /**
   * Download and expose the bytes as an object URL for inline rendering
   * (img/iframe/video src). Callers MUST call revoke() when done — the URL
   * pins the blob in memory until then.
   */
  downloadObjectUrl(
    input: AttachmentDownloadInput,
    options?: AttachmentBlobOptions,
    onStage?: AttachmentStageListener,
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

  async reserve(
    options: HashFirstReserveAttachmentOptions,
    send: (handle: IAttachmentUpload) => Promise<AttachmentUploadResult>,
  ): Promise<AttachmentUploadResult> {
    let handle: IAttachmentUpload;
    try {
      handle = await this.service.reserve(options);
    } catch (err) {
      if (isAttachmentAlreadyExists(err)) {
        const header = await this.service.stat(err.ref);
        return { hash: err.hash, ref: err.ref, header };
      }
      throw err;
    }
    return send(handle);
  }

  async upload(
    input: AttachmentUploadInput,
    onStage?: AttachmentStageListener,
  ): Promise<AttachmentUploadResult> {
    try {
      input.signal?.throwIfAborted();
      onStage?.("hashing");
      const preprocessed = await this.preprocess(input.file, {
        ...(input.fileName !== undefined ? { fileName: input.fileName } : {}),
        ...(input.mimeType !== undefined ? { mimeType: input.mimeType } : {}),
      });

      input.signal?.throwIfAborted();
      onStage?.("reserving");
      const result = await this.reserve(preprocessed.options, (handle) => {
        input.signal?.throwIfAborted();
        onStage?.("uploading");
        return handle.send(preprocessed.stream());
      });
      onStage?.("done");
      return result;
    } catch (err) {
      onStage?.("error");
      throw err;
    }
  }

  async download(
    input: AttachmentDownloadInput,
    onStage?: AttachmentStageListener,
  ): Promise<AttachmentResponse> {
    try {
      input.signal?.throwIfAborted();
      onStage?.("requesting-download-target");
      const response = await this.service.get(input.ref, {
        documentId: input.documentId,
        signal: input.signal,
      });
      onStage?.("downloading");
      onStage?.("done");
      return response;
    } catch (err) {
      onStage?.("error");
      throw err;
    }
  }

  async downloadBlob(
    input: AttachmentDownloadInput,
    options?: AttachmentBlobOptions,
    onStage?: AttachmentStageListener,
  ): Promise<AttachmentBlobResult> {
    try {
      input.signal?.throwIfAborted();
      onStage?.("requesting-download-target");
      const { header, body } = await this.service.get(input.ref, {
        documentId: input.documentId,
        signal: input.signal,
      });
      onStage?.("downloading");
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
      onStage?.("done");
      return { blob, header };
    } catch (err) {
      onStage?.("error");
      throw err;
    }
  }

  async saveAttachment(
    input: AttachmentDownloadInput,
    options?: AttachmentSaveOptions,
    onStage?: AttachmentStageListener,
  ): Promise<void> {
    if (typeof document === "undefined") {
      throw new Error(
        "saveAttachment requires a browser environment; use downloadBlob elsewhere",
      );
    }
    const { blob, header } = await this.downloadBlob(
      input,
      { mimeType: options?.mimeType },
      onStage,
    );
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
    options?: AttachmentBlobOptions,
    onStage?: AttachmentStageListener,
  ): Promise<AttachmentObjectUrl> {
    const { blob, header } = await this.downloadBlob(input, options, onStage);
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
      (input, index) =>
        this.upload(input, (stage) => options?.onStage?.(index, stage)),
      {
        concurrency:
          options?.concurrency ?? DEFAULT_ATTACHMENT_BATCH_CONCURRENCY,
        signal: options?.signal,
      },
    );
  }

  downloadMany(
    inputs: readonly AttachmentDownloadInput[],
    options?: AttachmentBatchOptions,
  ): Promise<BatchItemResult<AttachmentResponse>[]> {
    return runWithConcurrency(
      inputs,
      (input, index) =>
        this.download(input, (stage) => options?.onStage?.(index, stage)),
      {
        concurrency:
          options?.concurrency ?? DEFAULT_ATTACHMENT_BATCH_CONCURRENCY,
        signal: options?.signal,
      },
    );
  }
}

export function createAttachmentClient(
  service: IAttachmentService,
): IAttachmentClient {
  return new AttachmentClientImpl(service);
}
