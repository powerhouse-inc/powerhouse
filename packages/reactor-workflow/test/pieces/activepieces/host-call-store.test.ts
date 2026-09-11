// ctx.store over the host call channel: the piece asks its host for every
// get/put/delete while the step is still running.

// That is the semantic their pieces are written against — theirs is an HTTP
// call per operation — and it is what lets a loop resume where it stopped.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ActivepiecesBlockExecutor,
  type PieceStorePort,
} from "../../src/engine/blocks.js";
import type { BlockExecution } from "../../src/engine/types.js";
import { PieceWorker } from "../../src/activepieces/worker/host.js";

// Reads a cursor and advances it item by item; each put is the checkpoint a
// crash is supposed to preserve.
const CURSOR_FIXTURE = `
const app = {
  displayName: "Cursor Fixture",
  actions: {
    advance: {
      name: "advance",
      displayName: "Advance",
      props: {},
      run: async (ctx) => {
        const before = await ctx.store.get("cursor");
        const start = typeof before === "number" ? before : 0;
        for (let i = start + 1; i <= start + 3; i++) {
          await ctx.store.put("cursor", i);
        }
        return { before, after: await ctx.store.get("cursor") };
      },
    },
    forget: {
      name: "forget",
      displayName: "Forget",
      props: {},
      run: async (ctx) => {
        await ctx.store.put("scratch", "value");
        await ctx.store.delete("scratch");
        return { scratch: await ctx.store.get("scratch") };
      },
    },
    scoped: {
      name: "scoped",
      displayName: "Scoped",
      props: {},
      run: async (ctx) => {
        // What StoreScope.PROJECT actually carries at runtime.
        await ctx.store.put("shared", "project-wide", "COLLECTION");
        return { key: await ctx.store.get("shared", "COLLECTION") };
      },
    },
    flowScoped: {
      name: "flowScoped",
      displayName: "Flow Scoped",
      props: {},
      run: async (ctx) => {
        await ctx.store.put("cursor", 1, "FLOW");
        return { implicit: await ctx.store.get("cursor") };
      },
    },
    refused: {
      name: "refused",
      displayName: "Refused",
      props: {},
      run: async (ctx) => {
        try {
          await ctx.store.put("too-big", "x");
          return { threw: false };
        } catch (error) {
          return { threw: true, message: String(error.message) };
        }
      },
    },
  },
};
module.exports = { app };
`;

let cacheDir = "";
let worker: PieceWorker;

async function writeFixture(name: string, source: string): Promise<string> {
  const dir = join(cacheDir, `${name.replace("/", "-")}-1.0.0`);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({ name, version: "1.0.0", main: "index.js" }),
  );
  await writeFile(join(dir, "index.js"), source);
  return dir;
}

// Records the order operations arrive in, which is what shows they are served
// during the step rather than replayed from a snapshot afterwards.
function memoryStore(options: { rejectPut?: string } = {}): PieceStorePort & {
  entries: Map<string, unknown>;
  calls: string[];
} {
  const entries = new Map<string, unknown>();
  const calls: string[] = [];
  return {
    entries,
    calls,
    get(key) {
      calls.push(`get ${key}`);
      return Promise.resolve(entries.has(key) ? entries.get(key) : null);
    },
    put(key, value) {
      calls.push(`put ${key}=${JSON.stringify(value)}`);
      if (options.rejectPut === key) {
        return Promise.reject(new Error(`Store value for "${key}" is too big`));
      }
      entries.set(key, value);
      return Promise.resolve();
    },
    delete(key) {
      calls.push(`delete ${key}`);
      entries.delete(key);
      return Promise.resolve();
    },
  };
}

function execution(blockType: string, config: unknown): BlockExecution {
  return {
    blockType,
    config,
    step: { id: "s1", key: "step", blockType } as BlockExecution["step"],
  };
}

describe("ctx.store over the host call channel", () => {
  beforeAll(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "ap-host-call-"));
    worker = new PieceWorker();
    await writeFixture("@test/cursor", CURSOR_FIXTURE);
  });

  afterAll(async () => {
    worker.dispose();
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("serves each get and put while the step is still running", async () => {
    const store = memoryStore();
    const executor = new ActivepiecesBlockExecutor({
      cacheDir,
      worker,
      pieceStore: store,
    });

    const result = await executor.execute(
      execution("@test/cursor@1.0.0#advance", {}),
    );

    expect(result.output).toEqual({ before: null, after: 3 });
    // Every checkpoint reached the host in order, not as one batch at the end.
    expect(store.calls).toEqual([
      "get cursor",
      "put cursor=1",
      "put cursor=2",
      "put cursor=3",
      "get cursor",
    ]);
    expect(store.entries.get("cursor")).toBe(3);
  });

  it("resumes from what a previous step left behind", async () => {
    const store = memoryStore();
    store.entries.set("cursor", 10);
    const executor = new ActivepiecesBlockExecutor({
      cacheDir,
      worker,
      pieceStore: store,
    });

    const result = await executor.execute(
      execution("@test/cursor@1.0.0#advance", {}),
    );

    expect(result.output).toEqual({ before: 10, after: 13 });
  });

  it("deletes a key rather than writing it as null", async () => {
    const store = memoryStore();
    const executor = new ActivepiecesBlockExecutor({
      cacheDir,
      worker,
      pieceStore: store,
    });

    const result = await executor.execute(
      execution("@test/cursor@1.0.0#forget", {}),
    );

    expect(result.output).toEqual({ scratch: null });
    expect(store.entries.has("scratch")).toBe(false);
    expect(store.calls).toContain("delete scratch");
  });

  it("carries their scope prefix through to the host", async () => {
    const store = memoryStore();
    const executor = new ActivepiecesBlockExecutor({
      cacheDir,
      worker,
      pieceStore: store,
    });

    await executor.execute(execution("@test/cursor@1.0.0#scoped", {}));

    // StoreScope.PROJECT is the string "COLLECTION"; folding that name in
    // verbatim would split one scope across two partitions.
    expect([...store.entries.keys()]).toEqual(["PROJECT:shared"]);
  });

  it("treats an explicit FLOW scope as the partition's default", async () => {
    const store = memoryStore();
    const executor = new ActivepiecesBlockExecutor({
      cacheDir,
      worker,
      pieceStore: store,
    });

    const result = await executor.execute(
      execution("@test/cursor@1.0.0#flowScoped", {}),
    );

    // A piece that names FLOW and one that omits the scope mean the same key.
    expect(result.output).toEqual({ implicit: 1 });
    expect([...store.entries.keys()]).toEqual(["cursor"]);
  });

  it("surfaces a host refusal to the piece as a thrown error", async () => {
    const store = memoryStore({ rejectPut: "too-big" });
    const executor = new ActivepiecesBlockExecutor({
      cacheDir,
      worker,
      pieceStore: store,
    });

    const result = await executor.execute(
      execution("@test/cursor@1.0.0#refused", {}),
    );

    const output = result.output as { threw: boolean; message: string };
    expect(output.threw).toBe(true);
    expect(output.message).toContain("too big");
    expect(store.entries.has("too-big")).toBe(false);
  });

  it("leaves ctx.store on the worker's heap when no port is configured", async () => {
    const executor = new ActivepiecesBlockExecutor({ cacheDir, worker });

    const result = await executor.execute(
      execution("@test/cursor@1.0.0#advance", {}),
    );

    // No port means no durability contract; the value lives only as long as
    // this worker does.
    expect(result.output).toEqual({ before: null, after: 3 });
  });
});
