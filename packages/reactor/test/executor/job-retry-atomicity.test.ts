import type { Operation } from "@powerhousedao/shared/document-model";
import {
  setModelDescription,
  setModelName,
  sortOperations,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { JobStatus } from "../../src/shared/types.js";
import { KyselyOperationStore } from "../../src/storage/kysely/store.js";
import { createDocModelDocument } from "../factories.js";

/**
 * A retry re-runs a job's whole action list, so what the attempt before it left
 * behind is applied a second time. Nothing dedupes it: the store's uniqueness
 * is on (opId, index, skip), and the retry writes the same actions at new
 * indices. Rolling a failed job back is what keeps a retry from duplicating.
 */
describe("a retry after a mid-run failure", () => {
  let reactor: IReactor;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    reactor?.kill();
    vi.useRealTimers();
  });

  async function settle(jobId: string): Promise<string | undefined> {
    await vi.waitUntil(async () => {
      const status = await reactor.getJobStatus(jobId);
      return (
        status.status === JobStatus.FAILED ||
        status.status === JobStatus.READ_READY
      );
    });
    const status = await reactor.getJobStatus(jobId);
    return status.status === JobStatus.FAILED
      ? (status.error?.message ?? "job failed")
      : undefined;
  }

  it("does not apply the writes before the failure a second time", async () => {
    // One apply per action, so the failure can land between two writes rather
    // than taking the whole batch with it.
    reactor = await new ReactorBuilder()
      .withDocumentModelSources([documentModelDocumentModelModule as never])
      .withExecutorConfig({ batchApplies: false })
      .build();

    const document = createDocModelDocument({ id: "retry-duplication" });
    expect(await settle((await reactor.create(document)).id)).toBeUndefined();

    // The second of the run's writes fails once, transiently: a fault the job
    // is retried for, not a refusal it is failed for.
    const apply = KyselyOperationStore.prototype.apply;
    let failed = false;
    vi.spyOn(KyselyOperationStore.prototype, "apply").mockImplementation(
      function (
        this: KyselyOperationStore,
        ...args: Parameters<KyselyOperationStore["apply"]>
      ) {
        const scope = args[2];
        const revision = args[4];
        if (!failed && scope === "global" && revision === 1) {
          failed = true;
          return Promise.reject(new Error("transient store failure"));
        }
        return apply.apply(this, args);
      },
    );

    vi.setSystemTime(new Date("2026-01-01T00:00:01.000Z"));
    const failure = await settle(
      (
        await reactor.execute(document.header.id, "main", [
          setModelName({ name: "named" }),
          setModelDescription({ description: "described" }),
        ])
      ).id,
    );

    expect(failed).toBe(true);
    expect(failure).toBeUndefined();

    const result = await reactor.getOperations(document.header.id, {
      branch: "main",
      scopes: ["global"],
    });
    const stored = sortOperations([
      ...((result as Record<string, { results: Operation[] } | undefined>)
        .global?.results ?? []),
    ]);

    // The failed attempt left nothing, so the retry's writes are the only ones.
    expect(stored.map((operation) => operation.action.type)).toEqual([
      "SET_MODEL_NAME",
      "SET_MODEL_DESCRIPTION",
    ]);
    expect(new Set(stored.map((operation) => operation.action.id)).size).toBe(
      2,
    );
  });
});
