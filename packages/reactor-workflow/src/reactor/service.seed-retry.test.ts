// Seeding runs once, from the constructor: a sweep that fails and is not
// retried leaves every poll and webhook trigger inert with nothing to say so.
import { describe, expect, it, vi } from "vitest";
import { testRuntime } from "../../test/helpers/runtime.js";

const WORKFLOW = "wf-seeded";

function workflowDocument() {
  return {
    header: { id: WORKFLOW, documentType: "powerhouse/workflow" },
    state: {
      global: {
        name: "Polled",
        status: "ENABLED",
        version: 1,
        trigger: { id: "t1", blockType: "core#schedule", config: {} },
        steps: [],
        edges: [],
        variables: [],
      },
    },
  };
}

describe("seeding the trigger registry", () => {
  it("retries a failed sweep and arms what it finds", async () => {
    const find = vi
      .fn()
      .mockRejectedValueOnce(new Error("database is starting"))
      .mockResolvedValue({ results: [workflowDocument()] });
    const service = testRuntime({ reactorClient: { find } } as never);

    expect(await service.seedFailure()).toBeUndefined();
    expect(find).toHaveBeenCalledTimes(2);
    // Armed off the retry, which is what the trigger supervisor reads.
    expect(await service.webhookPolicy(WORKFLOW)).toBeUndefined();
    expect(
      (service as unknown as { registry: Map<string, unknown> }).registry.has(
        WORKFLOW,
      ),
    ).toBe(true);
  });

  it("reports the failure once the retries are spent", async () => {
    const error = new Error("database is gone");
    const find = vi.fn().mockRejectedValue(error);
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
      child: vi.fn(),
    };
    const service = testRuntime({
      reactorClient: { find },
      logger,
    } as never);

    // Resolved, not rejected: a delivery racing a dead registry is still
    // answered as an unknown token rather than as a broken endpoint.
    expect(await service.seedFailure()).toBe(error);
    expect(find).toHaveBeenCalledTimes(3);
    expect(logger.error.mock.calls[0][0]).toContain(
      "until the reactor restarts",
    );
  });
});
