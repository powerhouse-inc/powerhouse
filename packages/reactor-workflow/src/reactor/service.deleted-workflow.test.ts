// Deleting an enabled workflow disarms it as disabling does, and takes its
// trigger row and webhook token with it, so a restart has nothing to re-arm.
import type {
  IWebhookEndpoints,
  IWebhookScope,
  WebhookEndpointInfo,
} from "@powerhousedao/shared/processors";
import type { OperationWithContext } from "document-model";
import { randomBytes } from "node:crypto";
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
import { packagePieces } from "./piece-registry.js";
import { PROJECT_SCOPE_KEY } from "./piece-store-port.js";
import type { WorkflowRuntimeService } from "./service.js";

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

// The endpoint family as the reactor's webhook service shapes it, in memory.
function memoryWebhooks() {
  const rows = new Map<string, WebhookEndpointInfo>();
  const endpoints: IWebhookEndpoints = {
    endpointFor: (key) => {
      let row = rows.get(key);
      if (!row) {
        const token = randomBytes(16).toString("hex");
        row = {
          key,
          token,
          url: `https://hooks.test/webhooks/${token}`,
          createdAt: new Date().toISOString(),
        };
        rows.set(key, row);
      }
      const { key: _, ...info } = row;
      return Promise.resolve(info);
    },
    revoke: (key) => {
      rows.delete(key);
      return Promise.resolve();
    },
    list: () => Promise.resolve([...rows.values()]),
  };
  const scope: IWebhookScope = {
    hasPublicOrigin: true,
    register: () => Promise.resolve(endpoints),
  };
  return { rows, scope };
}

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
