import type { AttachmentHash, AttachmentRef } from "@powerhousedao/reactor";
import { AttachmentAlreadyExists } from "./errors.js";
import type { IAttachmentService, IAttachmentUpload } from "./interfaces.js";
import { createRef } from "./ref.js";
import type {
  AttachmentUploadResult,
  HashFirstReserveAttachmentOptions,
} from "./types.js";

export { AttachmentService } from "./attachment-service.js";
export {
  AttachmentAlreadyExists,
  AttachmentNotFound,
  AttachmentPending,
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
  AttachmentHeader,
  AttachmentMetadata,
  AttachmentResponse,
  AttachmentStatus,
  AttachmentTransportConfig,
  AttachmentUploadResult,
  HashFirstReserveAttachmentOptions,
  UploadFirstReserveAttachmentOptions,
  Reservation,
  ReserveAttachmentOptions,
  TransportFetchResult,
  TransportResponse,
} from "./types.js";
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

export interface IAttachmentClient {
  preprocess(
    file: Blob,
    opts?: { fileName?: string; mimeType?: string },
  ): Promise<PreprocessResult>;
  reserve(
    options: HashFirstReserveAttachmentOptions,
    send: (handle: IAttachmentUpload) => Promise<AttachmentUploadResult>,
  ): Promise<AttachmentUploadResult>;
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
      if (err instanceof AttachmentAlreadyExists) {
        const header = await this.service.stat(err.ref);
        return { hash: err.hash, ref: err.ref, header };
      }
      throw err;
    }
    return send(handle);
  }
}

export function createAttachmentClient(
  service: IAttachmentService,
): IAttachmentClient {
  return new AttachmentClientImpl(service);
}
