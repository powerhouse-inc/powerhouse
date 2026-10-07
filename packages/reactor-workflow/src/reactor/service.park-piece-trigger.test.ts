// A parked piece trigger still holds its provider subscription, so disabling
// it has to release that, or re-enabling subscribes a second time.
import type { OperationWithContext } from "document-model";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { testRuntime } from "../../test/helpers/runtime.js";
import { memoryWebhooks } from "../../test/helpers/webhooks.js";
import { packagePieces } from "./piece-registry.js";
import { PROJECT_SCOPE_KEY } from "./piece-store-port.js";
import { PARKED_TRIGGER_STATUS } from "./policy.js";
import type { WorkflowRuntimeService } from "./service.js";
import { WorkflowRunStore } from "./store.js";

const PIECE = "@acme/piece-parkable";
const WORKFLOW = "wf-parked-hook";

const FIXTURE = `
async function append(ctx, key, value) {
  const list = (await ctx.store.get(key, "PROJECT")) ?? [];
  await ctx.store.put(key, [...list, value], "PROJECT");
}
async function bump(ctx, key) {
  const n = (await ctx.store.get(key, "PROJECT")) ?? 0;
  await ctx.store.put(key, n + 1, "PROJECT");
}
export const parkable = {
  displayName: "Parkable",
  actions: {
    boom: {
      name: "boom",
      displayName: "Boom",
      props: {},
      run: async () => { throw new Error("always fails"); },
    },
  },
  triggers: {
    hook: {
      name: "hook",
      displayName: "Hook",
      type: "WEBHOOK",
      props: {},
      onEnable: async (ctx) => bump(ctx, "subscribed"),
      onDisable: async (ctx) => bump(ctx, "released"),
      run: async (ctx) => (ctx.payload ? [ctx.payload] : []),
    },
    keyed: {
      name: "keyed",
      displayName: "Keyed",
      type: "WEBHOOK",
      props: { key: { displayName: "Key", type: "SHORT_TEXT", required: false } },
      onEnable: async (ctx) => append(ctx, "keyed:subscribed", ctx.propsValue.key),
      onDisable: async (ctx) => append(ctx, "keyed:released", ctx.propsValue.key),
      run: async (ctx) => (ctx.payload ? [ctx.payload] : []),
    },
    slow: {
      name: "slow",
      displayName: "Slow",
      type: "POLLING",
      props: {},
      onEnable: async () => { await new Promise((r) => setTimeout(r, 3000)); },
      onDisable: async () => undefined,
      run: async () => [],
      test: async () => [],
    },
    flaky: {
      name: "flaky",
      displayName: "Flaky",
      type: "WEBHOOK",
      props: { key: { displayName: "Key", type: "SHORT_TEXT", required: false } },
      onEnable: async (ctx) => {
        const key = ctx.propsValue.key ?? "flaky";
        await bump(ctx, key + ":enables");
        if ((await ctx.store.get(key + ":enables", "PROJECT")) === 1) {
          await ctx.store.put("first-attempt", true);
          throw new Error("provider briefly down");
        }
      },
      onDisable: async (ctx) =>
        bump(ctx, (ctx.propsValue.key ?? "flaky") + ":releases"),
      run: async (ctx) => (ctx.payload ? [ctx.payload] : []),
    },
  },
};
`;

let ordinal = 0;

function workflowOp(
  status: string,
  workflowId = WORKFLOW,
  triggerName = "hook",
  version = 1,
): OperationWithContext {
  ordinal += 1;
  const state = {
    name: workflowId,
    status,
    version,
    trigger: {
      id: "t1",
      pieceName: PIECE,
      pieceVersion: "1.0.0",
      triggerName,
      config: triggerName === "flaky" ? { key: workflowId } : {},
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
      documentType: "powerhouse/workflow",
      scope: "global",
      branch: "main",
      ordinal,
    },
  } as unknown as OperationWithContext;
}

