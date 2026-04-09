export { KyselyAttachmentStore } from "./kysely/attachment-store.js";
export type {
  AttachmentDatabase,
  AttachmentRow,
  InsertableAttachment,
  UpdateableAttachment,
} from "./kysely/types.js";
export {
  runAttachmentMigrations,
  ATTACHMENT_SCHEMA,
} from "./migrations/migrator.js";
export type { MigrationResult } from "./migrations/migrator.js";
export {
  storagePath,
  storageRelativePath,
  writeAttachmentBytes,
  readAttachmentStream,
  deleteAttachmentBytes,
  attachmentBytesExist,
} from "./fs/attachment-fs.js";
