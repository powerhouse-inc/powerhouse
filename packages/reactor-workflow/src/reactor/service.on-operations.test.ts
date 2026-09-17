// A workflow document is both a registry source and a document-event source,
// so a workflow can watch powerhouse/workflow itself (e.g. status changes).
import type { OperationWithContext } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DOCUMENT_EVENT_BLOCK } from "./reactor-piece.js";
import { WorkflowRuntimeService } from "./service.js";

const WATCHER = "wf-watcher";
const OTHER = "wf-other";
const WORKFLOW_TYPE = "powerhouse/workflow";

// ENABLED workflow whose trigger watches workflow status changes.
const watcherState = {
  name: "Announce enabled workflows",
  status: "ENABLED",
  version: 1,
  trigger: {
    id: "t1",
    blockType: DOCUMENT_EVENT_BLOCK,
    config: { documentType: WORKFLOW_TYPE, actionType: "SET_WORKFLOW_STATUS" },
  },
  steps: [],
  edges: [],
  variables: [],
};

let ordinal = 0;

function op(
  documentId: string,
  documentType: string,
  actionType: string,
  input: unknown,
  resultingState?: unknown,
): OperationWithContext {
  ordinal += 1;
  return {
    operation: {
      index: ordinal,
      timestampUtcMs: `${ordinal}`,
      action: { type: actionType, input },
      resultingState: resultingState
        ? JSON.stringify(resultingState)
        : undefined,
    },
    context: {
      documentId,
      documentType,
      scope: "global",
      branch: "main",
      ordinal,
    },
  } as unknown as OperationWithContext;
}

describe("WorkflowRuntimeService.onOperations", () => {
  let service: WorkflowRuntimeService;
  let fired: { workflowId: string; payload: unknown; kind: string }[];

  beforeEach(async () => {
    service = new WorkflowRuntimeService();
    fired = [];
    vi.spyOn(service, "fire").mockImplementation(
      (workflowId: string, payload?: unknown, kind = "manual") => {
        fired.push({ workflowId, payload, kind });
        return Promise.resolve({
          runId: null,
          status: "SUCCEEDED",
          steps: [],
        } as never);
      },
    );
    // Registers the watcher; SET_WORKFLOW_NAME doesn't match its own filter.
    await service.onOperations([
      op(WATCHER, WORKFLOW_TYPE, "SET_WORKFLOW_NAME", {}, watcherState),
    ]);
    expect(fired).toHaveLength(0);
  });

  it("fires on another workflow document's matching operation", async () => {
    await service.onOperations([
      op(OTHER, WORKFLOW_TYPE, "SET_WORKFLOW_STATUS", { status: "ENABLED" }),
    ]);
    expect(fired).toHaveLength(1);
    expect(fired[0].workflowId).toBe(WATCHER);
    expect(fired[0].kind).toBe("document-event");
    expect(fired[0].payload).toMatchObject({
      documentId: OTHER,
      documentType: WORKFLOW_TYPE,
      action: { type: "SET_WORKFLOW_STATUS", input: { status: "ENABLED" } },
    });
  });

  it("ignores an operation the actionType filter rejects", async () => {
    await service.onOperations([
      op(OTHER, WORKFLOW_TYPE, "ADD_STEP", { key: "a" }),
    ]);
    expect(fired).toHaveLength(0);
  });

  it("still refreshes the registry from a workflow edit", async () => {
    // Disabling the watcher must drop it, so later operations fire nothing.
    await service.onOperations([
      op(
        WATCHER,
        WORKFLOW_TYPE,
        "SET_WORKFLOW_STATUS",
        { status: "DISABLED" },
        { ...watcherState, status: "DISABLED" },
      ),
    ]);
    fired.length = 0;
    await service.onOperations([
      op(OTHER, WORKFLOW_TYPE, "SET_WORKFLOW_STATUS", { status: "ENABLED" }),
    ]);
    expect(fired).toHaveLength(0);
  });
});
