// Deleting an enabled workflow disarms it as disabling does, and takes its
// trigger row and webhook token with it, so a restart has nothing to re-arm.
import type { OperationWithContext } from "document-model";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createTestRelationalDb } from "../../test/helpers/pglite.js";
import { testRuntime } from "../../test/helpers/runtime.js";
import { memoryWebhooks } from "../../test/helpers/webhooks.js";
import { packagePieces } from "./piece-registry.js";
import { PROJECT_SCOPE_KEY, testPartitionKey } from "./piece-store-port.js";
import type { WorkflowRuntimeService } from "./service.js";
import { WorkflowTriggersReadModel } from "./workflow-triggers-read-model.js";

const PIECE = "@acme/piece-deletable";
const WORKFLOW_TYPE = "powerhouse/workflow";

// onDisable leaves a PROJECT-scoped mark: the FLOW partition is dropped with
// the workflow, so it could not prove the hook ran.
const FIXTURE = `
export const deletable = {
  displayName: "Deletable",
  actions: {},
  triggers: {
    hook: {
      name: "hook",
      displayName: "Hook",
      type: "WEBHOOK",
      props: {},
      onEnable: async (ctx) => { await ctx.store.put("subscribed", ctx.webhookUrl); },
      onDisable: async (ctx) => { await ctx.store.put("released", true, "PROJECT"); },
      run: async (ctx) => (ctx.payload ? [ctx.payload] : []),
    },
    poll: {
      name: "poll",
      displayName: "Poll",
      type: "POLLING",
      props: {},
      onEnable: async () => undefined,
      onDisable: async () => undefined,
      run: async () => [{ id: Date.now() }],
      test: async () => [],
    },
  },
};
`;

let ordinal = 0;

function publish(
  workflowId: string,
  triggerName: string,
): OperationWithContext {
  ordinal += 1;
  const state = {
    name: workflowId,
    status: "ENABLED",
    version: 1,
    trigger: {
      id: "t1",
      pieceName: PIECE,
      pieceVersion: "1.0.0",
      triggerName,
      config: {},
    },
    steps: [],
    edges: [],
    variables: [],
  };
  return {
    operation: {
      index: ordinal,
      timestampUtcMs: `${ordinal}`,
      action: { type: "SET_WORKFLOW_STATUS", input: {} },
      resultingState: JSON.stringify(state),
    },
    context: {
      documentId: workflowId,
      documentType: WORKFLOW_TYPE,
      scope: "global",
      branch: "main",
      ordinal,
    },
  } as unknown as OperationWithContext;
}

function deletion(workflowId: string): OperationWithContext {
  ordinal += 1;
  return {
    operation: {
      index: ordinal,
      timestampUtcMs: `${ordinal}`,
      action: { type: "DELETE_DOCUMENT", input: { documentId: workflowId } },
    },
    context: {
      documentId: workflowId,
      documentType: WORKFLOW_TYPE,
      scope: "document",
      branch: "main",
      ordinal,
    },
  } as unknown as OperationWithContext;
}

function marker(workflowId: string): OperationWithContext {
  ordinal += 1;
  return {
    operation: {
      id: `marker-${workflowId}`,
      index: 0,
      skip: 0,
      hash: "",
      timestampUtcMs: `${ordinal}`,
      action: {
        id: `a-${workflowId}`,
        type: "PURGE_DOCUMENT",
        scope: "document",
        timestampUtcMs: `${ordinal}`,
        input: {
          documentId: workflowId,
          documentType: WORKFLOW_TYPE,
          requestId: "r1",
          purgedAtUtcIso: new Date().toISOString(),
        },
      },
    },
    context: {
      documentId: workflowId,
      documentType: WORKFLOW_TYPE,
      scope: "document",
      branch: "main",
      ordinal,
    },
  } as unknown as OperationWithContext;
}

// The read model as the reactor drives it, fence bypassed.
function commit(
  service: WorkflowRuntimeService,
  items: OperationWithContext[],
): Promise<void> {
  const model = new WorkflowTriggersReadModel(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    service,
  );
  return (
    model as unknown as {
      commitOperations(items: OperationWithContext[]): Promise<void>;
    }
  ).commitOperations(items);
}

