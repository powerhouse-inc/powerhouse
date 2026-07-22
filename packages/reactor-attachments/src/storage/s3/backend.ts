import type { AttachmentHash } from "@powerhousedao/reactor";
import type { Kysely } from "kysely";
import type { IAttachmentBackend } from "../../interfaces.js";
import type {
  AttachmentBackendHealth,
  AttachmentDownloadTarget,
  AttachmentUploadTarget,
  Reservation,
} from "../../types.js";
import type { AttachmentDatabase } from "../kysely/types.js";
import type { S3AttachmentConfig } from "./config.js";
import { deriveS3AttachmentKey } from "./keying.js";
import {
  S3AttachmentPrimitives,
  type S3CommandClient,
  type S3Presigner,
} from "./primitives.js";

const READINESS_PROBE_HASH = "0".repeat(64);
const OBJECT_NOT_FOUND_NAMES = new Set([
  "NotFound",
  "NoSuchKey",
  "NoSuchObject",
]);

type ProviderError = {
  name?: unknown;
  code?: unknown;
  $metadata?: { httpStatusCode?: unknown };
};

export type S3AttachmentBackendDependencies = {
  client?: S3CommandClient;
  presign?: S3Presigner;
  now?: () => Date;
  uploadTtlSeconds?: number;
  downloadTtlSeconds?: number;
};

function isObjectNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const providerError = error as ProviderError;
  if (providerError.$metadata?.httpStatusCode !== 404) return false;
  return [providerError.name, providerError.code].some(
    (code) => typeof code === "string" && OBJECT_NOT_FOUND_NAMES.has(code),
  );
}

function requireHashFirstReservation(
  reservation: Reservation,
): asserts reservation is Reservation & {
  clientHash: AttachmentHash;
  sizeBytes: number;
} {
  if (reservation.clientHash === null) {
    throw new Error("S3 attachment reservations require a client hash");
  }
  deriveS3AttachmentKey(reservation.clientHash, "validation");
  if (
    reservation.sizeBytes === null ||
    !Number.isSafeInteger(reservation.sizeBytes) ||
    reservation.sizeBytes <= 0
  ) {
    throw new Error(
      "S3 attachment reservation sizeBytes must be a positive safe integer",
    );
  }
}

/** Server-only S3 capability. Callers complete authorization before download. */
export class S3AttachmentBackend implements IAttachmentBackend {
  readonly kind = "s3" as const;
  private readonly primitives: S3AttachmentPrimitives;
  private readonly now: () => Date;
  private readonly uploadTtlSeconds: number;
  private readonly downloadTtlSeconds: number;

  constructor(
    private readonly db: Kysely<AttachmentDatabase>,
    readonly config: S3AttachmentConfig,
    dependencies: S3AttachmentBackendDependencies = {},
  ) {
    this.primitives = new S3AttachmentPrimitives(config, dependencies);
    this.now = dependencies.now ?? (() => new Date());
    this.uploadTtlSeconds =
      dependencies.uploadTtlSeconds ?? config.uploadTtlSeconds;
    this.downloadTtlSeconds =
      dependencies.downloadTtlSeconds ?? config.downloadTtlSeconds;
  }

  async prepareUploadTarget(
    reservation: Reservation,
  ): Promise<AttachmentUploadTarget> {
    requireHashFirstReservation(reservation);
    const hash = reservation.clientHash;
    const now = this.now().toISOString();
    const storagePath = deriveS3AttachmentKey(hash, this.config.prefix);

    try {
      await this.db
        .insertInto("attachment")
        .values({
          hash,
          mime_type: reservation.mimeType,
          file_name: reservation.fileName,
          size_bytes: reservation.sizeBytes,
          extension: reservation.extension,
          status: "available",
          storage_path: storagePath,
          source: "local",
          created_at_utc: reservation.createdAtUtc,
          last_accessed_at_utc: now,
        })
        .onConflict((conflict) =>
          conflict.column("hash").doUpdateSet({
            mime_type: reservation.mimeType,
            file_name: reservation.fileName,
            size_bytes: reservation.sizeBytes,
            extension: reservation.extension,
            status: "available",
            storage_path: storagePath,
            last_accessed_at_utc: now,
          }),
        )
        .execute();
    } catch {
      throw new Error("S3 attachment metadata registration failed");
    }

    let target: AttachmentUploadTarget;
    try {
      target = await this.primitives.createUploadTarget(
        hash,
        reservation.mimeType,
        this.uploadTtlSeconds,
      );
    } catch {
      throw new Error("S3 attachment upload target preparation failed");
    }

    // Direct S3 completion is invisible to Switchboard; the existing sweep
    // expires this reservation normally.
    return target;
  }

  async prepareDownloadTarget(
    hash: AttachmentHash,
  ): Promise<AttachmentDownloadTarget> {
    try {
      return await this.primitives.createDownloadTarget(
        hash,
        this.downloadTtlSeconds,
      );
    } catch {
      throw new Error("S3 attachment download target preparation failed");
    }
  }

  async exists(hash: AttachmentHash): Promise<boolean> {
    const metadata = await this.db
      .selectFrom("attachment")
      .select("hash")
      .where("hash", "=", hash)
      .executeTakeFirst();
    if (!metadata) return false;

    try {
      await this.primitives.headObject(hash);
      return true;
    } catch (error) {
      if (isObjectNotFound(error)) return false;
      // Provider errors may contain endpoints or signed request details, so the
      // raw cause intentionally must not cross this backend boundary.
      // eslint-disable-next-line preserve-caught-error
      throw new Error("S3 attachment existence check failed");
    }
  }

  async health(): Promise<AttachmentBackendHealth> {
    try {
      await this.primitives.headObject(READINESS_PROBE_HASH);
      return { kind: this.kind, ready: true };
    } catch (error) {
      return {
        kind: this.kind,
        ready: isObjectNotFound(error),
      };
    }
  }
}

export function createS3AttachmentBackend(
  db: Kysely<AttachmentDatabase>,
  config: S3AttachmentConfig,
  dependencies: S3AttachmentBackendDependencies = {},
): S3AttachmentBackend {
  return new S3AttachmentBackend(db, config, dependencies);
}
