import { addModule } from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { documentModelDocumentModelModule } from "document-model";
import { KyselyWriteCache } from "../../src/cache/kysely-write-cache.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import {
  ReactorEventTypes,
  type JobRunningEvent,
} from "../../src/events/types.js";
import type { InProcessReactorModule } from "../../src/core/types.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";
import {
  createBaseReducer3Document,
  createDocModelDocument,
  createUndoV3ReactorBuilder,
} from "../factories.js";

// documentDecisions makes the mutation read the stored header through the write cache.
describe("an unreadable stored header", () => {
  let module: InProcessReactorModule | undefined;

  afterEach(() => {
    vi.restoreAllMocks();
    module?.reactor.kill();
    module = undefined;
  });

  async function settle(job: JobInfo): Promise<JobInfo> {
    await vi.waitUntil(
      async () => {
        const { status } = await module!.reactor.getJobStatus(job.id);
        return status === JobStatus.READ_READY || status === JobStatus.FAILED;
      },
      { timeout: 10_000 },
    );
    return module!.reactor.getJobStatus(job.id);
  }

  /** Fails the first document-scope read through the write cache, and counts attempts. */
  function failHeaderReadOnce(): {
    failures: () => number;
    runs: (jobId: string) => number;
  } {
    const started: string[] = [];
    module!.eventBus.subscribe<JobRunningEvent>(
      ReactorEventTypes.JOB_RUNNING,
      (_type, event) => {
        started.push(event.jobId);
      },
    );
    // On the prototype: each execution scope reads through its own instance.
    const getState = KyselyWriteCache.prototype.getState;
    let failures = 1;
    vi.spyOn(KyselyWriteCache.prototype, "getState").mockImplementation(
      function (this: KyselyWriteCache, ...args) {
        return args[1] === "document" && failures-- > 0
          ? Promise.reject(new Error("connection reset"))
          : getState.apply(this, args);
      },
    );
    return {
      failures: () => failures,
      runs: (jobId) => started.filter((id) => id === jobId).length,
    };
  }

  async function globalTypes(docId: string): Promise<string[]> {
    const rows = await module!.operationStore.getSince(
      docId,
      "global",
      "main",
      -1,
    );
    return rows.results.map((operation) => operation.action.type);
  }

  it("retries a mutation whose header read failed once", async () => {
    module = await createUndoV3ReactorBuilder({
      featureFlags: { documentDecisions: true },
    }).buildModule();
    const document = createBaseReducer3Document({ signaturePolicy: "legacy" });
    const docId = document.header.id;
    expect((await settle(await module.reactor.create(document))).status).toBe(
      JobStatus.READ_READY,
    );
    expect(
      (await module.reactor.get(docId)).header.protocolVersions?.[
        "base-reducer"
      ],
    ).toBe(3);

    const read = failHeaderReadOnce();

    const job = await settle(
      await module.reactor.execute(docId, "main", [
        addModule({ id: "a", name: "a" }),
      ]),
    );

    expect(read.failures()).toBeLessThan(1);
    expect(job.error?.message ?? job.status).toBe(JobStatus.READ_READY);
    expect(read.runs(job.id)).toBe(2);
    expect(await globalTypes(docId)).toEqual(["ADD_MODULE"]);
  });

  it("lets a base-reducer 2 mutation's own reads decide, as before", async () => {
    module = await new ReactorBuilder()
      .withDocumentModelSources([documentModelDocumentModelModule as never])
      .withExecutorConfig({ featureFlags: { documentDecisions: true } })
      .buildModule();
    const document = createDocModelDocument({
      signaturePolicy: "legacy",
      protocolVersions: { "base-reducer": 2 },
    });
    const docId = document.header.id;
    expect((await settle(await module.reactor.create(document))).status).toBe(
      JobStatus.READ_READY,
    );
    expect(
      (await module.reactor.get(docId)).header.protocolVersions?.[
        "base-reducer"
      ],
    ).toBe(2);

    const read = failHeaderReadOnce();

    const job = await settle(
      await module.reactor.execute(docId, "main", [
        addModule({ id: "a", name: "a" }),
      ]),
    );

    expect(read.failures()).toBeLessThan(1);
    expect(job.error?.message ?? job.status).toBe(JobStatus.READ_READY);
    expect(read.runs(job.id)).toBe(1);
    expect(await globalTypes(docId)).toEqual(["ADD_MODULE"]);
  });
});
