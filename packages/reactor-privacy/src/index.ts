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
export type {
  ErasureItem,
  ErasurePlan,
  ErasurePlanItem,
  ErasureRequest,
  IErasureService,
} from "./erasure/types.js";
export {
  DEFAULT_ERASURE_DEADLINE_MS,
  ErasureRequestNotFoundError,
  ErasureService,
  type ErasureServiceOptions,
} from "./erasure/erasure-service.js";
export {
  DEFAULT_ERASURE_INTERVAL_MS,
  DEFAULT_MARKER_GRACE_MS,
  ErasureScheduler,
  ErasureSignerMissingError,
  type ErasureLogger,
  type ErasureSchedulerOptions,
  type IDocumentPermissionEraser,
} from "./erasure/scheduler.js";
export {
  createModuleErasure,
  type ModuleErasureOptions,
} from "./erasure/module.js";
export type { ErasureDb } from "./erasure/ledger.js";
export {
  DISCLOSURE_NOT_COVERED,
  DisclosureService,
  type BoundSyncRemote,
  type Disclosure,
  type IPermissionRowsLookup,
  type PeerManifestAppKey,
  type PermissionRow,
  type SubjectDocument,
} from "./disclosure/disclosure-service.js";
export {
  createPrivacyResolvers,
  createPrivacySubgraph,
  PRIVACY_SUBGRAPH_NAME,
  privacySubgraphTypeDefs,
  PrivacySubgraphOpenPolicyError,
  type IDisclosureService,
  type PrivacyAuthorization,
  type PrivacyResolverDeps,
  type PrivacySubgraph,
  type PrivacySubgraphContext,
} from "./subgraph/index.js";
