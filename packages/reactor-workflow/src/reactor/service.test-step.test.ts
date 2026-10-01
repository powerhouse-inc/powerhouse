// Single-step testing over real workflow documents and a real piece worker:
// upstream test outputs, SET_LAST_TEST, redaction and the picker's test source.
import {
  actions,
  reducer,
  utils,
  type WorkflowDocument,
} from "@powerhousedao/workflow/document-models/workflow";
import type { Action } from "document-model";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestRelationalDb } from "../../test/helpers/pglite.js";
import { testRuntime } from "../../test/helpers/runtime.js";
import { packagePieces } from "./piece-registry.js";
import { LocalEncryptedSecretStore } from "./secret-store.js";
import type { WorkflowRuntimeService } from "./service.js";
import { CORE_PIECE_VERSION } from "../pieces/index.js";

const PIECE = "@powerhousedao/piece-step-test";
const KEY = "c".repeat(64);
const CTX = { headers: {}, db: {}, user: { address: "0xabc" } } as never;

const FIXTURE = `
export const stepTest = {
  displayName: "Step test",
  actions: {
    fetch: {
      name: "fetch",
      displayName: "Fetch",
      props: {},
      run: async () => ({ invoice: { id: "inv-1", total: 42 } }),
    },
    echo: {
      name: "echo",
      displayName: "Echo",
      props: {
        text: { displayName: "Text", type: "SHORT_TEXT", required: false },
      },
      run: async (ctx) => ({ text: ctx.propsValue.text ?? null }),
    },
    sample: {
      name: "sample",
      displayName: "Sample",
      props: {},
      run: async () => ({ via: "run" }),
      test: async () => ({ via: "test" }),
    },
    fail: {
      name: "fail",
      displayName: "Fail",
      props: {},
      run: async () => {
        throw new Error("the ledger said no");
      },
    },
  },
  triggers: {
    poll: {
      name: "poll",
      displayName: "Poll",
      type: "POLLING",
      props: {},
      test: async () => [{ name: "Ada" }, { name: "Grace" }],
    },
  },
};
`;

// A reactor client over real workflow documents: execute runs the reducer.
class Documents {
  readonly byId = new Map<string, WorkflowDocument>();

  apply(id: string, ...list: Action[]): WorkflowDocument {
    let document = this.byId.get(id) ?? utils.createDocument();
    document.header.id = id;
    for (const action of list) {
      document = reducer(document, action as never);
      const error = document.operations.global.at(-1)?.error;
      if (error) throw new Error(`${action.type}: ${error}`);
    }
    this.byId.set(id, document);
    return document;
  }

  client() {
    return {
      find: () => Promise.resolve({ results: [] }),
      get: (id: string) => {
        const document = this.byId.get(id);
        return document
          ? Promise.resolve(structuredClone(document))
          : Promise.reject(new Error(`No document ${id}`));
      },
      execute: (id: string, _branch: string, list: Action[]) =>
        Promise.resolve(this.apply(id, ...list)),
    };
  }
}

// Only EXPRESSION fields are evaluated at run time.
function expressionFields(...props: string[]) {
  return props.map((prop) => ({ prop, mode: "EXPRESSION" as const }));
}

// poll trigger → fetch-invoice → notify, notify reading both.
function invoiceWorkflow(documents: Documents, id: string) {
  return documents.apply(
    id,
    actions.setWorkflowName({ name: "Invoices" }),
    actions.setTrigger({
      id: "t1",
      pieceName: PIECE,
      pieceVersion: "1.0.0",
      triggerName: "poll",
      config: {},
    }),
    actions.addStep({
      id: "s1",
      key: "fetch-invoice",
      name: "Fetch invoice",
      pieceName: PIECE,
      pieceVersion: "1.0.0",
      actionName: "fetch",
      config: {},
    }),
    actions.addStep({
      id: "s2",
      key: "notify",
      name: "Notify",
      pieceName: PIECE,
      pieceVersion: "1.0.0",
      actionName: "echo",
      config: {
        text: "{{trigger.payload.name}} owes {{steps.fetch-invoice.output.invoice.total}}",
      },
      propertySettings: expressionFields("text"),
    }),
    actions.addEdge({ id: "e1", from: "t1", to: "s1", port: "next" }),
    actions.addEdge({ id: "e2", from: "s1", to: "s2", port: "next" }),
  );
}

