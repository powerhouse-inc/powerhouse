// The engine's host-facing surface: everything reactor-api composes, serves or
// registers. The pieces layer beneath is reached through ./testing only.
export {
  createAttachmentPort,
  type AttachmentClientLike,
} from "./reactor/attachment-port.js";
export { WORKFLOW_PACKAGE_NAME } from "./reactor/package-name.js";
export { PieceRegistry, packagePieces } from "./reactor/piece-registry.js";
export { createDocumentEventProcessorFactory } from "./reactor/processors/document-event-trigger/factory.js";
export { DocumentEventTrigger } from "./reactor/processors/document-event-trigger/processor.js";
export type {
  WorkflowCaller,
  WorkflowRuntimeHostDeps,
} from "./reactor/host.js";
export {
  createWorkflowRuntime,
  WorkflowRuntimeService,
  type ConnectionCheckResult,
  type ConnectionSummary,
  type PersistedRunResult,
} from "./reactor/service.js";
export {
  WorkflowTriggersReadModel,
  WORKFLOW_TRIGGERS_READ_MODEL,
  WORKFLOW_TRIGGERS_READ_MODEL_STAGE,
} from "./reactor/workflow-triggers-read-model.js";
export type {
  PieceStoreRow,
  RunRow,
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