describe("disabling a PARKED piece webhook trigger", () => {
  let dir = "";
  let service: WorkflowRuntimeService;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "ph-parked-hook-"));
    const entryPath = join(dir, "index.mjs");
    await writeFile(entryPath, FIXTURE);
    packagePieces.setPieces([{ name: PIECE, version: "1.0.0", entryPath }]);
    service = testRuntime({ webhooks: memoryWebhooks().scope });
  });

  afterAll(async () => {
    service.shutdown();
    packagePieces.reset();
    await rm(dir, { recursive: true, force: true });
  });

  it("releases the subscription once, and re-enabling subscribes once", async () => {
    const store = (await service.store())!;
    const count = async (key: string) =>
      ((await store.getPieceStoreValue("PROJECT", PROJECT_SCOPE_KEY, key)) as
        | number
        | null) ?? 0;
    const status = async () => (await store.getTriggerState(WORKFLOW))?.status;

    await service.onOperations([workflowOp("ENABLED")]);
    await vi.waitFor(async () => expect(await status()).toBe("ENABLED"), {
      timeout: 30_000,
    });
    expect(await count("subscribed")).toBe(1);
    await store.parkWorkflow(WORKFLOW, 1, "parked for the test");
    expect(await status()).toBe(PARKED_TRIGGER_STATUS);

    await service.onOperations([workflowOp("DISABLED")]);
    await vi.waitFor(
      async () => {
        expect(await status()).toBe("DISABLED");
        expect(await count("released")).toBe(1);
      },
      { timeout: 30_000 },
    );

    await service.onOperations([workflowOp("ENABLED")]);
    await vi.waitFor(async () => expect(await status()).toBe("ENABLED"), {
      timeout: 30_000,
    });
    expect(await count("subscribed")).toBe(2);
    expect(await count("released")).toBe(1);
  }, 90_000);
});

// A park that lands while the row is ERROR leaves it ERROR, and the enable
// retry pending on that row must not arm a parked workflow.
describe("an enable retry of a PARKED piece trigger", () => {
  let dir = "";
  let service: WorkflowRuntimeService;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "ph-parked-retry-"));
    const entryPath = join(dir, "index.mjs");
    await writeFile(entryPath, FIXTURE);
    packagePieces.setPieces([{ name: PIECE, version: "1.0.0", entryPath }]);
    service = testRuntime({ webhooks: memoryWebhooks().scope });
  });

  afterAll(async () => {
    service.shutdown();
    packagePieces.reset();
    await rm(dir, { recursive: true, force: true });
  });

  it("does not arm the trigger", async () => {
    const id = "wf-parked-retry";
    const store = (await service.store())!;
    const status = async () => (await store.getTriggerState(id))?.status;
    await service.onOperations([workflowOp("ENABLED", id, "flaky")]);
    await vi.waitFor(async () => expect(await status()).toBe("ERROR"), {
      timeout: 30_000,
    });
    await store.parkWorkflow(id, 1, "parked while the enable was failing");
    expect(await status()).toBe("ERROR");

    const supervisor = service.supervisor();
    const retries = (
      supervisor as unknown as { enableRetries: Map<string, { at: number }> }
    ).enableRetries;
    retries.get(id)!.at = 0;
    await supervisor.tick();

    // Left as it stands: the park row is what blocks arming, and the row's
    // own state is what a later enable reads to release the failed attempt.
    expect(await status()).toBe("ERROR");
    expect(
      await store.getPieceStoreValue(
        "PROJECT",
        PROJECT_SCOPE_KEY,
        `${id}:enables`,
      ),
    ).toBe(1);
  }, 90_000);

  // The failed attempt may have subscribed at the provider. Lifting the park
  // must arm it as the fresh enable it is: release that attempt once, drop
  // its FLOW store, subscribe once — not a republish over a dead registration.
  it("arms a fresh enable when a re-publish lifts the park", async () => {
    const id = "wf-parked-retry-republish";
    const store = (await service.store())!;
    const status = async () => (await store.getTriggerState(id))?.status;
    const counted = async (suffix: string) =>
      store.getPieceStoreValue("PROJECT", PROJECT_SCOPE_KEY, `${id}:${suffix}`);
    await service.onOperations([workflowOp("ENABLED", id, "flaky")]);
    await vi.waitFor(async () => expect(await status()).toBe("ERROR"), {
      timeout: 30_000,
    });
    await store.parkWorkflow(id, 1, "parked while the enable was failing");
    const supervisor = service.supervisor();
    const retries = (
      supervisor as unknown as { enableRetries: Map<string, { at: number }> }
    ).enableRetries;
    retries.get(id)!.at = 0;
    await supervisor.tick();

    await service.onOperations([workflowOp("ENABLED", id, "flaky", 2)]);

    await vi.waitFor(async () => expect(await status()).toBe("ENABLED"), {
      timeout: 30_000,
    });
    expect(await counted("releases")).toBe(1);
    expect(await counted("enables")).toBe(2);
    expect(
      await store.getPieceStoreValue("FLOW", id, "first-attempt"),
    ).toBeNull();
  }, 90_000);
});

