// A run's async context can outlive the run: a timer, a listener or a Node
// internal may hold on to it. Holding it must not hold the run's output, or a
// process running workflows grows by whole payloads until it dies.
import { actions } from "@powerhousedao/workflow/document-models/workflow";
import { AsyncResource } from "node:async_hooks";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Documents } from "../../test/helpers/documents.js";
import { createFreshRelationalDb } from "../../test/helpers/pglite.js";
import { testRuntime } from "../../test/helpers/runtime.js";
import { CORE_PIECE_VERSION } from "../pieces/index.js";
import { packagePieces } from "./piece-registry.js";
import { runScopeStats } from "./run-scope.js";
import type { WorkflowRuntimeService } from "./service.js";

setFlagsFromString("--expose-gc");
const gc = runInNewContext("gc") as () => void;

const PIECE = "@acme/piece-run-scope";
const CTX = { headers: {}, db: {}, user: { address: "0xabc" } } as never;
const RUNS = 6;

const FIXTURE = `
export const scoped = {
  displayName: "Run scope",
  actions: {
    upload: {
      name: "upload",
      displayName: "Upload",
      props: {},
      run: async (ctx) => {
        const uploaded = await ctx.files.upload({
          fileName: "note.txt",
          data: Buffer.from("note"),
        });
        return { ref: uploaded.id };
      },
    },
  },
  triggers: {},
};
`;

async function collectGarbage() {
  for (let turn = 0; turn < 10; turn++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    gc();
  }
}

let dir = "";
let documents: Documents;
let service: WorkflowRuntimeService;
const pinned: AsyncResource[] = [];

function workflow(id: string) {
  documents.apply(
    id,
    actions.setTrigger({
      id: "t1",
      pieceName: "@powerhousedao/piece-core",
      pieceVersion: CORE_PIECE_VERSION,
      triggerName: "manual",
      config: {},
    }),
    actions.addStep({
      id: "up",
      key: "up",
      name: "up",
      pieceName: PIECE,
      pieceVersion: "1.0.0",
      actionName: "upload",
      config: {},
    }),
    actions.addEdge({ id: "e0", from: "t1", to: "up", port: "next" }),
    actions.publishWorkflow({ publishedAt: "2026-01-01T00:00:00.000Z" }),
    actions.setWorkflowStatus({ status: "ENABLED" }),
  );
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "rw-run-scope-"));
  const entryPath = join(dir, "index.mjs");
  await writeFile(entryPath, FIXTURE);
  packagePieces.setPieces([{ name: PIECE, version: "1.0.0", entryPath }]);
  documents = new Documents();
  service = testRuntime({
    relationalDb: createFreshRelationalDb(),
    reactorClient: {
      ...documents.client(),
      getOperations: () =>
        Promise.resolve({ results: [], options: { cursor: "", limit: 0 } }),
    } as never,
    attachments: {
      upload: () => {
        // Created in the run's async context and kept, as `Blob.stream()` keeps it.
        pinned.push(new AsyncResource("pin"));
        return Promise.resolve({
          ref: `attachment://v1:${"0".repeat(64)}`,
        });
      },
      download: () => Promise.reject(new Error("not used")),
    },
  });
});

afterAll(async () => {
  service.shutdown();
  packagePieces.reset();
  await rm(dir, { recursive: true, force: true });
});

describe("a run whose async context outlives it", () => {
  it("does not keep the run's result", async () => {
    let finished = 0;
    let collected = 0;
    const registry = new FinalizationRegistry(() => {
      collected += 1;
    });
    const store = (await service.store())!;
    const finishRun = store.finishRun.bind(store);
    store.finishRun = (runId, result, ...rest) => {
      finished += 1;
      registry.register(result, runId);
      return finishRun(runId, result, ...rest);
    };

    workflow("wf-scoped");
    for (let run = 0; run < RUNS; run++) {
      const fired = await service.fire(
        "wf-scoped",
        undefined,
        "manual",
        undefined,
        CTX,
      );
      expect(fired.status).toBe("SUCCEEDED");
    }
    await collectGarbage();

    expect(pinned).toHaveLength(RUNS);
    expect(finished).toBe(RUNS);
    expect(collected).toBeGreaterThan(RUNS / 2);
  });

  it("shows on the gauge until it is let go", async () => {
    await collectGarbage();
    expect(pinned.length).toBeGreaterThan(0);
    expect(runScopeStats().held).toBeGreaterThanOrEqual(pinned.length);

    pinned.length = 0;
    await collectGarbage();
    expect(runScopeStats().held).toBeLessThan(RUNS / 2);
  });
});
