export {
  AttachmentAlreadyExists,
  AttachmentNotFound,
  AttachmentPending,
  HashMismatch,
  InvalidAttachmentRef,
  ReservationNotFound,
  SizeMismatch,
  UploadTooLarge,
} from "./errors.js";
export type {
  IAttachmentReader,
  IAttachmentBackend,
  IAttachmentService,
  IAttachmentStore,
  IAttachmentTransport,
  IAttachmentTransportFactory,
  IAttachmentUpload,
  IAttachmentUploadFactory,
  IReservationStore,
} from "./interfaces.js";
export type {
  AttachmentHeader,
  AttachmentBackendHealth,
  AttachmentBackendKind,
  AttachmentDownloadTarget,
  AttachmentTargetHeaders,
  AttachmentUploadTarget,
  AttachmentMetadata,
  AttachmentResponse,
  AttachmentStatus,
  AttachmentTransportConfig,
  AttachmentUploadResult,
  HashFirstReserveAttachmentOptions,
  UploadFirstReserveAttachmentOptions,
  Reservation,
  ReserveAttachmentOptions,
  TransportFetchResult,
  TransportResponse,
} from "./types.js";
export {
  parseAttachmentDownloadTarget,
  parseAttachmentUploadTarget,
} from "./targets.js";
export { AttachmentService } from "./attachment-service.js";
export { parseRef, createRef } from "./ref.js";
export type { ParsedRef } from "./ref.js";
export { KyselyAttachmentStore } from "./storage/index.js";
export {
  KyselyReservationStore,
  DEFAULT_RESERVATION_TTL_MS,
} from "./storage/index.js";
export { runAttachmentMigrations, ATTACHMENT_SCHEMA } from "./storage/index.js";
export type { AttachmentDatabase } from "./storage/index.js";
export {
  DirectAttachmentUpload,
  DirectAttachmentUploadFactory,
  FilesystemAttachmentBackend,
  type FilesystemAttachmentBackendConfig,
} from "./direct/index.js";
export {
  SwitchboardAttachmentTransport,
  type SwitchboardTransportConfig,
  RemoteReservationStore,
  RemoteAttachmentUpload,
  RemoteAttachmentUploadFactory,
  RemoteAttachmentStore,
  createRemoteAttachmentService,
  type SwitchboardClientConfig,
} from "./switchboard/index.js";
export { NullAttachmentTransport } from "./null-attachment-transport.js";
export { AttachmentBuilder } from "./attachment-builder.js";
export type { AttachmentBuildResult } from "./attachment-builder.js";
export {
  AttachmentSchemaCompiler,
  type CompiledAttachmentExtractor,
  type IAttachmentSchemaCompiler,
} from "./reference-index/index.js";
export {
  ATTACHMENT_REFERENCE_MIGRATION_LOCK_TABLE,
  ATTACHMENT_REFERENCE_MIGRATION_TABLE,
  ATTACHMENT_REFERENCE_SCHEMA,
  AttachmentReferenceIndexBuilder,
  KyselyAttachmentReferenceStore,
  getAttachmentReferenceMigrationStatus,
  rollbackAttachmentReferenceMigration,
  runAttachmentReferenceMigrations,
  type AttachmentReferenceIndexBuildResult,
  type AttachmentReferenceInput,
  type AttachmentReferenceMigrationResult,
  type IAttachmentReferenceReader,
  type IAttachmentReferenceWriter,
} from "./read-models/attachment-reference/index.js";
export {
  DEFAULT_S3_ATTACHMENT_PREFIX,
  DEFAULT_S3_DOWNLOAD_TTL_SECONDS,
  DEFAULT_S3_UPLOAD_TTL_SECONDS,
  MAX_S3_PRESIGN_TTL_SECONDS,
  S3AttachmentBackend,
  S3AttachmentUploadFactory,
  S3AttachmentPrimitives,
  createS3AttachmentBackend,
  createS3AttachmentPrimitives,
  deriveS3AttachmentKey,
  normalizeS3AttachmentPrefix,
  parseAttachmentStorageConfig,
  sha256HexToBase64,
  type AttachmentStorageConfig,
  type S3AttachmentConfig,
  type S3AttachmentBackendDependencies,
  type S3CommandClient,
  type S3Presigner,
} from "./storage/s3/index.js";
