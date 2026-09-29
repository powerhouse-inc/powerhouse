// A pinned reactor-piece trigger is still the host's to fire: its version is
// not part of its identity, so it must never fall to the supervised poll path.
import type { OperationWithContext } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { REACTOR_PIECE } from "./reactor-piece.js";
import type { WorkflowRuntimeService } from "./service.js";
import { testRuntime } from "../../test/helpers/runtime.js";

const WORKFLOW_TYPE = "powerhouse/workflow";
const reactorTrigger = (name: string, pieceVersion: string) => ({
  pieceName: REACTOR_PIECE,
  pieceVersion,
  kind: "trigger" as const,
  name,
});

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

function watcher(name: string) {
  return {
    name,
    status: "ENABLED",
    version: 1,
    trigger: {
      id: "t1",
      pieceName: REACTOR_PIECE,
      pieceVersion: "6.2.3-dev.27",
      triggerName: "document-event",
      config: { documentType: "powerhouse/note", actionType: "SET_TITLE" },
    },
    steps: [],
    edges: [],
    variables: [],
  };
}

describe("a pinned reactor document-event trigger", () => {
  let service: WorkflowRuntimeService | undefined;

  afterEach(() => {
    service?.shutdown();
  });

  it("is fed by the host and fires, with no supervised trigger row", async () => {
    const workflowId = `wf-pinned-${Date.now()}`;
    const state = watcher("Pinned watcher");
    service = testRuntime({
      reactorClient: {
        find: () => Promise.resolve({ results: [] }),
        get: (id: string) =>
          Promise.resolve({
            header: { id, documentType: WORKFLOW_TYPE },
            state: { global: state },
          }),
      },
    } as never);

    await service.onOperations([
      op(workflowId, WORKFLOW_TYPE, "SET_WORKFLOW_NAME", {}, state),
    ]);
    await service.onOperations([
      op("doc-subject", "powerhouse/note", "SET_TITLE", { title: "hi" }),
    ]);

    const store = (await service.store())!;
    await vi.waitFor(
      async () => {
        const runs = await store.listRuns(workflowId);
        expect(runs).toHaveLength(1);
        expect(runs[0]).toMatchObject({
          trigger_kind: "document-event",
          status: "SUCCEEDED",
        });
        expect(JSON.parse(runs[0].trigger_payload!)).toMatchObject({
          documentId: "doc-subject",
          action: { type: "SET_TITLE", input: { title: "hi" } },
        });
      },
      { timeout: 10_000 },
    );
    // Polled, it would have been bound by the supervisor and left a row there.
    expect(await store.getTriggerState(workflowId)).toBeUndefined();
  });

  it("has the same output tree at any version", async () => {
    service = testRuntime();

    const tree = await service.blockOutputTree(
      reactorTrigger("document-created", "1.0.0"),
    );

    expect(tree.source).toBe("static");
    expect(tree).toEqual(
      await service.blockOutputTree(
        reactorTrigger("document-created", "6.2.3-dev.27"),
      ),
    );
  });
});
