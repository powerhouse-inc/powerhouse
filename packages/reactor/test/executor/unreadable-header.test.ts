import { addModule } from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KyselyWriteCache } from "../../src/cache/kysely-write-cache.js";
import type { InProcessReactorModule } from "../../src/core/types.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";
import {
  createBaseReducer3Document,
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

  it("retries a mutation whose header read failed once", async () => {
    module = await createUndoV3ReactorBuilder({
      featureFlags: { documentDecisions: true },
    }).buildModule();
    const document = createBaseReducer3Document({ signaturePolicy: "legacy" });
    const docId = document.header.id;
    expect((await settle(await module.reactor.create(document))).status).toBe(
      JobStatus.READ_READY,
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

    const job = await settle(
      await module.reactor.execute(docId, "main", [
        addModule({ id: "a", name: "a" }),
      ]),
    );

    expect(failures).toBeLessThan(1);
    expect(job.error?.message ?? job.status).toBe(JobStatus.READ_READY);
    const rows = await module.operationStore.getSince(
      docId,
      "global",
      "main",
      -1,
    );
    expect(rows.results.map((operation) => operation.action.type)).toEqual([
      "ADD_MODULE",
    ]);
  });
});