// A park that lands while onEnable is still running must not be overwritten
// by the ENABLED row that enable writes when the hook returns.
describe("a park landing while the trigger is enabling", () => {
  let dir = "";

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "ph-park-mid-enable-"));
    const entryPath = join(dir, "index.mjs");
    await writeFile(entryPath, FIXTURE);
    packagePieces.setPieces([{ name: PIECE, version: "1.0.0", entryPath }]);
  });

  afterAll(async () => {
    packagePieces.reset();
    await rm(dir, { recursive: true, force: true });
  });

  it("leaves the trigger PARKED", async () => {
    const id = "wf-park-mid-enable";
    ordinal += 1;
    const state = {
      name: id,
      status: "ENABLED",
      version: 1,
      trigger: {
        id: "t1",
        pieceName: PIECE,
        pieceVersion: "1.0.0",
        triggerName: "slow",
        config: {},
      },
      steps: [
        {
          id: "a",
          key: "only",
          name: "Only",
          pieceName: PIECE,
          pieceVersion: "1.0.0",
          actionName: "boom",
          config: {},
        },
      ],
      edges: [{ id: "e1", from: "t1", to: "a", port: "next" }],
      variables: [],
      policy: { concurrency: "PARALLEL", onFailure: "PARK" },
    };
    const documents = {
      get: () =>
        Promise.resolve({
          header: { id, documentType: "powerhouse/workflow", name: id },
          state: { global: state },
        }),
    };
    const parking = testRuntime({
      webhooks: memoryWebhooks().scope,
      reactorClient: documents,
    } as never);
    try {
      const store = (await parking.store())!;
      await parking.onOperations([
        {
          operation: {
            index: ordinal,
            timestampUtcMs: `${ordinal}`,
            action: { type: "SET_WORKFLOW_STATUS", input: {} },
            resultingState: JSON.stringify(state),
          },
          context: {
            documentId: id,
            documentType: "powerhouse/workflow",
            scope: "global",
            branch: "main",
            ordinal,
          },
        } as unknown as OperationWithContext,
      ]);

      // Fails, and parks, while the slow onEnable is still in flight.
      expect((await parking.fire(id, undefined, "piece")).status).toBe(
        "FAILED",
      );

      await vi.waitFor(
        async () =>
          expect((await store.getTriggerState(id))?.status).toBe(
            PARKED_TRIGGER_STATUS,
          ),
        { timeout: 15_000 },
      );
      expect(await store.getWorkflowPark(id)).toBeDefined();
    } finally {
      parking.shutdown();
    }
  }, 60_000);
});

// Belt and braces: even a park written off the supervisor's lane must not be
// overwritten by the ENABLED row an in-flight enable writes when it returns.
describe("a park written off the lane while the trigger is enabling", () => {
  let dir = "";

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "ph-park-off-lane-"));
    const entryPath = join(dir, "index.mjs");
    await writeFile(entryPath, FIXTURE);
    packagePieces.setPieces([{ name: PIECE, version: "1.0.0", entryPath }]);
  });

  afterAll(async () => {
    packagePieces.reset();
    await rm(dir, { recursive: true, force: true });
  });

  it("is recorded PARKED by the enable's own write", async () => {
    const id = "wf-park-off-lane";
    const runtime = testRuntime({ webhooks: memoryWebhooks().scope });
    try {
      const store = (await runtime.store())!;
      const supervisor = runtime.supervisor() as unknown as {
        hook: (...args: unknown[]) => Promise<unknown>;
      };
      const realHook = supervisor.hook.bind(supervisor);
      let enabling!: () => void;
      const inFlight = new Promise<void>((resolve) => (enabling = resolve));
      supervisor.hook = (...args: unknown[]) => {
        if (args[1] === "onEnable") enabling();
        return realHook(...args);
      };
      await runtime.onOperations([workflowOp("ENABLED", id, "slow")]);
      await inFlight;
      // The slow onEnable is still in flight: no row yet.
      await store.parkWorkflow(id, 1, "parked off the lane");
      expect(await store.getTriggerState(id)).toBeUndefined();

      await vi.waitFor(
        async () =>
          expect((await store.getTriggerState(id))?.status).toBe(
            PARKED_TRIGGER_STATUS,
          ),
        { timeout: 15_000 },
      );
    } finally {
      runtime.shutdown();
    }
  }, 60_000);
});

