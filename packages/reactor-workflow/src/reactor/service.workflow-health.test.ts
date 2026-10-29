// What a host-side reconciler reads about a workflow it built: the trigger
// as armed, and the park that holds it after a failed run, which outlives
// the trigger row's own status.
import type { OperationWithContext } from "document-model";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { testRuntime } from "../../test/helpers/runtime.js";
import { packagePieces } from "./piece-registry.js";
import type { WorkflowRuntimeService } from "./service.js";
import { WorkflowTriggersReadModel } from "./workflow-triggers-read-model.js";

const PIECE = "@acme/piece-health";
const WORKFLOW = "wf-health";

const FIXTURE = `
export const health = {
  displayName: "Health",
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

let ordinal = 0;

function enabled(): OperationWithContext {
  ordinal += 1;
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

describe("workflow health", () => {
  let dir = "";
  let service: WorkflowRuntimeService;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "ph-workflow-health-"));
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

  it("knows nothing of a workflow it never armed", async () => {
    expect(await service.workflowHealth("wf-unknown")).toEqual({
      trigger: null,
      park: null,
    });
  });

  it("reports the armed trigger, then the park a failed run leaves, through the read model too", async () => {
    await service.onOperations([enabled()]);
    await vi.waitFor(
      async () =>
        expect((await service.workflowHealth(WORKFLOW)).trigger?.status).toBe(
          "ENABLED",
        ),
      { timeout: 30_000 },
    );
    const armed = await service.workflowHealth(WORKFLOW);
    expect(armed.park).toBeNull();
    expect(armed.trigger).toMatchObject({
      lastError: null,
      lastPollAt: null,
      consecutiveFailures: 0,
    });
    expect(armed.trigger?.nextPollAt).toEqual(expect.any(String));

    const store = (await service.store())!;
    await store.parkWorkflow(WORKFLOW, 1, 'Step "map" failed: no action');

    // The read model a processor gets from getReadModel answers the same
    const model = Object.create(
      WorkflowTriggersReadModel.prototype,
    ) as WorkflowTriggersReadModel;
    Object.defineProperty(model, "runtime", { value: service });
    const parked = await model.health(WORKFLOW);
    expect(parked.park).toMatchObject({
      reason: 'Step "map" failed: no action',
      publishedVersion: 1,
    });
    expect(parked.park?.parkedAt).toEqual(expect.any(String));
  }, 60_000);
});
