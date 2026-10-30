// The engine's host-facing surface: everything reactor-api composes, serves or
// registers. The pieces layer beneath is reached through ./testing only.
export {
  createAttachmentPort,
  type AttachmentClientLike,
} from "./reactor/attachment-port.js";
export { WORKFLOW_PACKAGE_NAME } from "./reactor/package-name.js";
export { CORE_PIECE_NAME, CORE_PIECE_VERSION } from "./pieces/core/index.js";
export { setPieceRegistryUrl } from "./pieces/activepieces/registry-source.js";
export { PieceRegistry, packagePieces } from "./reactor/piece-registry.js";
export type {
  AttachmentReadRequest,
  HostIdentity,
  WorkflowCaller,
  WorkflowRuntimeHostDeps,
} from "./reactor/host.js";
export {
  createWorkflowRuntime,
  WAITPOINT_EXPIRED_ERROR_NAME,
  WAITPOINT_NOT_LIVE_ERROR_NAME,
  WORKFLOW_DISABLED_ERROR_NAME,
  WORKFLOW_PARKED_ERROR_NAME,
  WorkflowRuntimeService,
  waitpointRecord,
  type BlockResolutionRecord,
  type ConnectionCheckResult,
  type ConnectionSummary,
  type PersistedRunResult,
  type RunPage,
  type RunRecord,
  type RunsArgs,
  type RunsPageArgs,
} from "./reactor/service.js";
export { InvalidRunCursorError } from "./reactor/run-cursor.js";
export type {
  ApprovalRequest,
  ReasonRequiredOn,
  ResolveWaitpointInput,
  WaitingRunsArgs,
  WaitpointKind,
  WaitpointDescription,
  WaitpointRecord,
  WaitpointResumePayload,
  WaitpointStatus,
  WaitpointType,
} from "./reactor/waitpoint-types.js";
export {
  acquireWorkflowSingletonLease,
  singletonOwnerName,
  SINGLETON_HEARTBEAT_MS,
  SINGLETON_STALE_HEARTBEATS,
  SINGLETON_LEASE_TTL_MS,
  WORKFLOW_SINGLETON_OWNER_ENV,
  WorkflowSingletonConflictError,
  type AcquireSingletonOptions,
  type WorkflowSingletonLease,
  type WorkflowSingletonLoss,
} from "./reactor/singleton-lease.js";
export { TELEMETRY_SCOPE, type WorkflowTelemetryOptions } from "./telemetry.js";
export { publishRunUser } from "./reactor/run-user.js";
export type {
  OAuthAttemptStatus,
  OAuthAttemptView,
  OAuthStart,
} from "./reactor/oauth.js";
export {
  clientKindFor,
  loadOAuthApps,
  grantedScopes,
  OAUTH_APP,
  oauthSignInFor,
  OAUTH_GRANTED_SCOPES,
  OAUTH_SCOPES,
  parseClientFile,
  parseRelay,
  scopesOverride,
  StaticOAuthAppRegistry,
  type OAuthAppClient,
  type OAuthAppDefinition,
  type OAuthAppRelay,
  type OAuthSignIn,
  type OAuthAppRegistry,
  type OAuthClientKind,
} from "./reactor/oauth-apps.js";
export {
  WorkflowTriggersReadModel,
  WORKFLOW_TRIGGERS_READ_MODEL,
  WORKFLOW_TRIGGERS_READ_MODEL_STAGE,
  type WorkflowHealthReader,
} from "./reactor/workflow-triggers-read-model.js";
export type { WorkflowHealth } from "./reactor/service.js";
export type {
  PieceStoreRow,
  RunPinRow,
  RunRow,
  WaitpointRow,
  StepExecutionRow,
  TriggerDedupeRow,
  TriggerStateRow,
  WorkflowRuntimeDB,
} from "./reactor/store.js";
export type {
  PieceTriggerBinding,
  ScheduleTriggerBinding,
  TriggerBinding,
} from "./reactor/trigger-supervisor.js";
export type { WebhookConfig, WebhookPayload } from "./reactor/webhook.js";
export type { StepTestResult } from "./reactor/step-test.js";
export type { OutputTree, OutputTreeNode } from "./reactor/output-tree.js";
export {
  WORKFLOW_SYNCING_MESSAGE,
  WorkflowSyncingError,
  type WorkflowAccessOptions,
} from "./reactor/sync-wait.js";
