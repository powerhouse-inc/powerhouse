import { createHash } from "node:crypto";
import { join } from "node:path";
import type { Kysely } from "kysely";
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
import { createRef } from "../ref.js";
import {
  storageRelativePath,
  writeAttachmentBytes,
  streamFromBuffer,
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
  };
}

async function collectAndHash(
  data: ReadableStream<Uint8Array>,
): Promise<{ bytes: Uint8Array; hash: string }> {
  const hasher = createHash("sha256");
  const chunks: Uint8Array[] = [];
  const reader = data.getReader();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    hasher.update(value);
    chunks.push(value);
  }

  const totalLength = chunks.reduce((acc, c) => acc + c.byteLength, 0);
  const bytes = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { bytes, hash: hasher.digest("hex") };
}

export class DirectAttachmentUpload implements IAttachmentUpload {
  readonly reservationId: string;

  constructor(
    reservationId: string,
    private readonly options: ReserveAttachmentOptions,
    private readonly db: Kysely<AttachmentDatabase>,
    private readonly basePath: string,
    private readonly reservations: IReservationStore,
  ) {
    this.reservationId = reservationId;
  }

  async send(
    data: ReadableStream<Uint8Array>,
  ): Promise<AttachmentUploadResult> {
    const { bytes, hash } = await collectAndHash(data);

    const existing = await this.db
      .selectFrom("attachment")
      .select(["hash", "status"])
      .where("hash", "=", hash)
      .executeTakeFirst();

    if (existing?.status !== "available") {
      const relPath = storageRelativePath(hash);
      const fullPath = join(this.basePath, relPath);
      await writeAttachmentBytes(fullPath, streamFromBuffer(bytes));

      const now = new Date().toISOString();

      if (!existing) {
        await this.db
          .insertInto("attachment")
          .values({
            hash,
            mime_type: this.options.mimeType,
            file_name: this.options.fileName,
            size_bytes: bytes.byteLength,
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
