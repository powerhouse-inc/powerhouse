// A trigger hook's ctx.store served by the host, one call per operation —
// the same store an action gets, which is what Activepieces does too.

// What it buys: a hook that dies halfway keeps what it had already written,
// and a PROJECT key one workflow writes is readable by the next.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { storeHandlers, type PieceStorePort } from "../../../src/pieces/engine/blocks.js";
import { PieceWorker } from "../../../src/pieces/activepieces/worker/host.js";

// Registers three "remote webhooks" one at a time, then optionally dies. Each
// put is the checkpoint that decides whether an endpoint leaks at the provider.
const REGISTRAR_FIXTURE = `
const app = {
  displayName: "Registrar Fixture",
  actions: {},
  triggers: {
    registrar: {
      name: "registrar",
      displayName: "Registrar",
      type: "WEBHOOK",
      props: {},
      onEnable: async (ctx) => {
        const ids = [];
        for (const name of ["a", "b", "c"]) {
          ids.push(name);
          await ctx.store.put("registrations", ids);
          if (ctx.propsValue.dieAfter === name) {
            throw new Error("provider hung up after " + name);
          }
        }
        await ctx.store.put("seen", await ctx.store.get("cursor"));
      },
      onDisable: async (ctx) => {
        await ctx.store.delete("registrations");
      },
      run: async (ctx) => {
        const at = (await ctx.store.get("cursor")) ?? 0;
        await ctx.store.put("cursor", at + 1);
        await ctx.store.put("shared", "from-" + ctx.propsValue.tag, "COLLECTION");
        return [{ at, shared: await ctx.store.get("shared", "COLLECTION") }];
      },
      test: async (ctx) => {
        const at = (await ctx.store.get("cursor")) ?? 0;
        await ctx.store.put("cursor", at + 100);
        return [{ at }];
      },
    },
  },
};
module.exports = { app };
`;

let cacheDir = "";
let bundleDir = "";
let worker: PieceWorker;

// Mirrors the journal: one row per (scope, partition, key), where the host
// alone decides the partition — the flow for FLOW, the project for PROJECT.
function journal(): PieceStorePort & {
  rows: Map<string, unknown>;
  flowId: string;
} {
  const rows = new Map<string, unknown>();
  const state = { flowId: "wf-1" };
  const at = (key: string, scope: string) =>
    `${scope}/${scope === "PROJECT" ? "reactor" : state.flowId}/${key}`;
  return {
    rows,
    get flowId() {
      return state.flowId;
    },
    set flowId(value: string) {
      state.flowId = value;
    },
    get: (key, scope) => Promise.resolve(rows.get(at(key, scope)) ?? null),
    put: (key, value, scope) => {
      rows.set(at(key, scope), value);
      return Promise.resolve();
    },
    delete: (key, scope) => {
      rows.delete(at(key, scope));
      return Promise.resolve();
    },
  };
}

function hook(
  store: PieceStorePort,
  name: "onEnable" | "onDisable" | "run" | "test",
  propsValue: Record<string, unknown> = {},
  flowId = "wf-1",
) {
  return worker.runTriggerHook(
    {
      bundleDir,
      triggerName: "registrar",
      hook: name,
      propsValue,
      durableStore: true,
      identity: { flowId },
    },
    { timeoutMs: 30_000, hostCalls: storeHandlers(store) },
  );
}

describe("durable trigger store", () => {
  beforeAll(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "ap-trigger-store-"));
    bundleDir = join(cacheDir, "registrar-1.0.0");
    await mkdir(bundleDir, { recursive: true });
    await writeFile(
      join(bundleDir, "package.json"),
      JSON.stringify({
        name: "@test/registrar",
        version: "1.0.0",
        main: "index.js",
      }),
    );
    await writeFile(join(bundleDir, "index.js"), REGISTRAR_FIXTURE);
    worker = new PieceWorker();
  });

  afterAll(async () => {
    worker.dispose();
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("keeps what a hook wrote before it threw", async () => {
    const store = journal();
    await expect(
      hook(store, "onEnable", { dieAfter: "b" }),
    ).rejects.toThrow(/hung up after b/);

    // The two endpoints that were registered are on record, so onDisable can
    // still release them. Under the snapshot protocol both ids were lost.
    expect(store.rows.get("FLOW/wf-1/registrations")).toEqual(["a", "b"]);
  }, 60_000);

  it("carries a cursor across a worker replacement", async () => {
    const store = journal();
    const first = await hook(store, "run");
    expect(first.output).toEqual([{ at: 0, shared: "from-undefined" }]);
    // Nothing comes back to persist: the write already landed.
    expect(first.storeState).toBeUndefined();

    // Kill the worker between polls; the next hook spawns a fresh child that
    // has never seen this cursor except through the host.
    worker.dispose();
    const second = await hook(store, "run");
    expect((second.output as { at: number }[])[0].at).toBe(1);
    expect(store.rows.get("FLOW/wf-1/cursor")).toBe(2);
  }, 60_000);

  it("keeps a test run off the live cursor", async () => {
    const store = journal();
    await hook(store, "run");
    // The host gives a sample its own partition; the worker no longer prefixes
    // keys, so the sample's "cursor" is a different row, not a different name.
    store.flowId = "wf-1#test";
    const sample = await hook(store, "test");

    expect((sample.output as { at: number }[])[0].at).toBe(0);
    expect(store.rows.get("FLOW/wf-1/cursor")).toBe(1);
    expect(store.rows.get("FLOW/wf-1#test/cursor")).toBe(100);
  }, 60_000);

  it("writes a key the old prefix would have aliased", async () => {
    const store = journal();
    // Under the "test" key prefix a live "testcursor" and a sample's "cursor"
    // were the same row. The key now reaches the host exactly as written.
    await hook(store, "run", { tag: "alias" });
    expect([...store.rows.keys()].sort()).toEqual([
      "FLOW/wf-1/cursor",
      "PROJECT/reactor/shared",
    ]);
  }, 60_000);

  it("shares a PROJECT key between workflows", async () => {
    const store = journal();
    await hook(store, "run", { tag: "one" }, "wf-1");
    store.flowId = "wf-2";
    const other = await hook(store, "run", { tag: "two" }, "wf-2");

    // The second workflow read what the first wrote — the thing a per-workflow
    // blob structurally could not do.
    expect((other.output as { shared: string }[])[0].shared).toBe("from-two");
    expect(store.rows.get("PROJECT/reactor/shared")).toBe("from-two");
    expect([...store.rows.keys()].filter((k) => k.startsWith("PROJECT"))).toEqual(
      ["PROJECT/reactor/shared"],
    );
    // Their FLOW cursors stayed apart all the same.
    expect(store.rows.get("FLOW/wf-1/cursor")).toBe(1);
    expect(store.rows.get("FLOW/wf-2/cursor")).toBe(1);
  }, 60_000);

  it("deletes a key rather than writing it as null", async () => {
    const store = journal();
    await hook(store, "onEnable");
    expect(store.rows.has("FLOW/wf-1/registrations")).toBe(true);
    await hook(store, "onDisable");
    expect(store.rows.has("FLOW/wf-1/registrations")).toBe(false);
  }, 60_000);
});
