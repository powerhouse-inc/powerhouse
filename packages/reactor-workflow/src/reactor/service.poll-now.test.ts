// "Sync now": a workflow's trigger runs at once instead of at its interval.
import type { OperationWithContext } from "document-model";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { testRuntime } from "../../test/helpers/runtime.js";
import { packagePieces } from "./piece-registry.js";
import type { WorkflowRuntimeService } from "./service.js";

const PIECE = "@acme/piece-poll-now";
const WORKFLOW = "wf-poll-now";
// A signed-in caller, as GraphQL hands it over
const CTX = { headers: {}, db: {}, user: { address: "0xabc" } } as never;

const FIXTURE = `
export const pollNow = {
  displayName: "Poll now",
  actions: {},
  triggers: {
    poll: {
      name: "poll",
      displayName: "Poll",
      type: "POLLING",
      props: {},
      onEnable: async () => undefined,
      onDisable: async () => undefined,
      run: async () => [],
      test: async () => [],
    },
  },
};
`;

function enabled(): OperationWithContext {
  const state = {
    name: WORKFLOW,
    status: "ENABLED",
    version: 1,
    trigger: {
      id: "t1",
      pieceName: PIECE,
      pieceVersion: "1.0.0",
      triggerName: "poll",
      config: { pollEverySeconds: 300 },
    },
    steps: [],
    edges: [],
    variables: [],
  };
  return {
    operation: {
      index: 1,
      timestampUtcMs: "1",
      action: { type: "SET_WORKFLOW_STATUS", input: {} },
      resultingState: JSON.stringify(state),
    },
    context: {
      documentId: WORKFLOW,
      documentType: "powerhouse/workflow",
      scope: "global",
      branch: "main",
      ordinal: 1,
    },
  } as unknown as OperationWithContext;
}

describe("pollNow", () => {
  let dir = "";
  let service: WorkflowRuntimeService;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "ph-poll-now-"));
    const entryPath = join(dir, "index.mjs");
    await writeFile(entryPath, FIXTURE);
    packagePieces.setPieces([{ name: PIECE, version: "1.0.0", entryPath }]);
    service = testRuntime();
  });

  afterAll(async () => {
    service.shutdown();
    packagePieces.reset();
    await rm(dir, { recursive: true, force: true });
  });

  it("needs a caller, and refuses a workflow without an armed trigger", async () => {
    await expect(service.pollNow("wf-unknown")).rejects.toThrow(
      /authenticated/,
    );
    expect(await service.pollNow("wf-unknown", CTX)).toBe(false);
  });

  it("polls an armed trigger now instead of in 5 minutes", async () => {
    await service.onOperations([enabled()]);
    const store = (await service.store())!;
    await vi.waitFor(
      async () =>
        expect((await store.getTriggerState(WORKFLOW))?.status).toBe("ENABLED"),
      { timeout: 30_000 },
    );
    const armed = (await store.getTriggerState(WORKFLOW))!;
    expect(armed.last_poll_at).toBeNull();
    expect(Date.parse(armed.next_poll_at!)).toBeGreaterThan(
      Date.now() + 200_000,
    );

    expect(await service.pollNow(WORKFLOW, CTX)).toBe(true);
    await vi.waitFor(
      async () =>
        expect(
          (await store.getTriggerState(WORKFLOW))?.last_poll_at,
        ).not.toBeNull(),
      { timeout: 30_000 },
    );
    // The next one follows the interval from there
    const after = (await store.getTriggerState(WORKFLOW))!;
    expect(Date.parse(after.next_poll_at!)).toBeGreaterThan(
      Date.now() + 200_000,
    );
  }, 90_000);
});
