import type { AttachmentHash, AttachmentRef } from "@powerhousedao/reactor";
import type {
  IAttachmentReader,
  IAttachmentService,
  IAttachmentUpload,
  IAttachmentUploadFactory,
  IReservationStore,
} from "./interfaces.js";
import type {
  AttachmentHeader,
  AttachmentResponse,
  ReserveAttachmentOptions,
} from "./types.js";
import {
  AttachmentAlreadyExists,
  AttachmentNotFound,
  AttachmentPending,
} from "./errors.js";
import { parseRef, createRef } from "./ref.js";

const CLIENT_HASH_PATTERN = /^[a-f0-9]{64}$/;

export class AttachmentService implements IAttachmentService {
  constructor(
    private readonly store: IAttachmentReader,
    private readonly reservations: IReservationStore,
    private readonly uploadFactory: IAttachmentUploadFactory,
  ) {}

  async reserve(options: ReserveAttachmentOptions): Promise<IAttachmentUpload> {
    if (options.clientHash !== undefined) {
      return this.reserveHashFirst(options);
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
    signal?: AbortSignal,
  ): Promise<AttachmentResponse> {
    const { hash } = parseRef(ref);
    return this.store.get(hash, signal);
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

    if (existingHeader !== null && existingHeader.status === "available") {
      throw new AttachmentAlreadyExists(normalized, createRef(normalized));
    }

    const reservation = await this.reservations.create(normalizedOptions);
    return this.uploadFactory.createUpload(reservation);
  }
}
