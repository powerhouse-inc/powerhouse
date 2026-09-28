// An edge on a port its source never emits is never taken. The run still
// finishes, but it carries a warning rather than reading as a plain success.
import { actions } from "@powerhousedao/workflow/document-models/workflow";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Documents } from "../../test/helpers/documents.js";
import { testRuntime } from "../../test/helpers/runtime.js";
import type { WorkflowRuntimeService } from "./service.js";
import {
  blockPorts,
  CORE_PIECE_NAME,
  CORE_PIECE_VERSION,
} from "../pieces/index.js";

const CTX = { headers: {}, db: {}, user: { address: "0xabc" } } as never;
const PUBLISHED_AT = "2026-09-28T10:00:00.000Z";

describe("edges on undeclared ports", () => {
  let documents: Documents;
  let service: WorkflowRuntimeService;

  beforeAll(() => {
    documents = new Documents();
    service = testRuntime({ reactorClient: documents.client() as never });
  });

  afterAll(() => {
    service.shutdown();
  });

  it("declares what each kind of block leaves on", () => {
    const core = (kind: "action" | "trigger", name: string) => ({
      pieceName: CORE_PIECE_NAME,
      kind,
      name,
    });
    expect(blockPorts(core("action", "branch"))).toEqual([
      "true",
      "false",
      "error",
    ]);
    expect(blockPorts(core("action", "assert"))).toEqual(["next", "error"]);
    expect(blockPorts(core("trigger", "manual"))).toEqual(["next"]);
    expect(
      blockPorts({ pieceName: "@acme/piece-x", kind: "action", name: "send" }),
    ).toEqual(["next", "error"]);
    expect(blockPorts(core("action", "nonsense"))).toBeUndefined();
  });

  it("warns about a branch wired on next, and the steps behind it never run", async () => {
    documents.apply(
      "wf-dead-port",
      actions.setTrigger({
        id: "t1",
        pieceName: "@powerhousedao/piece-core",
        pieceVersion: CORE_PIECE_VERSION,
        triggerName: "manual",
        config: {},
      }),
      actions.addStep({
        id: "b",
        key: "check",
        name: "Check",
        pieceName: "@powerhousedao/piece-core",
        pieceVersion: CORE_PIECE_VERSION,
        actionName: "branch",
        config: { operator: "EXISTS", left: "x" },
      }),
      actions.addStep({
        id: "a",
        key: "after",
        name: "After",
        pieceName: "@powerhousedao/piece-core",
        pieceVersion: CORE_PIECE_VERSION,
        actionName: "assert",
        config: { value: "ok" },
      }),
      actions.addEdge({ id: "e1", from: "t1", to: "b", port: "next" }),
      actions.addEdge({ id: "e2", from: "b", to: "a", port: "next" }),
      actions.publishWorkflow({ publishedAt: PUBLISHED_AT }),
      actions.setWorkflowStatus({ status: "ENABLED" }),
    );

    const result = await service.fire(
      "wf-dead-port",
      undefined,
      "manual",
      undefined,
      CTX,
    );

    expect(result.steps.map((step) => [step.key, step.status])).toEqual([
      ["check", "SUCCEEDED"],
      ["after", "SKIPPED"],
    ]);
    const row = (await (await service.store())!.getRun(result.runId!))!;
    expect(row.status).toBe("SUCCEEDED");
    expect(row.warnings).toBe(1);
    expect(JSON.parse(row.warning_notes!)).toEqual([
      `Edge from "check" to "after" leaves on port "next", which ${CORE_PIECE_NAME}@${CORE_PIECE_VERSION} action "branch" never takes`,
    ]);
  }, 60_000);

  it("adds nothing for a graph on declared ports", async () => {
    documents.apply(
      "wf-live-port",
      actions.setTrigger({
        id: "t1",
        pieceName: "@powerhousedao/piece-core",
        pieceVersion: CORE_PIECE_VERSION,
        triggerName: "manual",
        config: {},
      }),
      actions.addStep({
        id: "b",
        key: "check",
        name: "Check",
        pieceName: "@powerhousedao/piece-core",
        pieceVersion: CORE_PIECE_VERSION,
        actionName: "branch",
        config: { operator: "EXISTS", left: "x" },
      }),
      actions.addEdge({ id: "e1", from: "t1", to: "b", port: "next" }),
      actions.publishWorkflow({ publishedAt: PUBLISHED_AT }),
      actions.setWorkflowStatus({ status: "ENABLED" }),
    );
    const result = await service.fire(
      "wf-live-port",
      undefined,
      "manual",
      undefined,
      CTX,
    );
    const row = (await (await service.store())!.getRun(result.runId!))!;
    expect(row.warnings).toBe(0);
    expect(row.warning_notes).toBeNull();
  }, 60_000);
});
