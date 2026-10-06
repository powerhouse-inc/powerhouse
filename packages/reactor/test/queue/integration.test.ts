import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EventBus } from "../../src/events/event-bus.js";
import type { JobFailedEvent } from "../../src/events/types.js";
import { ReactorEventTypes } from "../../src/events/types.js";
import { InMemoryQueue } from "../../src/queue/queue.js";
import type { JobAvailableEvent } from "../../src/queue/types.js";
import { QueueEventTypes } from "../../src/queue/types.js";
import { DocumentModelResolver } from "../../src/registry/document-model-resolver.js";
import { DocumentModelRegistry } from "../../src/registry/implementation.js";
import type { IDocumentModelLoader } from "../../src/registry/interfaces.js";
import { createTestAction, createTestJob } from "../factories.js";

const FIXTURE_PATH = fileURLToPath(
  new URL("../core/fixtures/model-barrel.mjs", import.meta.url),
);

/**
 * R1 backfill (docs/plans/2026-10-02-testing-policy.md): the queue /
 * resolver seam's admit path. queue/unit.test.ts:1234 composes the real
 * InMemoryQueue with the real DocumentModelResolver for the failing
 * loader, but the admitting half - a CREATE_DOCUMENT gated on a model the
 * resolver actually loads, imports, and registers - ran only against
 * NullDocumentModelResolver. Here the loader returns a file source and the
 * resolver's own resolveModelSources import does the loading, so a drift
 * in what the resolver registers versus what the queue admits fails this
 * test instead of the first dynamically loaded document in a deployment.
 */
describe("InMemoryQueue with a real DocumentModelResolver", () => {
  it("admits a CREATE_DOCUMENT once the resolver loads and registers its model", async () => {
    const eventBus = new EventBus();
    const registry = new DocumentModelRegistry();
    const loader: IDocumentModelLoader = {
      load: () =>
        Promise.resolve({ filePath: FIXTURE_PATH, exportName: "alphaModel" }),
    };
    const queue = new InMemoryQueue(
      eventBus,
      new DocumentModelResolver(registry, loader),
    );

    const available: JobAvailableEvent[] = [];
    const failed: JobFailedEvent[] = [];
    eventBus.subscribe(
      QueueEventTypes.JOB_AVAILABLE,
      (_type: number, data: JobAvailableEvent) => {
        available.push(data);
      },
    );
    eventBus.subscribe(
      ReactorEventTypes.JOB_FAILED,
      (_type: number, data: unknown) => {
        failed.push(data as JobFailedEvent);
      },
    );

    const job = createTestJob({
      id: "create-alpha",
      actions: [
        createTestAction({
          type: "CREATE_DOCUMENT",
          scope: "document",
          input: {
            documentId: "doc-alpha",
            model: "test/alpha",
            version: 0,
            protocolVersions: { "base-reducer": 2 },
          },
        }),
      ],
    });
    await queue.enqueue(job);

    expect(failed).toHaveLength(0);
    expect(available).toHaveLength(1);
    expect(available[0]!.jobId).toBe("create-alpha");

    const module = registry.getModule("test/alpha");
    expect(module.documentModel.global.id).toBe("test/alpha");

    const handle = await queue.dequeue(job.documentId, job.scope, job.branch);
    expect(handle?.job.id).toBe("create-alpha");
  });
});