describe("deleting an enabled workflow", () => {
  let dir = "";
  const runtimes: WorkflowRuntimeService[] = [];

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "ph-deleted-workflow-"));
    const entryPath = join(dir, "index.mjs");
    await writeFile(entryPath, FIXTURE);
    packagePieces.setPieces([{ name: PIECE, version: "1.0.0", entryPath }]);
  });

  afterEach(() => {
    for (const runtime of runtimes.splice(0)) runtime.shutdown();
  });

  afterAll(async () => {
    packagePieces.reset();
    await rm(dir, { recursive: true, force: true });
  });

  function start(
    relationalDb = createTestRelationalDb(),
    webhooks = memoryWebhooks(),
  ) {
    const service = testRuntime({ relationalDb, webhooks: webhooks.scope });
    runtimes.push(service);
    const fire = vi
      .spyOn(service, "fire")
      .mockResolvedValue({ runId: "run", status: "SUCCEEDED", steps: [] });
    return { service, fire, relationalDb, webhooks };
  }

  it("runs onDisable, revokes the token and drops the trigger row", async () => {
    const { service, relationalDb, webhooks } = start();
    const store = (await service.store())!;
    await service.onOperations([publish("wf-hook", "hook")]);
    await vi.waitFor(
      async () =>
        expect(await store.getTriggerState("wf-hook")).toMatchObject({
          status: "ENABLED",
        }),
      { timeout: 30_000 },
    );
    expect(await service.webhookPolicy("wf-hook")).toEqual({});
    const url = webhooks.rows.get("wf-hook")?.url;
    expect(
      await store.getPieceStoreValue("FLOW", "wf-hook", "subscribed"),
    ).toBe(url);

    await service.onOperations([deletion("wf-hook")]);

    // Deliveries stop before the hook has even run.
    expect(await service.webhookPolicy("wf-hook")).toBeUndefined();
    await vi.waitFor(
      async () => {
        expect(webhooks.rows.has("wf-hook")).toBe(false);
        expect(await store.getTriggerState("wf-hook")).toBeUndefined();
      },
      { timeout: 30_000 },
    );
    expect(
      await store.getPieceStoreValue("PROJECT", PROJECT_SCOPE_KEY, "released"),
    ).toBe(true);
    expect(
      await store.getPieceStoreValue("FLOW", "wf-hook", "subscribed"),
    ).toBeNull();

    // A restart finds nothing to re-arm: the document is gone from the sweep.
    service.shutdown();
    const restarted = start(relationalDb, webhooks);
    await restarted.service.seedFailure();
    expect(await restarted.service.triggerStates()).toEqual([]);
    expect(await restarted.service.webhookPolicy("wf-hook")).toBeUndefined();
  }, 60_000);

  it("stops polling a deleted workflow", async () => {
    const { service, fire } = start();
    const store = (await service.store())!;
    await service.onOperations([publish("wf-poll", "poll")]);
    await vi.waitFor(
      async () =>
        expect(await store.getTriggerState("wf-poll")).toMatchObject({
          status: "ENABLED",
        }),
      { timeout: 30_000 },
    );
    const due = new Date(Date.now() - 1_000).toISOString();
    await store.recordPollSuccess("wf-poll", "{}", due, due);
    await service.supervisor().tick();
    expect(fire).toHaveBeenCalledTimes(1);

    await store.recordPollSuccess("wf-poll", "{}", due, due);
    await service.onOperations([deletion("wf-poll")]);
    await vi.waitFor(
      async () =>
        expect(await store.getTriggerState("wf-poll")).toBeUndefined(),
      { timeout: 30_000 },
    );
    await service.supervisor().tick();
    expect(fire).toHaveBeenCalledTimes(1);
  }, 60_000);
});

