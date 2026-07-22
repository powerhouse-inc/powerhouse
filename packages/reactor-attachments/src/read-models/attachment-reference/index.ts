export {
  AttachmentReferenceIndexBuilder,
  type AttachmentReferenceIndexBuildResult,
} from "./index-builder.js";
export { KyselyAttachmentReferenceStore } from "./kysely-attachment-reference-store.js";
export type {
  AttachmentReferenceInput,
  IAttachmentReferenceReader,
  IAttachmentReferenceWriter,
} from "./types.js";
export {
  ATTACHMENT_REFERENCE_MIGRATION_LOCK_TABLE,
  ATTACHMENT_REFERENCE_MIGRATION_TABLE,
  ATTACHMENT_REFERENCE_SCHEMA,
  getAttachmentReferenceMigrationStatus,
  rollbackAttachmentReferenceMigration,
  runAttachmentReferenceMigrations,
  type AttachmentReferenceMigrationResult,
} from "./storage/migrations/migrator.js";
