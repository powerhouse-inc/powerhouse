// A step's piece is told which run, workflow, project and step it is, through
// the real executor and worker: the ids a piece keys external state on.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestRelationalDb } from "../../test/helpers/pglite.js";
import { testRuntime } from "../../test/helpers/runtime.js";
import { sourcedResolver, type PieceResolver } from "../pieces/index.js";
import { PROJECT_SCOPE_KEY } from "./piece-store-port.js";
import { packagePieces } from "./piece-registry.js";
import { WorkflowRunStore } from "./store.js";
import { TriggerSupervisor } from "./trigger-supervisor.js";
import { CORE_PIECE_VERSION } from "../pieces/index.js";

const PIECE = "@powerhousedao/piece-identity";
const WORKFLOW_ID = "wf-identity";

const FIXTURE = `
export const identity = {
  displayName: "Identity",
  actions: {
    whoami: {
      name: "whoami",
      displayName: "Who am I",
      props: {},
      run: async (ctx) => ({
        run: ctx.run.id,
        flow: ctx.flows.current.id,
        project: ctx.project.id,
        step: ctx.step.name,
      }),
    },
  },
  triggers: {
    poll: {
      name: "poll",
      displayName: "Poll",
      type: "POLLING",
      props: {},
      test: async (ctx) => [
        { flow: ctx.flows.current.id, project: ctx.project.id, step: ctx.step.name },
      ],
    },
  },
};
`;

function workflowDocument() {
  return {
    header: { documentType: "powerhouse/workflow", name: "Identity" },
    state: {
      global: {
        name: "Identity",
        status: "ENABLED",
        version: 1,
        trigger: {
          id: "t1",
          pieceName: "@powerhousedao/piece-core",
          pieceVersion: CORE_PIECE_VERSION,
          triggerName: "manual",
          config: {},
        },
        steps: [
          {
            id: "s1",
            key: "ask",
            name: "Ask",
            pieceName: PIECE,
            pieceVersion: "1.0.0",
            actionName: "whoami",
            config: {},
          },
        ],
        edges: [{ id: "e1", from: "t1", to: "s1", port: "next" }],
        variables: [],
      },
    },
  };
}

const CTX = { headers: {}, db: {}, user: { address: "0xabc" } } as never;

describe("the identity a step's piece is handed", () => {
  let dir = "";

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "ph-run-identity-"));
    const entryPath = join(dir, "index.mjs");
    await writeFile(entryPath, FIXTURE);
    packagePieces.setPieces([{ name: PIECE, version: "1.0.0", entryPath }]);
  });

  afterAll(async () => {
    packagePieces.reset();
    await rm(dir, { recursive: true, force: true });
  });

  it("is the run, the workflow, the reactor and the step key", async () => {
    const service = testRuntime({
      reactorClient: {
        find: () => Promise.resolve({ results: [] }),
        get: () => Promise.resolve(workflowDocument()),
      },
    } as never);
    try {
      const result = await service.fire(
        WORKFLOW_ID,
        undefined,
        "manual",
        undefined,
        CTX,
      );
      expect(result.status).toBe("SUCCEEDED");
      expect(result.runId).toBeTruthy();
      expect(result.steps[0]?.output).toEqual({
        run: result.runId,
        flow: WORKFLOW_ID,
        project: PROJECT_SCOPE_KEY,
        step: "ask",
      });
    } finally {
      service.shutdown();
    }
  }, 60_000);

  it("gives a trigger hook the workflow and the reactor", async () => {
    const store = await WorkflowRunStore.create(createTestRelationalDb());
    const nowhere: PieceResolver = {
      resolve: () => Promise.reject(new Error("not a package piece")),
    };
    const supervisor = new TriggerSupervisor({
      store: () => Promise.resolve(store),
      resolveAuth: () => Promise.resolve(undefined),
      fire: () => undefined,
      cacheDir: dir,
      // The binding names an installed piece.
      resolver: {
        resolve: (target) =>
          sourcedResolver({ cacheDir: dir, lookup: packagePieces.lookup })
            .resolve({ ...target, source: "local" })
            .catch(() => nowhere.resolve(target)),
      },
    });
    try {
      const output = await supervisor.test({
        workflowId: WORKFLOW_ID,
        block: {
          pieceName: PIECE,
          pieceVersion: "1.0.0",
          kind: "trigger" as const,
          name: "poll",
        },
        packageName: PIECE,
        version: "1.0.0",
        triggerName: "poll",
        config: {},
        connectionId: null,
      });
      // Upstream names every trigger step "trigger".
      expect(output).toEqual([
        { flow: WORKFLOW_ID, project: PROJECT_SCOPE_KEY, step: "trigger" },
      ]);
    } finally {
      supervisor.stop();
    }
  }, 60_000);
});