describe("purging an enabled workflow", () => {
  let dir = "";
  const runtimes: WorkflowRuntimeService[] = [];

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "ph-purged-workflow-"));
    const entryPath = join(dir, "index.mjs");
    await writeFile(entryPath, FIXTURE);
    packagePieces.setPieces([{ name: PIECE, version: "1.0.0", entryPath }]);
  });

  afterEach(() => {
    for (const runtime of runtimes.splice(0)) runtime.shutdown();
  });

  afterAll(async () => {
    packagePieces.reset();
    await rm(dir, { recursive: true, force: true });
  });

  function start(
    relationalDb = createTestRelationalDb(),
    webhooks = memoryWebhooks(),
  ) {
    const service = testRuntime({ relationalDb, webhooks: webhooks.scope });
    runtimes.push(service);
    const fire = vi
      .spyOn(service, "fire")
      .mockResolvedValue({ runId: "run", status: "SUCCEEDED", steps: [] });
    return { service, fire, relationalDb, webhooks };
  }

  async function armed(workflowId: string, triggerName: string) {
    const started = start();
    const store = (await started.service.store())!;
    await started.service.onOperations([publish(workflowId, triggerName)]);
    await vi.waitFor(
      async () =>
        expect(await store.getTriggerState(workflowId)).toMatchObject({
          status: "ENABLED",
        }),
      { timeout: 30_000 },
    );
    const now = new Date().toISOString();
    await store.claimDedupe(workflowId, "op-key", 60_000, now);
    for (const scope of ["FLOW", "PROJECT"] as const) {
      await store.setPieceStoreValue(
        scope,
        testPartitionKey(scope, workflowId),
        "sampled",
        true,
      );
    }
    return { ...started, store };
  }

  async function expectErased(
    { service, store, webhooks }: Awaited<ReturnType<typeof armed>>,
    workflowId: string,
  ) {
    expect(await service.webhookPolicy(workflowId)).toBeUndefined();
    expect(webhooks.rows.has(workflowId)).toBe(false);
    expect(await store.getTriggerState(workflowId)).toBeUndefined();
    const now = new Date().toISOString();
    expect(await store.claimDedupe(workflowId, "op-key", 60_000, now)).toBe(
      true,
    );
    for (const scope of ["FLOW", "PROJECT"] as const) {
      expect(
        await store.getPieceStoreValue(
          scope,
          testPartitionKey(scope, workflowId),
          "sampled",
        ),
      ).toBeNull();
    }
  }

  it("disarms on the marker alone, and a restart has nothing to re-arm", async () => {
    const armedHook = await armed("wf-purged", "hook");
    const { service, store, relationalDb, webhooks } = armedHook;
    expect(await service.webhookPolicy("wf-purged")).toEqual({});

    await commit(service, [marker("wf-purged")]);

    await expectErased(armedHook, "wf-purged");
    expect(
      await store.getPieceStoreValue("PROJECT", PROJECT_SCOPE_KEY, "released"),
    ).toBe(true);
    expect(
      await store.getPieceStoreValue("FLOW", "wf-purged", "subscribed"),
    ).toBeNull();

    service.shutdown();
    const restarted = start(relationalDb, webhooks);
    await restarted.service.seedFailure();
    expect(await restarted.service.triggerStates()).toEqual([]);
    expect(await restarted.service.webhookPolicy("wf-purged")).toBeUndefined();
  }, 60_000);

  it("is idempotent after the deletion and on a repeated marker", async () => {
    const armedHook = await armed("wf-deleted", "hook");
    await armedHook.service.onOperations([deletion("wf-deleted")]);

    await commit(armedHook.service, [marker("wf-deleted")]);
    await commit(armedHook.service, [marker("wf-deleted")]);

    await expectErased(armedHook, "wf-deleted");
  }, 60_000);

  it("stops polling a purged workflow", async () => {
    const { service, fire, store } = await armed("wf-poll", "poll");
    const due = new Date(Date.now() - 1_000).toISOString();
    await store.recordPollSuccess("wf-poll", "{}", due, due);

    await commit(service, [marker("wf-poll")]);
    await service.supervisor().tick();

    expect(fire).not.toHaveBeenCalled();
    expect(await store.getTriggerState("wf-poll")).toBeUndefined();
  }, 60_000);

  it("leaves a document that is not a workflow alone", async () => {
    const armedHook = await armed("wf-kept", "hook");
    const other = marker("wf-kept");
    (other.operation.action.input as { documentType: string }).documentType =
      "powerhouse/note";
    other.context.documentType = "powerhouse/note";

    await commit(armedHook.service, [other]);

    expect(await armedHook.service.webhookPolicy("wf-kept")).toEqual({});
    expect(await armedHook.store.getTriggerState("wf-kept")).toMatchObject({
      status: "ENABLED",
    });
  }, 60_000);
});