describe("testStep", () => {
  let dir = "";
  let documents: Documents;
  let service: WorkflowRuntimeService;
  let secrets: LocalEncryptedSecretStore;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "ph-step-test-"));
    const entryPath = join(dir, "index.mjs");
    await writeFile(entryPath, FIXTURE);
    packagePieces.setPieces([{ name: PIECE, version: "1.0.0", entryPath }]);
    documents = new Documents();
    secrets = await LocalEncryptedSecretStore.create(createTestRelationalDb(), {
      masterKeyHex: KEY,
    });
    service = testRuntime({
      reactorClient: documents.client() as never,
      secrets,
    });
  });

  afterAll(async () => {
    service.shutdown();
    packagePieces.reset();
    await rm(dir, { recursive: true, force: true });
  });

  const stepOf = (workflowId: string, stepId: string) =>
    documents.byId
      .get(workflowId)!
      .state.global.steps.find((step) => step.id === stepId)!;

  it("runs one step against the tested outputs of the blocks it reads", async () => {
    invoiceWorkflow(documents, "wf-chain");
    await service.testTrigger("wf-chain", CTX);
    const fetched = await service.testStep("wf-chain", "s1", CTX);
    expect(fetched).toMatchObject({
      status: "SUCCEEDED",
      output: { invoice: { id: "inv-1", total: 42 } },
    });

    const result = await service.testStep("wf-chain", "s2", CTX);
    // The trigger's first sample item is the payload, as in a run.
    expect(result).toMatchObject({
      status: "SUCCEEDED",
      output: { text: "Ada owes 42" },
    });
    expect(result.runId).toBeTruthy();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();

    const store = (await service.store())!;
    expect(await store.getRun(result.runId!)).toMatchObject({
      workflow_id: "wf-chain",
      trigger_kind: "test",
      status: "SUCCEEDED",
    });
    const rows = await store.getSteps(result.runId!);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ step_id: "s2", status: "SUCCEEDED" });
    expect(JSON.parse(rows[0].input!)).toEqual({ text: "Ada owes 42" });
    expect(stepOf("wf-chain", "s2").lastTest?.runId).toBe(result.runId);
    await expect(service.rerun(result.runId!, CTX)).rejects.toThrow(
      /tested a single step or trigger/,
    );
  }, 60_000);

  it("calls the action's test method, where a run calls run", async () => {
    documents.apply(
      "wf-sample",
      actions.setWorkflowName({ name: "Sample" }),
      actions.setTrigger({
        id: "t1",
        pieceName: "@powerhousedao/piece-core",
        pieceVersion: CORE_PIECE_VERSION,
        triggerName: "manual",
        config: {},
      }),
      actions.addStep({
        id: "s1",
        key: "sample",
        name: "Sample",
        pieceName: PIECE,
        pieceVersion: "1.0.0",
        actionName: "sample",
        config: {},
      }),
      actions.addEdge({ id: "e1", from: "t1", to: "s1", port: "next" }),
    );
    expect(await service.testStep("wf-sample", "s1", CTX)).toMatchObject({
      status: "SUCCEEDED",
      output: { via: "test" },
    });

    documents.apply(
      "wf-sample",
      actions.publishWorkflow({ publishedAt: "2026-01-01T00:00:00.000Z" }),
      actions.setWorkflowStatus({ status: "ENABLED" }),
    );
    const run = await service.fire(
      "wf-sample",
      undefined,
      "manual",
      undefined,
      CTX,
    );
    expect(run.steps[0]?.output).toEqual({ via: "run" });
  }, 60_000);

  it("names the upstream step that was never tested", async () => {
    invoiceWorkflow(documents, "wf-untested");
    await service.testTrigger("wf-untested", CTX);

    const result = await service.testStep("wf-untested", "s2", CTX);
    expect(result).toEqual({
      runId: null,
      status: "FAILED",
      error: 'Test "fetch-invoice" first',
      durationMs: 0,
    });
    expect(stepOf("wf-untested", "s2").lastTest).toBeFalsy();
  }, 60_000);

  it("names the trigger when the trigger was never tested", async () => {
    invoiceWorkflow(documents, "wf-no-trigger-test");
    await service.testStep("wf-no-trigger-test", "s1", CTX);

    const result = await service.testStep("wf-no-trigger-test", "s2", CTX);
    expect(result.error).toBe("Test the trigger first");
  }, 60_000);

  it("dispatches SET_LAST_TEST for a failed test too", async () => {
    documents.apply(
      "wf-fail",
      actions.setTrigger({
        id: "t1",
        pieceName: "@powerhousedao/piece-core",
        pieceVersion: CORE_PIECE_VERSION,
        triggerName: "manual",
        config: {},
      }),
      actions.addStep({
        id: "s1",
        key: "post",
        name: "Post",
        pieceName: PIECE,
        pieceVersion: "1.0.0",
        actionName: "fail",
        config: {},
      }),
      actions.addEdge({ id: "e1", from: "t1", to: "s1", port: "next" }),
    );

    const result = await service.testStep("wf-fail", "s1", CTX);
    expect(result.status).toBe("FAILED");
    expect(result.error).toContain("the ledger said no");
    expect(result.output).toBeUndefined();

    const lastTest = stepOf("wf-fail", "s1").lastTest;
    expect(lastTest?.runId).toBe(result.runId);
    const store = (await service.store())!;
    expect((await store.getRun(result.runId!))?.status).toBe("FAILED");
    const [row] = await store.getSteps(result.runId!);
    expect(row).toMatchObject({ step_id: "s1", status: "FAILED" });

    // A failed upstream test is no sample for a step reading its output.
    documents.apply(
      "wf-fail",
      actions.addStep({
        id: "s2",
        key: "after",
        name: "After",
        pieceName: PIECE,
        pieceVersion: "1.0.0",
        actionName: "echo",
        config: { text: "{{steps.post.output}}" },
        propertySettings: expressionFields("text"),
      }),
      actions.addEdge({ id: "e2", from: "s1", to: "s2", port: "next" }),
    );
    expect((await service.testStep("wf-fail", "s2", CTX)).error).toBe(
      'Test "post" first: its last test failed',
    );
  }, 60_000);

  it("redacts a secret variable in the test run and refuses to replay it", async () => {
    const plaintext = "sk-live-4c1d7e9a2b";
    const { ref } = await secrets.create({ value: plaintext, label: "api" });
    documents.apply(
      "wf-secret",
      actions.setTrigger({
        id: "t1",
        pieceName: "@powerhousedao/piece-core",
        pieceVersion: CORE_PIECE_VERSION,
        triggerName: "manual",
        config: {},
      }),
      actions.setVariable({
        id: "v1",
        key: "token",
        value: ref,
        type: "SECRET",
      }),
      actions.addStep({
        id: "s1",
        key: "auth",
        name: "Auth",
        pieceName: PIECE,
        pieceVersion: "1.0.0",
        actionName: "echo",
        config: { text: "Bearer {{variables.token}}" },
        propertySettings: expressionFields("text"),
      }),
      actions.addStep({
        id: "s2",
        key: "call",
        name: "Call",
        pieceName: PIECE,
        pieceVersion: "1.0.0",
        actionName: "echo",
        config: { text: "{{steps.auth.output.text}}" },
        propertySettings: expressionFields("text"),
      }),
      actions.addEdge({ id: "e1", from: "t1", to: "s1", port: "next" }),
      actions.addEdge({ id: "e2", from: "s1", to: "s2", port: "next" }),
    );

    const result = await service.testStep("wf-secret", "s1", CTX);
    expect(result).toMatchObject({
      status: "SUCCEEDED",
      output: { text: "Bearer [redacted:secret]" },
    });
    const store = (await service.store())!;
    const journal = JSON.stringify([
      await store.getRun(result.runId!),
      await store.getSteps(result.runId!),
    ]);
    expect(journal).not.toContain(plaintext);
    expect(journal).toContain("[redacted:secret]");
    expect(JSON.stringify(documents.byId.get("wf-secret"))).not.toContain(
      plaintext,
    );

    expect((await service.testStep("wf-secret", "s2", CTX)).error).toBe(
      '"call" reads a value redacted from the last test of "auth"',
    );
  }, 60_000);

  it("serves the output tree from a block's latest test", async () => {
    invoiceWorkflow(documents, "wf-tree");
    // The fixture declares no output schema, so nothing until a test.
    expect(await service.stepOutputTree("wf-tree", "s1", CTX)).toEqual({
      source: "none",
      nodes: [],
    });

    await service.testTrigger("wf-tree", CTX);
    await service.testStep("wf-tree", "s1", CTX);

    const tree = await service.stepOutputTree("wf-tree", "s1", CTX);
    expect(tree).toMatchObject({
      source: "test",
      sample: { invoice: { id: "inv-1", total: 42 } },
      testedAt: stepOf("wf-tree", "s1").lastTest?.testedAt,
      runId: stepOf("wf-tree", "s1").lastTest?.runId,
    });
    expect(tree.nodes).toEqual([
      {
        name: "invoice",
        type: "object",
        children: [
          { name: "id", type: "string" },
          { name: "total", type: "number" },
        ],
      },
    ]);
    const trigger = await service.stepOutputTree("wf-tree", "t1", CTX);
    expect(trigger).toMatchObject({ source: "test", sample: { name: "Ada" } });
  }, 60_000);

  it("refuses a caller without an authenticated request", async () => {
    invoiceWorkflow(documents, "wf-anon");
    await expect(service.testStep("wf-anon", "s1")).rejects.toThrow(
      "authenticated request",
    );
    await expect(service.stepOutputTree("wf-anon", "s1")).rejects.toThrow(
      "authenticated request",
    );
  });
});
