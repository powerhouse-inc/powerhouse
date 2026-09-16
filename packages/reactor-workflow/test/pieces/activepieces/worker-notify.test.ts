// The one-way half of the call channel: what a step reports while it runs.
// Nothing here answers the piece, and nothing here can fail the step.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActivepiecesBlockExecutor } from "../../../src/pieces/engine/blocks.js";
import type { BlockExecution } from "../../../src/pieces/engine/types.js";
import { PieceWorker } from "../../../src/pieces/activepieces/worker/host.js";
import type { PieceLogEntry } from "../../../src/pieces/activepieces/worker/protocol.js";

const NOISY_FIXTURE = `
const app = {
  displayName: "Noisy Fixture",
  actions: {
    talk: {
      name: "talk",
      displayName: "Talk",
      props: {},
      run: async (ctx) => {
        console.log("fetching page %d", 1);
        console.warn("slow response");
        console.error({ code: "E_LATE" });
        return { done: true };
      },
    },
    progress: {
      name: "progress",
      displayName: "Progress",
      props: {},
      run: async (ctx) => {
        await ctx.output.update({ processed: 1 });
        await ctx.output.update({ processed: 2 });
        return { processed: 2 };
      },
    },
    detached: {
      name: "detached",
      displayName: "Detached",
      props: {},
      run: async (ctx) => {
        // Keeps ctx past the step, the way a piece with a stray timer does.
        setTimeout(() => {
          void ctx.output.update({ leaked: true });
        }, 10);
        return { started: true };
      },
    },
    progressGuarded: {
      name: "progressGuarded",
      displayName: "Progress Guarded",
      props: {},
      run: async (ctx) => {
        try {
          await ctx.output.update({ processed: 1 });
          return { threw: false };
        } catch (error) {
          return { threw: true, member: String(error.message) };
        }
      },
    },
  },
};
module.exports = { app };
`;

let cacheDir = "";
let worker: PieceWorker;

async function writeFixture(name: string, source: string): Promise<void> {
  const dir = join(cacheDir, `${name.replace("/", "-")}-1.0.0`);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({ name, version: "1.0.0", main: "index.js" }),
  );
  await writeFile(join(dir, "index.js"), source);
}

function execution(blockType: string): BlockExecution {
  return {
    blockType,
    config: {},
    step: { id: "s1", key: "step", blockType } as BlockExecution["step"],
  };
}

describe("worker notifications", () => {
  beforeAll(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "ap-notify-"));
    worker = new PieceWorker();
    await writeFixture("@test/noisy", NOISY_FIXTURE);
  });

  afterAll(async () => {
    worker.dispose();
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("forwards the piece's console output with its level", async () => {
    const logs: PieceLogEntry[] = [];
    const executor = new ActivepiecesBlockExecutor({
      cacheDir,
      worker,
      onPieceLog: (entry) => logs.push(entry),
    });

    const result = await executor.execute(execution("@test/noisy@1.0.0#talk"));

    expect(result.output).toEqual({ done: true });
    expect(logs.map((entry) => entry.level)).toEqual(["log", "warn", "error"]);
    // Formatted in the child the way console would have printed it.
    expect(logs[0].message).toBe("fetching page 1");
    expect(logs[2].message).toContain("E_LATE");
    expect(logs[0].at).toBeGreaterThan(0);
  });

  it("delivers every log before the step's result", async () => {
    const seen: string[] = [];
    const executor = new ActivepiecesBlockExecutor({
      cacheDir,
      worker,
      onPieceLog: (entry) => seen.push(`log:${entry.level}`),
    });

    await executor.execute(execution("@test/noisy@1.0.0#talk"));
    seen.push("result");

    // Ordering is the whole guarantee: nothing has to be drained at teardown.
    expect(seen).toEqual(["log:log", "log:warn", "log:error", "result"]);
  });

  it("hands ctx.output.update to the host as the step progresses", async () => {
    const partials: unknown[] = [];
    const executor = new ActivepiecesBlockExecutor({
      cacheDir,
      worker,
      onPartialOutput: (output) => partials.push(output),
    });

    const result = await executor.execute(
      execution("@test/noisy@1.0.0#progress"),
    );

    expect(partials).toEqual([{ processed: 1 }, { processed: 2 }]);
    expect(result.output).toEqual({ processed: 2 });
  });

  it("keeps ctx.output throwing when nobody is listening", async () => {
    const executor = new ActivepiecesBlockExecutor({ cacheDir, worker });

    const result = await executor.execute(
      execution("@test/noisy@1.0.0#progressGuarded"),
    );

    // An unimplemented member fails by name rather than silently succeeding.
    const output = result.output as { threw: boolean; member: string };
    expect(output.threw).toBe(true);
    expect(output.member).toContain("output");
  });

  it("drops an output update made after its step returned", async () => {
    const partials: unknown[] = [];
    const executor = new ActivepiecesBlockExecutor({
      cacheDir,
      worker,
      onPartialOutput: (output) => partials.push(output),
    });

    await executor.execute(execution("@test/noisy@1.0.0#detached"));
    // Long enough for the piece's stray timer to fire against a closed tap.
    await new Promise((resolve) => setTimeout(resolve, 60));
    const result = await executor.execute(
      execution("@test/noisy@1.0.0#progress"),
    );

    // A notification carries no request id, so a late one would otherwise be
    // filed against whichever step happened to be running.
    expect(partials).toEqual([{ processed: 1 }, { processed: 2 }]);
    expect(result.output).toEqual({ processed: 2 });
  });

  it("survives a tap that rejects rather than throws", async () => {
    const executor = new ActivepiecesBlockExecutor({
      cacheDir,
      worker,
      // Declared void, but an async sink is what a real one looks like.
      onPieceLog: (() =>
        Promise.reject(new Error("the log sink is down"))) as unknown as (
        entry: PieceLogEntry,
      ) => void,
    });

    const result = await executor.execute(execution("@test/noisy@1.0.0#talk"));

    expect(result.output).toEqual({ done: true });
  });

  it("finishes the step even when a tap throws", async () => {
    const executor = new ActivepiecesBlockExecutor({
      cacheDir,
      worker,
      onPieceLog: () => {
        throw new Error("the log sink is down");
      },
    });

    const result = await executor.execute(execution("@test/noisy@1.0.0#talk"));

    expect(result.output).toEqual({ done: true });
  });
});
