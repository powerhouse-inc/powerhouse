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
export {
  DeploymentSecretError,
  MIN_DEPLOYMENT_SECRET_BYTES,
  subjectHash,
  type DeploymentSecret,
} from "./subject-hash.js";
export {
  SUBJECT_DOCUMENTS_READ_MODEL_ID,
  SubjectDocumentsReadModel,
} from "./read-model/subject-documents-read-model.js";
export {
  LiveReadModelRegistrationError,
  registerSubjectDocumentsReadModel,
} from "./read-model/register.js";
export {
  isAddressLiteral,
  jwkToDidKey,
  mentionsOf,
  type SubjectMention,
} from "./read-model/subjects.js";
