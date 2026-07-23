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
import { createRef } from "./ref.js";
import type {
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

export type PreprocessResult = {
  ref: AttachmentRef;
  hash: AttachmentHash;
  sizeBytes: number;
  options: HashFirstReserveAttachmentOptions;
  data: ReadableStream<Uint8Array>;
  stream: () => ReadableStream<Uint8Array>;
};

export type AttachmentStage =
  | "hashing"
  | "reserving"
  | "uploading"
  | "requesting-download-target"
  | "downloading"
  | "done"
  | "error";

export type AttachmentStageListener = (stage: AttachmentStage) => void;

export type AttachmentUploadInput = {
  file: Blob;
  fileName?: string;
  mimeType?: string;
  /**
   * Document that authorizes this upload. When present, the server decides
   * by the document's write permission — attaching is editing — so anonymous
   * actors may upload to documents they can write. Without it the server
   * falls back to requiring a bearer identity.
   */
  documentId?: string;
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
        // Prefer the metadata carried on the 409 itself: the stat route is
        // identity-gated, so an anonymous document-anchored uploader cannot
        // fall back to it.
        const header =
          (err as { header?: AttachmentUploadResult["header"] }).header ??
          (await this.service.stat(err.ref));
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
      const reserveOptions =
        input.documentId === undefined
          ? preprocessed.options
          : { ...preprocessed.options, documentId: input.documentId };
      const result = await this.reserve(reserveOptions, (handle) => {
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
