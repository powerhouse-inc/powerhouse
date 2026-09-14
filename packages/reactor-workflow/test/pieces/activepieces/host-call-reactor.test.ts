// ctx.reactor over the host call channel: a piece that ships inside a reactor
// package reads and writes documents without ever holding a reactor client.

// The gate is the point of the test — the handlers are registered per step and
// only for a locally resolved piece, so a fetched bundle cannot reach them.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ActivepiecesBlockExecutor,
  type ReactorPort,
} from "../../src/engine/blocks.js";
import type { PieceResolver } from "../../src/activepieces/resolver.js";
import type { BlockExecution } from "../../src/engine/types.js";
import { PieceWorker } from "../../src/activepieces/worker/host.js";

const REACTOR_FIXTURE = `
const app = {
  displayName: "Reactor Fixture",
  actions: {
    read: {
      name: "read",
      displayName: "Read",
      props: {},
      run: async (ctx) => {
        const models = await ctx.reactor.models();
        const document = await ctx.reactor.get({ documentId: "doc-1" });
        return { models, document };
      },
    },
    write: {
      name: "write",
      displayName: "Write",
      props: {},
      run: async (ctx) =>
        ctx.reactor.execute({
          documentId: "doc-1",
          actions: [{ type: "SET_NAME", input: { name: "Renamed" } }],
        }),
    },
    blind: {
      name: "blind",
      displayName: "Blind",
      props: {},
      run: async (ctx) => {
        try {
          await ctx.reactor.get({ documentId: "doc-1" });
          return { reached: true };
        } catch (error) {
          return { reached: false, message: String(error.message) };
        }
      },
    },
    malformed: {
      name: "malformed",
      displayName: "Malformed",
      props: {},
      run: async (ctx) => {
        try {
          await ctx.reactor.get({});
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
let entryPath = "";
let worker: PieceWorker;

// Answers "local" for the package piece and falls through to the bundle
// layout for everything else, the way the runtime's registry does.
function resolver(local: boolean): PieceResolver {
  return {
    resolve(name: string, version: string) {
      return Promise.resolve(
        local
          ? { name, version, entryPath, local: true }
          : { name, version, bundleDir: join(cacheDir, "fetched"), local: false },
      );
    },
  };
}

function reactorPort(): ReactorPort & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    models() {
      calls.push("models");
      return Promise.resolve([
        { documentType: "powerhouse/workflow", name: "Workflow" },
      ]);
    },
    model(documentType) {
      calls.push(`model ${documentType}`);
      return Promise.resolve({
        documentType,
        name: "Workflow",
        stateSchema: null,
        actions: [],
      });
    },
    get(input) {
      calls.push(`get ${input.documentId}`);
      return Promise.resolve({
        documentId: input.documentId,
        documentType: "powerhouse/workflow",
        name: "A workflow",
        state: { name: "A workflow" },
      });
    },
    find() {
      calls.push("find");
      return Promise.resolve([]);
    },
    create(input) {
      calls.push(`create ${input.documentType}`);
      return Promise.resolve({
        documentId: "new-1",
        documentType: input.documentType,
        name: input.name ?? "",
      });
    },
    execute(input) {
      calls.push(`execute ${input.actions.map((a) => a.type).join(",")}`);
      return Promise.resolve({
        documentId: input.documentId,
        documentType: "powerhouse/workflow",
        name: "Renamed",
        state: { name: "Renamed" },
      });
    },
  };
}

function execution(blockType: string): BlockExecution {
  return {
    blockType,
    config: {},
    step: { id: "s1", key: "step", blockType } as BlockExecution["step"],
  };
}

describe("ctx.reactor over the host call channel", () => {
  beforeAll(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "ap-reactor-call-"));
    worker = new PieceWorker();
    // The package-piece shape: one module file, no bundle directory.
    entryPath = join(cacheDir, "piece-reactor.js");
    await writeFile(entryPath, REACTOR_FIXTURE);
    // The fetched shape the same source is served under, for the gate test.
    const fetched = join(cacheDir, "fetched");
    await mkdir(fetched, { recursive: true });
    await writeFile(
      join(fetched, "package.json"),
      JSON.stringify({ name: "@test/fetched", version: "1.0.0", main: "index.js" }),
    );
    await writeFile(join(fetched, "index.js"), REACTOR_FIXTURE);
  });

  afterAll(async () => {
    worker.dispose();
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("serves a local piece's reads from the host's reactor", async () => {
    const port = reactorPort();
    const executor = new ActivepiecesBlockExecutor({
      cacheDir,
      worker,
      resolver: resolver(true),
      reactor: port,
    });

    const result = await executor.execute(
      execution("@powerhousedao/piece-reactor@1.0.0#read"),
    );

    expect(result.output).toEqual({
      models: [{ documentType: "powerhouse/workflow", name: "Workflow" }],
      document: {
        documentId: "doc-1",
        documentType: "powerhouse/workflow",
        name: "A workflow",
        state: { name: "A workflow" },
      },
    });
    expect(port.calls).toEqual(["models", "get doc-1"]);
  });

  it("carries a dispatch through to the port", async () => {
    const port = reactorPort();
    const executor = new ActivepiecesBlockExecutor({
      cacheDir,
      worker,
      resolver: resolver(true),
      reactor: port,
    });

    const result = await executor.execute(
      execution("@powerhousedao/piece-reactor@1.0.0#write"),
    );

    expect(port.calls).toEqual(["execute SET_NAME"]);
    expect((result.output as { name: string }).name).toBe("Renamed");
  });

  it("refuses a fetched bundle the same piece code", async () => {
    const port = reactorPort();
    const executor = new ActivepiecesBlockExecutor({
      cacheDir,
      worker,
      resolver: resolver(false),
      reactor: port,
    });

    const result = await executor.execute(
      execution("@test/fetched@1.0.0#blind"),
    );

    const output = result.output as { reached: boolean; message: string };
    expect(output.reached).toBe(false);
    // By name, so an author sees which member the piece may not use here.
    expect(output.message).toContain("reactor.get");
    expect(port.calls).toEqual([]);
  });

  it("keeps the member throwing when no port is configured", async () => {
    const executor = new ActivepiecesBlockExecutor({
      cacheDir,
      worker,
      resolver: resolver(true),
    });

    const result = await executor.execute(
      execution("@powerhousedao/piece-reactor@1.0.0#blind"),
    );

    expect((result.output as { reached: boolean }).reached).toBe(false);
  });

  it("rejects a call that names no document", async () => {
    const port = reactorPort();
    const executor = new ActivepiecesBlockExecutor({
      cacheDir,
      worker,
      resolver: resolver(true),
      reactor: port,
    });

    const result = await executor.execute(
      execution("@powerhousedao/piece-reactor@1.0.0#malformed"),
    );

    const output = result.output as { threw: boolean; message: string };
    expect(output.threw).toBe(true);
    expect(output.message).toContain("documentId");
    expect(port.calls).toEqual([]);
  });
});
