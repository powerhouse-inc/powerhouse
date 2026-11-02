import {
  createS3AttachmentBackend,
  type AttachmentDatabase,
  type AttachmentStorageConfig,
  type IAttachmentBackend,
  type S3AttachmentBackendDependencies,
} from "@powerhousedao/reactor-attachments";
import type { Kysely } from "kysely";

export type StartupAttachmentBackendOptions = {
  db: Kysely<AttachmentDatabase>;
  /** Filesystem when unset. */
  storage?: AttachmentStorageConfig;
  s3Dependencies?: S3AttachmentBackendDependencies;
};

/** Filesystem is the default; explicit S3 is readiness-gated without fallback. */
export async function createStartupAttachmentBackend({
  db,
  storage = { kind: "filesystem" },
  s3Dependencies,
}: StartupAttachmentBackendOptions): Promise<IAttachmentBackend | undefined> {
  if (storage.kind === "filesystem") return undefined;

  const backend = createS3AttachmentBackend(
    db.withSchema("attachments"),
    storage.s3,
    s3Dependencies,
  );
  const health = await backend.health();
  if (!health.ready) {
    throw new Error("S3 attachment backend readiness check failed");
  }
  return backend;
}
