// Seeding runs once, from the constructor: a sweep that fails and is not
// retried leaves every poll and webhook trigger inert with nothing to say so.
import { describe, expect, it } from "vitest";
import { testRuntime } from "../../test/helpers/runtime.js";
import { CORE_PIECE_VERSION } from "../pieces/index.js";

const WORKFLOW = "wf-seeded";

function workflowDocument() {
  return {
    header: { id: WORKFLOW, documentType: "powerhouse/workflow" },
    state: {
      global: {
        name: "Hooked",
        status: "ENABLED",
        version: 1,
        trigger: {
          id: "t1",
          pieceName: "@powerhousedao/piece-core",
          pieceVersion: CORE_PIECE_VERSION,
          triggerName: "webhook",
          config: { scheme: "none" },
        },
        steps: [],
        edges: [],
        variables: [],
      },
    },
  };
}

describe("seeding the trigger registry", () => {
  it("retries a failed sweep and arms what it finds", async () => {
    let calls = 0;
    const find = () =>
      ++calls === 1
        ? Promise.reject(new Error("database is starting"))
        : Promise.resolve({ results: [workflowDocument()] });
    const service = testRuntime({ reactorClient: { find } } as never);

    expect(await service.seedFailure()).toBeUndefined();
    // Armed off the retry: an unarmed workflow has no policy at all.
    expect(await service.webhookPolicy(WORKFLOW)).toMatchObject({
      verify: undefined,
    });
  });

  it("reports the failure once the retries are spent", async () => {
    const error = new Error("database is gone");
    const service = testRuntime({
      reactorClient: { find: () => Promise.reject(error) },
    } as never);

    // Resolved, not rejected: a delivery racing a dead registry is still
    // answered as an unknown token rather than as a broken endpoint.
    expect(await service.seedFailure()).toBe(error);
    expect(await service.webhookPolicy(WORKFLOW)).toBeUndefined();
  });
});
