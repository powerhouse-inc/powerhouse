import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Kysely } from "kysely";
import type { AttachmentRef } from "@powerhousedao/reactor";
import type { IAttachmentUpload, IReservationStore } from "../interfaces.js";
import type {
  AttachmentHeader,
  AttachmentUploadResult,
  ReserveAttachmentOptions,
} from "../types.js";
import type {
  AttachmentDatabase,
  AttachmentRow,
} from "../storage/kysely/types.js";
import { HashMismatch } from "../errors.js";
import { createRef } from "../ref.js";
import {
  storageRelativePath,
  streamHashAndWrite,
} from "../storage/fs/attachment-fs.js";
import type { AttachmentStatus } from "../types.js";

function rowToHeader(row: AttachmentRow): AttachmentHeader {
  return {
    hash: row.hash,
    mimeType: row.mime_type,
    fileName: row.file_name,
    sizeBytes: Number(row.size_bytes),
    extension: row.extension,
    status: row.status as AttachmentStatus,
    source: row.source as "local" | "sync",
    createdAtUtc: row.created_at_utc,
    lastAccessedAtUtc: row.last_accessed_at_utc,
    expiresAtUtc: null,
  };
}

export class DirectAttachmentUpload implements IAttachmentUpload {
  readonly reservationId: string;
  readonly ref: AttachmentRef | null;

  constructor(
    reservationId: string,
    private readonly options: ReserveAttachmentOptions,
    private readonly db: Kysely<AttachmentDatabase>,
    private readonly basePath: string,
    private readonly reservations: IReservationStore,
    private readonly maxBytes?: number,
  ) {
    this.reservationId = reservationId;
    this.ref =
      options.clientHash != null ? createRef(options.clientHash) : null;
  }

  async send(
    data: ReadableStream<Uint8Array>,
  ): Promise<AttachmentUploadResult> {
    // Stream bytes directly to a temp file while hashing. This caps memory
    // usage at one chunk regardless of payload size, and lets us enforce
    // `maxBytes` before either disk or memory grows unbounded.
    // When clientHash is present, declaredSizeBytes is enforced during the
    // stream: exceeding it aborts early, and a short stream fails at end.
    const declaredSizeBytes =
      this.options.clientHash != null ? this.options.sizeBytes : undefined;
    const { tempPath, hash, sizeBytes } = await streamHashAndWrite(
      this.basePath,
      data,
      { maxBytes: this.maxBytes, declaredSizeBytes },
    );

    // Hash verification: if the client claimed a hash, compare before any
    // DB write or rename. On mismatch the temp file is removed and the
    // reservation is deliberately retained so the client can retry.
    if (this.options.clientHash != null && hash !== this.options.clientHash) {
      await rm(tempPath, { force: true });
      throw new HashMismatch(this.options.clientHash, hash);
    }

    try {
      const existing = await this.db
        .selectFrom("attachment")
        .select(["hash", "status"])
        .where("hash", "=", hash)
        .executeTakeFirst();

      if (existing?.status === "available") {
        // Dedup -- bytes already on disk, drop the temp file.
        await rm(tempPath, { force: true });
      } else {
        const relPath = storageRelativePath(hash);
        const fullPath = join(this.basePath, relPath);
        await mkdir(dirname(fullPath), { recursive: true });
        await rename(tempPath, fullPath);

        const now = new Date().toISOString();

        if (!existing) {
          await this.db
            .insertInto("attachment")
            .values({
              hash,
              mime_type: this.options.mimeType,
              file_name: this.options.fileName,
              size_bytes: sizeBytes,
              extension: this.options.extension ?? null,
              status: "available",
              storage_path: relPath,
              source: "local",
              created_at_utc: now,
              last_accessed_at_utc: now,
            })
            .onConflict((oc) => oc.column("hash").doNothing())
            .execute();
        } else {
          // Existing row was evicted — restore it
          await this.db
            .updateTable("attachment")
            .set({
              status: "available",
              storage_path: relPath,
              source: "local",
              last_accessed_at_utc: now,
            })
            .where("hash", "=", hash)
            .where("status", "=", "evicted")
            .execute();
        }
      }
    } catch (err) {
      await rm(tempPath, { force: true });
      throw err;
    }

    await this.reservations.delete(this.reservationId);

    const row = await this.db
      .selectFrom("attachment")
      .selectAll()
      .where("hash", "=", hash)
      .executeTakeFirstOrThrow();

    return {
      hash,
      ref: createRef(hash),
      header: rowToHeader(row),
    };
  }
}
