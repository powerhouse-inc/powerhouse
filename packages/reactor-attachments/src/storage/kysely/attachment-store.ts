import { join } from "node:path";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { AttachmentHash } from "@powerhousedao/reactor";
import type {
  IAttachmentStore,
  IAttachmentTransport,
} from "../../interfaces.js";
import type {
  AttachmentHeader,
  AttachmentMetadata,
  AttachmentResponse,
  AttachmentStatus,
} from "../../types.js";
import { AttachmentNotFound } from "../../errors.js";
import type { AttachmentDatabase, AttachmentRow } from "./types.js";
import {
  storageRelativePath,
  writeAttachmentBytes,
  readAttachmentStream,
  deleteAttachmentBytes,
} from "../fs/attachment-fs.js";

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

function wrapStreamWithCleanup(
  source: ReadableStream<Uint8Array>,
  cleanup: () => void,
): ReadableStream<Uint8Array> {
  let cleaned = false;
  const doCleanup = () => {
    if (!cleaned) {
      cleaned = true;
      cleanup();
    }
  };

  const reader = source.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          doCleanup();
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (err) {
        doCleanup();
        controller.error(err);
      }
    },
    cancel() {
      doCleanup();
      reader.cancel().catch(() => {});
    },
  });
}

export class KyselyAttachmentStore implements IAttachmentStore {
  private readonly activeReaders = new Map<string, number>();

  constructor(
    private readonly db: Kysely<AttachmentDatabase>,
    private readonly transport: IAttachmentTransport,
    private readonly basePath: string,
  ) {}

  async stat(hash: AttachmentHash): Promise<AttachmentHeader> {
    const row = await this.db
      .selectFrom("attachment")
      .selectAll()
      .where("hash", "=", hash)
      .executeTakeFirst();

    if (!row) {
      throw new AttachmentNotFound(hash);
    }

    return rowToHeader(row);
  }

  async has(hash: AttachmentHash): Promise<boolean> {
    const row = await this.db
      .selectFrom("attachment")
      .select("status")
      .where("hash", "=", hash)
      .executeTakeFirst();

    return row?.status === "available";
  }

  async get(
    hash: AttachmentHash,
    signal?: AbortSignal,
  ): Promise<AttachmentResponse> {
    const row = await this.db
      .selectFrom("attachment")
      .selectAll()
      .where("hash", "=", hash)
      .executeTakeFirst();

    if (!row) {
      throw new AttachmentNotFound(hash);
    }

    if (row.status === "evicted") {
      const remote = await this.transport.fetch(hash, signal);
      if (!remote) {
        throw new AttachmentNotFound(hash);
      }
      await this.put(hash, remote.metadata, remote.body);
      return this.get(hash, signal);
    }

    const now = new Date().toISOString();
    await this.db
      .updateTable("attachment")
      .set({ last_accessed_at_utc: now })
      .where("hash", "=", hash)
      .execute();

    const header = rowToHeader(row);
    header.lastAccessedAtUtc = now;

    this.acquireReader(hash);

    const fullPath = join(this.basePath, row.storage_path);
    const rawStream = readAttachmentStream(fullPath);
    const body = wrapStreamWithCleanup(rawStream, () =>
      this.releaseReader(hash),
    );

    return { header, body };
  }

  async put(
    hash: AttachmentHash,
    metadata: AttachmentMetadata,
    data: ReadableStream<Uint8Array>,
  ): Promise<void> {
    const existing = await this.db
      .selectFrom("attachment")
      .select(["hash", "status"])
      .where("hash", "=", hash)
      .executeTakeFirst();

    if (existing?.status === "available") {
      await data.cancel();
      return;
    }

    const relPath = storageRelativePath(hash);
    const fullPath = join(this.basePath, relPath);
    await writeAttachmentBytes(fullPath, data);

    const now = new Date().toISOString();

    if (!existing) {
      await this.db
        .insertInto("attachment")
        .values({
          hash,
          mime_type: metadata.mimeType,
          file_name: metadata.fileName,
          size_bytes: metadata.sizeBytes,
          extension: metadata.extension ?? null,
          status: "available",
          storage_path: relPath,
          source: "sync",
          created_at_utc: now,
          last_accessed_at_utc: now,
        })
        .onConflict((oc) => oc.column("hash").doNothing())
        .execute();
    } else {
      await this.db
        .updateTable("attachment")
        .set({
          status: "available",
          storage_path: relPath,
          last_accessed_at_utc: now,
        })
        .where("hash", "=", hash)
        .where("status", "=", "evicted")
        .execute();
    }
  }

  async evict(hash: AttachmentHash): Promise<void> {
    if (this.hasActiveReaders(hash)) {
      return;
    }

    const row = await this.db
      .selectFrom("attachment")
      .select(["storage_path", "status"])
      .where("hash", "=", hash)
      .executeTakeFirst();

    if (!row || row.status === "evicted") {
      return;
    }

    const fullPath = join(this.basePath, row.storage_path);
    await deleteAttachmentBytes(fullPath);

    await this.db
      .updateTable("attachment")
      .set({ status: "evicted" })
      .where("hash", "=", hash)
      .execute();
  }

  async storageUsed(): Promise<number> {
    const result = await this.db
      .selectFrom("attachment")
      .select(sql<string>`COALESCE(SUM(size_bytes), 0)`.as("total"))
      .where("status", "=", "available")
      .executeTakeFirst();

    return Number(result?.total ?? 0);
  }

  // Private: active reader tracking

  private acquireReader(hash: string): void {
    this.activeReaders.set(hash, (this.activeReaders.get(hash) ?? 0) + 1);
  }

  private releaseReader(hash: string): void {
    const count = (this.activeReaders.get(hash) ?? 1) - 1;
    if (count <= 0) {
      this.activeReaders.delete(hash);
    } else {
      this.activeReaders.set(hash, count);
    }
  }

  private hasActiveReaders(hash: string): boolean {
    return (this.activeReaders.get(hash) ?? 0) > 0;
  }
}
