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

const PIECE = "@acme/piece-parkable";
const WORKFLOW = "wf-parked-hook";

const FIXTURE = `
async function bump(ctx, key) {
  const n = (await ctx.store.get(key, "PROJECT")) ?? 0;
  await ctx.store.put(key, n + 1, "PROJECT");
}
export const parkable = {
  displayName: "Parkable",
  actions: {},
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
  },
};
`;

let ordinal = 0;

function workflowOp(status: string): OperationWithContext {
  ordinal += 1;
  const state = {
    name: WORKFLOW,
    status,
    version: 1,
    trigger: {
      id: "t1",
      pieceName: PIECE,
      pieceVersion: "1.0.0",
      triggerName: "hook",
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
      documentId: WORKFLOW,
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
