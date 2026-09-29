// The runtime over documents built by the real workflow reducer: the published
// snapshot runs, skip, DYNAMIC children, typed variables and lastTest.
import {
  actions,
  reducer,
  utils,
  type WorkflowDocument,
} from "@powerhousedao/workflow/document-models/workflow";
import type { Action, OperationWithContext } from "document-model";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestRelationalDb } from "../../test/helpers/pglite.js";
import { testRuntime } from "../../test/helpers/runtime.js";
import { packagePieces } from "./piece-registry.js";
import { coreTrigger } from "./core-blocks.js";
import { LocalEncryptedSecretStore } from "./secret-store.js";
import type { WorkflowRuntimeService } from "./service.js";
import { configHash } from "./trigger-supervisor.js";
import { CORE_PIECE_NAME, CORE_PIECE_VERSION } from "../pieces/index.js";

const PIECE = "@powerhousedao/piece-model-v2";
const ECHO = { pieceName: PIECE, pieceVersion: "1.0.0", actionName: "echo" };
const KEY = "b".repeat(64);
const CTX = { headers: {}, db: {}, user: { address: "0xabc" } } as never;

const FIXTURE = `
export const modelV2 = {
  displayName: "Model v2",
  actions: {
    echo: {
      name: "echo",
      displayName: "Echo",
      props: {
        text: { displayName: "Text", type: "SHORT_TEXT", required: false },
      },
      run: async (ctx) => ({ text: ctx.propsValue.text ?? null }),
    },
  },
  triggers: {
    poll: {
      name: "poll",
      displayName: "Poll",
      type: "POLLING",
      props: {},
      test: async () => [{ sample: true }],
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

let ordinal = 0;

// The operation the read model hands the runtime for a workflow edit.
function workflowOp(id: string, document: WorkflowDocument) {
  ordinal += 1;
  return {
    operation: {
      index: ordinal,
      timestampUtcMs: `${ordinal}`,
      action: { type: "EDIT", input: {} },
      resultingState: JSON.stringify(document.state.global),
    },
    context: {
      documentId: id,
      documentType: "powerhouse/workflow",
      scope: "global",
      branch: "main",
      ordinal,
    },
  } as unknown as OperationWithContext;
}

const PUBLISHED_AT = "2026-09-28T10:00:00.000Z";

// Only EXPRESSION fields are evaluated at run time.
function expressionFields(...props: string[]) {
  return props.map((prop) => ({ prop, mode: "EXPRESSION" as const }));
}

function manualWorkflow(documents: Documents, id: string, text: string) {
  return documents.apply(
    id,
    actions.setWorkflowName({ name: "Model v2" }),
    actions.setTrigger({
      id: "t1",
      pieceName: "@powerhousedao/piece-core",
      pieceVersion: CORE_PIECE_VERSION,
      triggerName: "manual",
      config: {},
    }),
    actions.addStep({
      id: "s1",
      key: "echo",
      name: "Echo",
      ...ECHO,
      config: { text },
    }),
    actions.addEdge({ id: "e1", from: "t1", to: "s1", port: "next" }),
    actions.publishWorkflow({ publishedAt: PUBLISHED_AT }),
    actions.setWorkflowStatus({ status: "ENABLED" }),
  );
}

describe("the runtime and the workflow model's publishing fields", () => {
  let dir = "";
  let documents: Documents;
  let service: WorkflowRuntimeService;
  let secrets: LocalEncryptedSecretStore;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "ph-model-v2-"));
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

  const fire = (id: string) =>
    service.fire(id, undefined, "manual", undefined, CTX);

  it("runs the published snapshot, not a later draft edit", async () => {
    manualWorkflow(documents, "wf-pub", "published");
    documents.apply(
      "wf-pub",
      actions.publishWorkflow({ publishedAt: PUBLISHED_AT }),
    );
    const edited = documents.apply(
      "wf-pub",
      actions.setStepConfig({ id: "s1", config: { text: "draft" } }),
    );
    const publishedVersion = edited.state.global.published!.version;
    expect(edited.state.global.version).toBeGreaterThan(publishedVersion);

    const result = await fire("wf-pub");
    expect(result.status).toBe("SUCCEEDED");
    expect(result.steps[0]?.output).toEqual({ text: "published" });
    const row = await (await service.store())!.getRun(result.runId!);
    expect(row?.workflow_version).toBe(publishedVersion);
  }, 60_000);

  it("runs the draft of a document with none of the new fields", async () => {
    const state = structuredClone(
      manualWorkflow(documents, "wf-legacy", "draft").state.global,
    ) as unknown as Record<string, unknown>;
    // As an older document reads: none of the fields this model added.
    delete state.published;
    for (const step of state.steps as Record<string, unknown>[]) {
      for (const field of ["propertySettings", "lastTest", "skip"])
        delete step[field];
    }
    const trigger = state.trigger as Record<string, unknown>;
    for (const field of ["propertySettings", "lastTest"]) delete trigger[field];
    documents.byId.get("wf-legacy")!.state.global = state as never;

    const result = await fire("wf-legacy");
    expect(result.status).toBe("SUCCEEDED");
    expect(result.steps[0]?.output).toEqual({ text: "draft" });
    const row = await (await service.store())!.getRun(result.runId!);
    expect(row?.workflow_version).toBe(state.version);
  }, 60_000);

  it("passes over a skipped step along its next edge", async () => {
    documents.apply(
      "wf-skip",
      actions.setTrigger({
        id: "t1",
        pieceName: "@powerhousedao/piece-core",
        pieceVersion: CORE_PIECE_VERSION,
        triggerName: "manual",
        config: {},
      }),
      actions.addStep({
        id: "a",
        key: "a",
        name: "A",
        pieceName: "@powerhousedao/piece-core",
        pieceVersion: CORE_PIECE_VERSION,
        actionName: "assert",
        config: { value: "" },
        skip: true,
      }),
      actions.addStep({
        id: "b",
        key: "b",
        name: "B",
        pieceName: "@powerhousedao/piece-core",
        pieceVersion: CORE_PIECE_VERSION,
        actionName: "branch",
        config: { operator: "DOES_NOT_EXIST", left: "{{steps.a.output}}" },
        propertySettings: expressionFields("left"),
      }),
      actions.addEdge({ id: "e1", from: "t1", to: "a", port: "next" }),
      actions.addEdge({ id: "e2", from: "a", to: "b", port: "next" }),
      actions.publishWorkflow({ publishedAt: PUBLISHED_AT }),
      actions.setWorkflowStatus({ status: "ENABLED" }),
    );
    const result = await fire("wf-skip");
    // The core assert on "" would have failed the run had it executed.
    expect(result.status).toBe("SUCCEEDED");
    expect(result.steps[0]).toMatchObject({
      key: "a",
      status: "SKIPPED",
      output: null,
      port: "next",
    });
    expect(result.steps[1]).toMatchObject({
      key: "b",
      status: "SUCCEEDED",
      output: { operator: "DOES_NOT_EXIST", left: null, result: true },
    });
    const rows = await (await service.store())!.getSteps(result.runId!);
    expect(rows.map((row) => [row.step_key, row.status])).toEqual([
      ["a", "SKIPPED"],
      ["b", "SUCCEEDED"],
    ]);
  }, 60_000);

  it("fails a step whose DYNAMIC value lacks required children", async () => {
    manualWorkflow(documents, "wf-dynamic", "x");
    documents.apply(
      "wf-dynamic",
      actions.setStepConfig({
        id: "s1",
        config: { text: "x", fields: { body: "hi" } },
        propertySettings: [
          {
            prop: "fields",
            mode: "MANUAL",
            schema: {
              title: {
                displayName: "Title",
                type: "SHORT_TEXT",
                required: true,
              },
              due: { displayName: "Due", type: "DATE_TIME", required: true },
              body: { displayName: "Body", type: "LONG_TEXT", required: false },
            },
          },
        ],
      }),
      actions.publishWorkflow({ publishedAt: PUBLISHED_AT }),
    );
    const result = await fire("wf-dynamic");
    expect(result.status).toBe("FAILED");
    expect(result.steps[0]?.status).toBe("FAILED");
    expect(result.steps[0]?.error).toBe(
      'Property "fields" is missing required fields: Title (title), Due (due)',
    );
    // Refused before the piece ran.
    expect(result.steps[0]?.output).toBeUndefined();
  }, 60_000);

  it("coerces NUMBER and JSON variables when the run starts", async () => {
    documents.apply(
      "wf-typed",
      actions.setTrigger({
        id: "t1",
        pieceName: "@powerhousedao/piece-core",
        pieceVersion: CORE_PIECE_VERSION,
        triggerName: "manual",
        config: {},
      }),
      actions.setVariable({ id: "v1", key: "n", value: "42", type: "NUMBER" }),
      actions.setVariable({
        id: "v2",
        key: "j",
        value: '{"a":[1,2]}',
        type: "JSON",
      }),
      actions.setVariable({ id: "v3", key: "raw", value: "42" }),
      actions.addStep({
        id: "a",
        key: "a",
        name: "A",
        pieceName: "@powerhousedao/piece-core",
        pieceVersion: CORE_PIECE_VERSION,
        actionName: "branch",
        config: {
          operator: "EXISTS",
          left: {
            n: "{{variables.n}}",
            j: "{{variables.j}}",
            raw: "{{variables.raw}}",
          },
        },
        propertySettings: expressionFields("left"),
      }),
      actions.addEdge({ id: "e1", from: "t1", to: "a", port: "next" }),
      actions.publishWorkflow({ publishedAt: PUBLISHED_AT }),
      actions.setWorkflowStatus({ status: "ENABLED" }),
    );
    const result = await fire("wf-typed");
    expect(result.status).toBe("SUCCEEDED");
    expect(result.steps[0]?.output).toMatchObject({
      left: { n: 42, j: { a: [1, 2] }, raw: "42" },
    });
  }, 60_000);

  it("fails the run on a NUMBER variable that is not a number", async () => {
    documents.apply(
      "wf-nan",
      actions.setTrigger({
        id: "t1",
        pieceName: "@powerhousedao/piece-core",
        pieceVersion: CORE_PIECE_VERSION,
        triggerName: "manual",
        config: {},
      }),
      actions.setVariable({ id: "v1", key: "n", value: "abc", type: "NUMBER" }),
      actions.publishWorkflow({ publishedAt: PUBLISHED_AT }),
      actions.setWorkflowStatus({ status: "ENABLED" }),
    );
    await expect(fire("wf-nan")).rejects.toThrow(
      'Variable "n" is a NUMBER, but its value "abc" is not a number',
    );
    const [row] = await (await service.store())!.listRuns("wf-nan", 1);
    expect(row.status).toBe("FAILED");
  }, 60_000);

  it("resolves a SECRET variable for the run and keeps it out of the journal", async () => {
    const plaintext = "sk-live-7f3a9c1e5b2d";
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
        id: "a",
        key: "a",
        name: "A",
        pieceName: "@powerhousedao/piece-core",
        pieceVersion: CORE_PIECE_VERSION,
        actionName: "branch",
        config: {
          operator: "TEXT_EXACTLY_MATCHES",
          left: "{{variables.token}}",
          right: "{{variables.token}}",
          caseSensitive: true,
        },
        propertySettings: expressionFields("left", "right"),
      }),
      actions.addStep({
        id: "b",
        key: "b",
        name: "B",
        ...ECHO,
        config: { text: "Bearer {{variables.token}}" },
        propertySettings: expressionFields("text"),
      }),
      actions.addEdge({ id: "e1", from: "t1", to: "a", port: "next" }),
      actions.addEdge({ id: "e2", from: "a", to: "b", port: "true" }),
      actions.publishWorkflow({ publishedAt: PUBLISHED_AT }),
      actions.setWorkflowStatus({ status: "ENABLED" }),
    );
    const result = await fire("wf-secret");
    // The redacted echo shows the piece was handed the plaintext.
    expect(result.status).toBe("SUCCEEDED");
    expect(result.steps.map((step) => [step.key, step.status])).toEqual([
      ["a", "SUCCEEDED"],
      ["b", "SUCCEEDED"],
    ]);
    expect(result.steps[0]?.port).toBe("true");
    expect(result.steps[1]?.output).toEqual({
      text: "Bearer [redacted:secret]",
    });

    const store = (await service.store())!;
    const journal = JSON.stringify([
      await store.getRun(result.runId!),
      await store.getSteps(result.runId!),
    ]);
    expect(journal).not.toContain(plaintext);
    expect(journal).toContain("[redacted:secret]");
    expect(JSON.stringify(result)).not.toContain(plaintext);
    expect(JSON.stringify(documents.byId.get("wf-secret"))).not.toContain(
      plaintext,
    );
  }, 60_000);

  it("records a trigger test as a run and dispatches SET_LAST_TEST", async () => {
    documents.apply(
      "wf-test",
      actions.setTrigger({
        id: "t1",
        pieceName: PIECE,
        pieceVersion: "1.0.0",
        triggerName: "poll",
        config: {},
      }),
    );
    const output = await service.testTrigger("wf-test", CTX);
    expect(output).toEqual([{ sample: true }]);

    const lastTest =
      documents.byId.get("wf-test")!.state.global.trigger?.lastTest;
    expect(lastTest?.runId).toBeTruthy();
    const store = (await service.store())!;
    const run = await store.getRun(lastTest!.runId);
    expect(run).toMatchObject({
      workflow_id: "wf-test",
      trigger_kind: "test",
      status: "SUCCEEDED",
    });
    const [step] = await store.getSteps(lastTest!.runId);
    expect(step.step_id).toBe("t1");
    expect(JSON.parse(step.output!)).toEqual([{ sample: true }]);
  }, 60_000);

  it("fails a trigger test on missing DYNAMIC children and still records it", async () => {
    documents.apply(
      "wf-test-dynamic",
      actions.setTrigger({
        id: "t1",
        pieceName: PIECE,
        pieceVersion: "1.0.0",
        triggerName: "poll",
        config: { filters: {} },
        propertySettings: [
          {
            prop: "filters",
            mode: "MANUAL",
            schema: { tag: { displayName: "Tag", required: true } },
          },
        ],
      }),
    );
    await expect(service.testTrigger("wf-test-dynamic", CTX)).rejects.toThrow(
      'Property "filters" is missing required fields: Tag (tag)',
    );
    const lastTest =
      documents.byId.get("wf-test-dynamic")!.state.global.trigger?.lastTest;
    const run = await (await service.store())!.getRun(lastTest!.runId);
    expect(run?.status).toBe("FAILED");
  }, 60_000);

  it("re-arms a trigger on publish, not on a draft edit", async () => {
    const hashOf = async () =>
      (await (await service.store())!.getTriggerState("wf-arm"))?.config_hash;
    const upsert = vi.spyOn(service.supervisor(), "upsert");
    const hourly = { mode: "cron", cron: "0 * * * *" };
    const daily = { mode: "cron", cron: "0 0 * * *" };

    let document = documents.apply(
      "wf-arm",
      actions.setTrigger({
        id: "t1",
        pieceName: CORE_PIECE_NAME,
        pieceVersion: CORE_PIECE_VERSION,
        triggerName: "schedule",
        config: hourly,
      }),
      actions.publishWorkflow({ publishedAt: PUBLISHED_AT }),
      actions.setWorkflowStatus({ status: "ENABLED" }),
    );
    await service.onOperations([workflowOp("wf-arm", document)]);
    await vi.waitFor(async () =>
      expect(await hashOf()).toBe(configHash(coreTrigger("schedule"), hourly)),
    );
    expect(upsert).toHaveBeenCalledTimes(1);

    document = documents.apply(
      "wf-arm",
      actions.setTrigger({
        id: "t1",
        pieceName: CORE_PIECE_NAME,
        pieceVersion: CORE_PIECE_VERSION,
        triggerName: "schedule",
        config: daily,
      }),
    );
    await service.onOperations([workflowOp("wf-arm", document)]);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(await hashOf()).toBe(configHash(coreTrigger("schedule"), hourly));

    document = documents.apply(
      "wf-arm",
      actions.publishWorkflow({ publishedAt: PUBLISHED_AT }),
    );
    await service.onOperations([workflowOp("wf-arm", document)]);
    await vi.waitFor(async () =>
      expect(await hashOf()).toBe(configHash(coreTrigger("schedule"), daily)),
    );
    expect(upsert).toHaveBeenCalledTimes(2);
  }, 60_000);
});