// A version published while the failed run's park is being written arms on
// the supervisor's lane after that park. It must release the old version's
// subscription with the old binding, not with its own.
describe("a version published while its predecessor is being parked", () => {
  let dir = "";

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "ph-park-newer-version-"));
    const entryPath = join(dir, "index.mjs");
    await writeFile(entryPath, FIXTURE);
    packagePieces.setPieces([{ name: PIECE, version: "1.0.0", entryPath }]);
  });

  afterAll(async () => {
    packagePieces.reset();
    await rm(dir, { recursive: true, force: true });
  });

  function keyedState(version: number, key: string) {
    return {
      name: "wf-park-newer",
      status: "ENABLED",
      version,
      trigger: {
        id: "t1",
        pieceName: PIECE,
        pieceVersion: "1.0.0",
        triggerName: "keyed",
        config: { key },
      },
      steps: [
        {
          id: "a",
          key: "only",
          name: "Only",
          pieceName: PIECE,
          pieceVersion: "1.0.0",
          actionName: "boom",
          config: {},
        },
      ],
      edges: [{ id: "e1", from: "t1", to: "a", port: "next" }],
      variables: [],
      policy: { concurrency: "PARALLEL", onFailure: "PARK" },
    };
  }

  function stateOp(state: unknown): OperationWithContext {
    ordinal += 1;
    return {
      operation: {
        index: ordinal,
        timestampUtcMs: `${ordinal}`,
        action: { type: "PUBLISH_WORKFLOW", input: {} },
        resultingState: JSON.stringify(state),
      },
      context: {
        documentId: "wf-park-newer",
        documentType: "powerhouse/workflow",
        scope: "global",
        branch: "main",
        ordinal,
      },
    } as unknown as OperationWithContext;
  }

  it("releases the old subscription with the old binding and arms the new one", async () => {
    const id = "wf-park-newer";
    let current = keyedState(1, "old");
    const runtime = testRuntime({
      webhooks: memoryWebhooks().scope,
      reactorClient: {
        get: () =>
          Promise.resolve({
            header: { id, documentType: "powerhouse/workflow", name: id },
            state: { global: current },
          }),
      },
    } as never);
    try {
      const store = (await runtime.store())!;
      const list = async (key: string) =>
        (await store.getPieceStoreValue("PROJECT", PROJECT_SCOPE_KEY, key)) ??
        [];
      await runtime.onOperations([stateOp(current)]);
      await vi.waitFor(
        async () =>
          expect((await store.getTriggerState(id))?.status).toBe("ENABLED"),
        { timeout: 30_000 },
      );
      expect(await list("keyed:subscribed")).toEqual(["old"]);

      const park = vi.spyOn(WorkflowRunStore.prototype, "parkWorkflow");
      park.mockImplementationOnce(async function (
        this: WorkflowRunStore,
        ...args
      ) {
        current = keyedState(2, "new");
        await runtime.onOperations([stateOp(current)]);
        park.mockRestore();
        return this.parkWorkflow(...args);
      });
      expect((await runtime.fire(id, undefined, "piece")).status).toBe(
        "FAILED",
      );
      park.mockRestore();

      await vi.waitFor(
        async () => {
          expect(await list("keyed:subscribed")).toEqual(["old", "new"]);
          expect((await store.getTriggerState(id))?.status).toBe("ENABLED");
        },
        { timeout: 30_000 },
      );
      expect(await list("keyed:released")).toEqual(["old"]);
      expect(await store.getWorkflowPark(id)).toBeUndefined();
    } finally {
      runtime.shutdown();
    }
  }, 90_000);
});
