/**
 * The attachment BYTE MOVEMENT surface (multi-reactor W3.4), as its own entry.
 *
 * Realm-neutral on purpose: the local byte store (IndexedDB or memory), the
 * fetch-on-reference replicator, the peer-to-peer transport over a brokered
 * `LocalChannelPort`, and the schema-compiled ref extractor the replicator
 * runs. Nothing here reaches for a filesystem, an S3 client or a Kysely
 * database.
 *
 * Separate from the package root because the root carries the SERVER surface
 * too -- the filesystem and S3 backends, the Kysely stores -- and a consumer
 * that only replicates bytes (a browser reactor, the reactor-monitor hosting
 * library) should not pull an AWS SDK in to do it. Separate from `./client`
 * because that entry is deliberately free of the schema compiler and the read
 * model, and this one needs the compiler to find the refs it chases.
 */
export {
  attachmentReferenceAuthorizer,
  DEFAULT_LOCAL_CHUNK_BYTES,
  DEFAULT_LOCAL_REQUEST_TIMEOUT_MS,
  isLocalAttachmentRequest,
  isLocalAttachmentResponse,
  LOCAL_ATTACHMENT_PROTOCOL,
  LocalAttachmentServer,
  LocalAttachmentTransport,
  type LocalAttachmentAuthorizer,
  type LocalAttachmentMessage,
  type LocalAttachmentRequest,
  type LocalAttachmentResponse,
  type LocalAttachmentServerOptions,
  type LocalAttachmentTransportOptions,
} from "./local/index.js";
export {
  AttachmentReplicator,
  DEFAULT_ATTACHMENT_BACKLOG_PAGE_SIZE,
  DEFAULT_ATTACHMENT_REPLICATION_CONCURRENCY,
  DEFAULT_ATTACHMENT_RETRY_POLICY,
  SchemaCompiledOperationRefs,
  sha256Hex,
  staticAttachmentReferenceScanner,
  SYSTEM_REPLICATION_TIMERS,
  type AttachmentReplicationEntry,
  type AttachmentReplicationState,
  type AttachmentReplicatorOptions,
  type AttachmentReplicatorStatus,
  type AttachmentRetryPolicy,
  type IOperationAttachmentRefs,
  type ReplicationTimers,
} from "./replication/index.js";
export {
  collectStream,
  DEFAULT_IDB_DATABASE,
  IDB_BLOB_STORE,
  IDB_RECORD_STORE,
  IDB_STATUS_INDEX,
  IdbAttachmentBackend,
  LocalAttachmentStore,
  MemoryAttachmentBackend,
  streamFromBytes,
  type IdbAttachmentBackendOptions,
  type ILocalAttachmentBackend,
  type LocalAttachmentRecord,
} from "./storage/local/index.js";
export {
  AttachmentSchemaCompiler,
  type CompiledAttachmentExtractor,
  type IAttachmentSchemaCompiler,
} from "./reference-index/index.js";
export type {
  AttachmentReferencePageResult,
  AttachmentReferenceRow,
  IAttachmentReferenceReader,
  IAttachmentReferenceScanner,
} from "./read-models/attachment-reference/types.js";
export {
  AttachmentNotFound,
  AttachmentPending,
  InvalidAttachmentRef,
} from "./errors.js";
export type {
  IAttachmentReader,
  IAttachmentStore,
  IAttachmentTransport,
} from "./interfaces.js";
export { NullAttachmentTransport } from "./null-attachment-transport.js";
export { createRef, parseRef, type ParsedRef } from "./ref.js";
export {
  SwitchboardAttachmentTransport,
  type SwitchboardTransportConfig,
} from "./switchboard/switchboard-attachment-transport.js";
export type {
  AttachmentHeader,
  AttachmentMetadata,
  AttachmentResponse,
  AttachmentStatus,
  TransportFetchResult,
  TransportResponse,
} from "./types.js";
