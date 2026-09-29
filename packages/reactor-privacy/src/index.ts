export {
  getReactorPrivacyMigrationStatus,
  runReactorPrivacyMigrations,
  type ReactorPrivacyMigrationResult,
} from "./schema/migrations/migrator.js";
export type {
  ErasureAuditEvent,
  ErasureAuditTable,
  ErasureItemStatus,
  ErasureItemTable,
  ErasureRequestStatus,
  ErasureRequestTable,
  ReactorPrivacyDatabase,
  SubjectDocumentTable,
  SubjectRole,
} from "./schema/tables.js";
