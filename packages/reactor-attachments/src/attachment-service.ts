import type { AttachmentHash, AttachmentRef } from "@powerhousedao/reactor";
import {
  AttachmentAlreadyExists,
  AttachmentNotFound,
  AttachmentPending,
} from "./errors.js";
import type {
  IAttachmentReader,
  IAttachmentBackend,
  IAttachmentService,
  IAttachmentUpload,
  IAttachmentUploadFactory,
  IReservationStore,
} from "./interfaces.js";
import { createRef, parseRef } from "./ref.js";
import type {
  AttachmentDownloadOptions,
  AttachmentHeader,
  AttachmentResponse,
  ReserveAttachmentOptions,
} from "./types.js";

const CLIENT_HASH_PATTERN = /^[a-f0-9]{64}$/;

export class AttachmentService implements IAttachmentService {
  constructor(
    private readonly store: IAttachmentReader,
    private readonly reservations: IReservationStore,
    private readonly uploadFactory: IAttachmentUploadFactory,
    private readonly backend?: IAttachmentBackend,
  ) {}

  async reserve(options: ReserveAttachmentOptions): Promise<IAttachmentUpload> {
    if (options.clientHash !== undefined) {
      return this.reserveHashFirst(options);
    }
    if (this.backend?.kind === "s3") {
      throw new Error("S3 attachment reservations require a client hash");
    }
    const reservation = await this.reservations.create(options);
    return this.uploadFactory.createUpload(reservation);
  }

  async stat(ref: AttachmentRef): Promise<AttachmentHeader> {
    const { hash } = parseRef(ref);
    return this.store.stat(hash);
  }

  async get(
    ref: AttachmentRef,
    options?: AbortSignal | AttachmentDownloadOptions,
  ): Promise<AttachmentResponse> {
    const { hash } = parseRef(ref);
    const normalized =
      options === undefined || options instanceof AbortSignal
        ? { signal: options }
        : options;
    return normalized.documentId === undefined
      ? this.store.get(hash, normalized.signal)
      : this.store.get(hash, normalized.signal, normalized.documentId);
  }

  private async reserveHashFirst(
    options: ReserveAttachmentOptions,
  ): Promise<IAttachmentUpload> {
    const normalized = options.clientHash!.toLowerCase() as AttachmentHash;
    if (!CLIENT_HASH_PATTERN.test(normalized)) {
      throw new Error(
        `clientHash must be a 64-character lowercase hex string, got: ${options.clientHash}`,
      );
    }
    if (
      options.sizeBytes === undefined ||
      !Number.isInteger(options.sizeBytes) ||
      options.sizeBytes <= 0 ||
      !Number.isSafeInteger(options.sizeBytes)
    ) {
      throw new Error(
        "sizeBytes must be a positive safe integer when clientHash is provided",
      );
    }

    const normalizedOptions: ReserveAttachmentOptions = {
      ...options,
      clientHash: normalized,
    };

    let existingHeader: AttachmentHeader | null = null;
    try {
      existingHeader = await this.store.stat(normalized);
    } catch (err) {
      if (
        !(err instanceof AttachmentNotFound) &&
        !(err instanceof AttachmentPending)
      ) {
        throw err;
      }
    }

    if (existingHeader !== null) {
      if (this.backend?.kind === "s3") {
        if (await this.backend.exists(normalized)) {
          throw new AttachmentAlreadyExists(normalized, createRef(normalized));
        }
      } else if (existingHeader.status === "available") {
        throw new AttachmentAlreadyExists(normalized, createRef(normalized));
      }
    }

    const reservation = await this.reservations.create(normalizedOptions);
    if (this.backend?.kind !== "s3") {
      return this.uploadFactory.createUpload(reservation);
    }
    const uploadTarget = await this.backend.prepareUploadTarget(reservation);
    return this.uploadFactory.createUpload({ ...reservation, uploadTarget });
  }
}
