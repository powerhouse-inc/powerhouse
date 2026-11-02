// A PENDING approval waitpoint as the runtime serves it, for the studio's tests.
import type { WaitpointRecord } from "../editors/workflow-editor/runtime-client.js";

export const waitpointRecord = (
  overrides: Partial<WaitpointRecord> = {},
): WaitpointRecord => ({
  id: "wp-1",
  runId: "run-1",
  workflowId: "wf-1",
  stepId: "s1",
  stepKey: "ask",
  stepPath: "s1",
  pieceName: "@powerhousedao/piece-core",
  blockName: "request_approval",
  type: "WEBHOOK",
  kind: "approval",
  status: "PENDING",
  createdAt: "2026-10-14T10:00:00.000Z",
  resumeAt: null,
  expiresAt: null,
  resolvedAt: null,
  decidedBy: null,
  approval: null,
  ...overrides,
});
