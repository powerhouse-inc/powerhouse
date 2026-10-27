import {
  createS3AttachmentBackend,
  parseAttachmentStorageConfig,
  type AttachmentDatabase,
  type AttachmentStorageConfig,
  type IAttachmentBackend,
  type S3AttachmentBackendDependencies,
} from "@powerhousedao/reactor-attachments";
import type { Kysely } from "kysely";

export type StartupAttachmentBackendOptions = {
  db: Kysely<AttachmentDatabase>;
  /** Used as is; `env` is parsed only when this is absent. */
  storage?: AttachmentStorageConfig;
  env?: Readonly<Record<string, string | undefined>>;
  s3Dependencies?: S3AttachmentBackendDependencies;
};

/** Filesystem is the default; explicit S3 is readiness-gated without fallback. */
export async function createStartupAttachmentBackend({
  db,
  storage: configured,
  env = process.env,
  s3Dependencies,
}: StartupAttachmentBackendOptions): Promise<IAttachmentBackend | undefined> {
  const storage = configured ?? parseAttachmentStorageConfig(env);
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
