export {
  DEFAULT_S3_ATTACHMENT_PREFIX,
  DEFAULT_S3_DOWNLOAD_TTL_SECONDS,
  DEFAULT_S3_UPLOAD_TTL_SECONDS,
  MAX_S3_PRESIGN_TTL_SECONDS,
  normalizeS3AttachmentPrefix,
  parseAttachmentStorageConfig,
  type AttachmentStorageConfig,
  type S3AttachmentConfig,
} from "./config.js";
export { deriveS3AttachmentKey, sha256HexToBase64 } from "./keying.js";
export {
  S3AttachmentPrimitives,
  createS3AttachmentPrimitives,
  type S3CommandClient,
  type S3Presigner,
} from "./primitives.js";
export {
  S3AttachmentBackend,
  createS3AttachmentBackend,
  type S3AttachmentBackendDependencies,
} from "./backend.js";
export { S3AttachmentUploadFactory } from "./upload-factory.js";
