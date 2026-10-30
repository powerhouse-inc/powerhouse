// The manual trigger's inputs: a fire's payload is checked and coerced against
// the published trigger, and the picker reads their types before any run.
import { actions } from "@powerhousedao/workflow/document-models/workflow";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Documents } from "../../test/helpers/documents.js";
import { testRuntime } from "../../test/helpers/runtime.js";
import { CORE_PIECE_NAME, CORE_PIECE_VERSION } from "../pieces/index.js";
import type { WorkflowRuntimeService } from "./service.js";

const CTX = { headers: {}, db: {}, user: { address: "0xabc" } } as never;
const PUBLISHED_AT = "2026-10-28T10:00:00.000Z";

const INPUTS = [
  { displayName: "Email", name: "email", type: "text", required: true },
  { displayName: "Amount", name: "amount", type: "number", required: true },
  { displayName: "Urgent", name: "urgent", type: "toggle", required: false },
  { displayName: "Due", name: "due", type: "date", required: false },
  {
    displayName: "Tier",
    name: "tier",
    type: "dropdown",
    options: "gold\nsilver",
    defaultValue: "silver",
  },
  { displayName: "Meta", name: "meta", type: "json" },
];

describe("manual trigger inputs", () => {
  let documents: Documents;
  let service: WorkflowRuntimeService;

  beforeAll(() => {
    documents = new Documents();
    service = testRuntime({ reactorClient: documents.client() as never });
    documents.apply(
      "wf-inputs",
      actions.setTrigger({
        id: "t1",
        pieceName: CORE_PIECE_NAME,
        pieceVersion: CORE_PIECE_VERSION,
        triggerName: "manual",
        config: { inputs: INPUTS },
      }),
      actions.addStep({
        id: "a",
        key: "check",
        name: "Check",
        pieceName: CORE_PIECE_NAME,
        pieceVersion: CORE_PIECE_VERSION,
        actionName: "assert",
        config: { value: "{{trigger.payload.email}}" },
      }),
      actions.addEdge({ id: "e1", from: "t1", to: "a", port: "next" }),
      actions.publishWorkflow({ publishedAt: PUBLISHED_AT }),
      actions.setWorkflowStatus({ status: "ENABLED" }),
    );
  });

  afterAll(() => {
    service.shutdown();
  });

  const runCount = async () =>
    (await (await service.store())!.listRuns("wf-inputs", 100)).length;

  it("refuses a payload missing a required field or of the wrong type, without a run", async () => {
    const refusal = service.fire(
      "wf-inputs",
      { amount: "lots", tier: "bronze" },
      "manual",
      undefined,
      CTX,
    );
    await expect(refusal).rejects.toThrow(/"email"/);
    await expect(refusal).rejects.toThrow(/"amount"/);
    await expect(refusal).rejects.toThrow(/"tier"/);
    await expect(
      service.fire("wf-inputs", [1, 2], "manual", undefined, CTX),
    ).rejects.toThrow(/JSON object/);
    expect(await runCount()).toBe(0);
  });

  it("coerces a valid payload and runs on the typed values", async () => {
    const result = await service.fire(
      "wf-inputs",
      {
        email: "a@b.c",
        amount: "1250",
        urgent: "TRUE",
        due: "2026-11-01",
        meta: { tags: ["x"] },
        extra: "kept",
      },
      "manual",
      undefined,
      CTX,
    );
    expect(result.status).toBe("SUCCEEDED");
    const row = (await (await service.store())!.getRun(result.runId!))!;
    expect(JSON.parse(row.trigger_payload!)).toEqual({
      email: "a@b.c",
      amount: 1250,
      urgent: true,
      due: "2026-11-01T00:00:00.000Z",
      tier: "silver",
      meta: { tags: ["x"] },
      extra: "kept",
    });
    expect(result.steps[0]?.output).toEqual({ value: "a@b.c" });
  });

  it("leaves a scheduled or webhook firing alone", async () => {
    documents.apply(
      "wf-inputs-webhook",
      actions.setTrigger({
        id: "t1",
        pieceName: CORE_PIECE_NAME,
        pieceVersion: CORE_PIECE_VERSION,
        triggerName: "manual",
        config: { inputs: INPUTS },
      }),
      actions.publishWorkflow({ publishedAt: PUBLISHED_AT }),
      actions.setWorkflowStatus({ status: "ENABLED" }),
    );
    const result = await service.fire(
      "wf-inputs-webhook",
      { anything: true },
      "webhook",
    );
    expect(result.status).toBe("SUCCEEDED");
  });

  // output-tree.test.ts covers the types; this checks the runtime serves them.
  it("types trigger.payload from the inputs before any run", async () => {
    const tree = await service.blockOutputTree(
      {
        pieceName: CORE_PIECE_NAME,
        pieceVersion: CORE_PIECE_VERSION,
        kind: "trigger",
        name: "manual",
      },
      { inputs: INPUTS },
    );
    expect(tree.source).toBe("static");
    expect(tree.nodes.map((node) => node.name)).toEqual(
      INPUTS.map((input) => input.name),
    );
  });
});
