// Shared shapes for suspended runs: the engine writes them, the HTTP resume
// route and the subgraph read them.

export type WaitpointType = "DELAY" | "WEBHOOK";

// PENDING: waiting. COMPLETED: resume payload stored, run not yet re-entered.
// CONSUMED: the run resumed. EXPIRED / CANCELLED: the run ended without resuming.
export type WaitpointStatus =
  | "PENDING"
  | "COMPLETED"
  | "CONSUMED"
  | "EXPIRED"
  | "CANCELLED";

// Who may resolve a WEBHOOK waitpoint from the editor, and how it renders there.
export type WaitpointKind = "approval" | "webhook" | "delay";

export type ReasonRequiredOn = "none" | "reject" | "both";

// Set by the core "Request approval" block; null for Activepieces pieces.
export interface ApprovalRequest {
  title: string;
  // Markdown, rendered once when the run paused.
  body: string | null;
  approveLabel: string;
  rejectLabel: string;
  reasonRequiredOn: ReasonRequiredOn;
  // DIDs allowed to decide; empty means anyone with write access.
  approvers: string[];
}

// Matches Activepieces' ResumePayload, so a piece reads the same shape
// whichever route resumed it.
export interface WaitpointResumePayload {
  body?: unknown;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
}

// A resume link's confirm page: only what anyone holding the link may see.
export interface WaitpointDescription {
  workflowName: string;
  stepName: string;
  status: WaitpointStatus;
  workflowDescription?: string;
  // The action's display name, e.g. "Create Approval Links".
  actionName?: string;
  waitingSince: string;
  expiresAt?: string;
  startedAt?: string;
  triggerName?: string;
}

export interface WaitpointRecord {
  id: string;
  runId: string;
  workflowId: string;
  stepId: string;
  stepKey: string;
  // Full step path, e.g. "loop_1:0/step_2"; the step id outside loops.
  stepPath: string;
  pieceName: string;
  blockName: string;
  type: WaitpointType;
  kind: WaitpointKind;
  status: WaitpointStatus;
  createdAt: string;
  // DELAY only.
  resumeAt: string | null;
  // From policy.maxSuspensionDays or the block's own expiry.
  expiresAt: string | null;
  resolvedAt: string | null;
  // The resolver's DID when resolved from the editor.
  decidedBy: string | null;
  approval: ApprovalRequest | null;
}

export interface ResolveWaitpointInput {
  approved: boolean;
  reason?: string;
}

export interface WaitingRunsArgs {
  driveId?: string;
  workflowId?: string;
  first?: number;
}

// A waiting run ended because its wait expired.
export const WAITPOINT_EXPIRED_ERROR_NAME = "WaitpointExpired";
// A step that waited without a live waitpoint of its own.
export const WAITPOINT_NOT_LIVE_ERROR_NAME = "WaitpointNotLive";
