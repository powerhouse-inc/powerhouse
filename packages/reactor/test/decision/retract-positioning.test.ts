import type {
  Action,
  DocumentModelDocument,
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  addModule,
  positionalOperations,
  retract,
  retractionTarget,
} from "@powerhousedao/shared/document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InProcessReactorModule } from "../../src/core/types.js";
import { firstOutOfOrderPair } from "../../src/decision/stream-order.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";
import {
  assertOneRuleAgreement,
  storedRows,
} from "../executor/one-rule-agreement.js";
import {
  createBaseReducer3Document,
  createUndoV3ReactorBuilder,
} from "../factories.js";

/** A RETRACT is labelled by what it names, so `RETRACT(b)` retracts module b. */
function shape(stream: Operation[]): string {
  const byId = new Map(
    stream.map((operation) => [operation.action.id, operation]),
  );
  const label = (operation: Operation | undefined): string => {
    if (operation === undefined) return "?";
    const target = retractionTarget(operation);
    if (target !== undefined) return `RETRACT(${label(byId.get(target))})`;
    return (operation.action.input as { id: string }).id;
  };
  return stream
    .map(
      (operation) => `${operation.index}:${label(operation)}/${operation.skip}`,
    )
    .join(" ");
}

function labels(stream: Operation[]): string[] {
  return shape(stream)
    .split(" ")
    .map((entry) =>
      entry.slice(entry.indexOf(":") + 1, entry.lastIndexOf("/")),
    );
}

// positionByTimestamp re-appends what garbageCollect keeps; RETRACT rows are rows.
describe("positionByTimestamp on base-reducer 3", () => {
  let module: InProcessReactorModule;
  let document: PHDocument;
  let docId: string;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    module = await createUndoV3ReactorBuilder({
      featureFlags: { documentDecisions: true },
    })
      .withWriteCacheConfig({ keyframeInterval: 2 })
      .buildModule();
    document = createBaseReducer3Document({ signaturePolicy: "legacy" });
    docId = document.header.id;
    await settle((await module.reactor.create(document)).id);
  });

  afterEach(() => {
    module.reactor.kill();
    vi.useRealTimers();
  });

  async function settle(jobId: string): Promise<void> {
    await vi.waitUntil(
      async () => {
        const { status } = await module.reactor.getJobStatus(jobId);
        return status === JobStatus.READ_READY || status === JobStatus.FAILED;
      },
      { timeout: 10_000 },
    );
    const status = await module.reactor.getJobStatus(jobId);
    if (status.status === JobStatus.FAILED) {
      throw new Error(status.error?.message ?? "job failed");
    }
  }

  /** Stamped `second` seconds after creation; the reactor keeps the stamp. */
  function at<T extends Action>(action: T, second: number): T {
    return {
      ...action,
      timestampUtcMs: new Date(
        Date.UTC(2026, 0, 1, 0, 0, second),
      ).toISOString(),
    };
  }

  async function execute(action: Action): Promise<void> {
    await settle((await module.reactor.execute(docId, "main", [action])).id);
  }

  async function executeJob(actions: Action[]): Promise<JobInfo> {
    const job = await module.reactor.execute(docId, "main", actions);
    await vi.waitUntil(
      async () => {
        const { status } = await module.reactor.getJobStatus(job.id);
        return status === JobStatus.READ_READY || status === JobStatus.FAILED;
      },
      { timeout: 10_000 },
    );
    return module.reactor.getJobStatus(job.id);
  }

  function expectRefused(job: JobInfo, reason: string): void {
    expect(job.status).toBe(JobStatus.FAILED);
    expect(job.error?.name).toBe("RetractionRefusedError");
    expect(job.error?.message).toContain(reason);
  }

  async function add(id: string, second: number): Promise<Action> {
    const action = at(addModule({ id, name: id }), second);
    await execute(action);
    return action;
  }

  async function served(): Promise<string[]> {
    const current = await module.reactor.get<DocumentModelDocument>(docId);
    return current.state.global.specifications[0].modules.map(
      (entry) => entry.id,
    );
  }

  async function check(expected: {
    stream: string;
    positional: string[];
    served: string[];
  }): Promise<void> {
    const stream = await storedRows(module, docId);
    expect(shape(stream)).toBe(expected.stream);
    expect(labels(positionalOperations(stream))).toEqual(expected.positional);
    expect(await served()).toEqual(expected.served);
    await assertOneRuleAgreement({ module, document });
  }

  it("moves a backdated RETRACT below a later row", async () => {
    const a = await add("a", 1);
    await add("b", 3);

    await execute(at(retract(a.id), 2));

    await check({
      stream: "0:a/0 1:b/0 2:RETRACT(a)/1 3:b/0",
      positional: ["a", "RETRACT(a)", "b"],
      served: ["b"],
    });
  });

  it("retracts a target the backdated RETRACT now sits before", async () => {
    await add("a", 1);
    const b = await add("b", 3);

    await execute(at(retract(b.id), 2));

    await check({
      stream: "0:a/0 1:b/0 2:RETRACT(b)/1 3:b/0",
      positional: ["a", "RETRACT(b)", "b"],
      served: ["a"],
    });
  });

  it("re-appends a stored RETRACT when a backdated write moves it", async () => {
    await add("a", 1);
    const b = await add("b", 3);
    await execute(at(retract(b.id), 4));

    await add("z", 2);

    await check({
      stream: "0:a/0 1:b/0 2:RETRACT(b)/0 3:z/2 4:b/0 5:RETRACT(b)/0",
      positional: ["a", "z", "b", "RETRACT(b)"],
      served: ["a", "z"],
    });
  });

  it("positions a backdated RETRACT with the rewind on it", async () => {
    await add("a", 1);
    const b = await add("b", 3);

    await execute(at(retract(b.id), 2));

    await check({
      stream: "0:a/0 1:b/0 2:RETRACT(b)/1 3:b/0",
      positional: ["a", "RETRACT(b)", "b"],
      served: ["a"],
    });
  });

  it("keeps the stream in timestamp order across a backdated RETRACT", async () => {
    await add("a", 1);
    const b = await add("b", 4);
    const backdated = at(retract(b.id), 3);

    await execute(backdated);

    const rows = await storedRows(module, docId);
    const retraction = rows.find(
      (operation) => operation.action.type === "RETRACT",
    )!;
    expect(retraction.action.id).toBe(backdated.id);
    expect(retraction.action.timestampUtcMs).toBe(backdated.timestampUtcMs);
    expect(retraction.timestampUtcMs).toBe(backdated.timestampUtcMs);
    expect(firstOutOfOrderPair(rows)).toBeUndefined();

    await add("z", 2);

    expect(
      firstOutOfOrderPair(await storedRows(module, docId)),
    ).toBeUndefined();
    await check({
      stream: "0:a/0 1:b/0 2:RETRACT(b)/1 3:b/0 4:z/3 5:RETRACT(b)/0 6:b/0",
      positional: ["a", "z", "RETRACT(b)", "b"],
      served: ["a", "z"],
    });
  });
  it("admits every RETRACT of a backdated job whose first rewinds the others' targets", async () => {
    await add("a", 1);
    const b = await add("b", 3);
    const c = await add("c", 4);

    const job = await executeJob([at(retract(b.id), 2), at(retract(c.id), 2)]);

    expect(job.error?.message ?? job.status).toBe(JobStatus.READ_READY);
    await check({
      stream: "0:a/0 1:b/0 2:c/0 3:RETRACT(b)/2 4:RETRACT(c)/0 5:b/0 6:c/0",
      positional: ["a", "RETRACT(b)", "RETRACT(c)", "b", "c"],
      served: ["a"],
    });
  });

  it("admits a RETRACT whose target the job re-appends before it", async () => {
    await add("a", 1);
    const b = await add("b", 3);
    const c = await add("c", 5);

    const job = await executeJob([at(retract(b.id), 2), at(retract(c.id), 4)]);

    expect(job.error?.message ?? job.status).toBe(JobStatus.READ_READY);
    await check({
      stream: "0:a/0 1:b/0 2:c/0 3:RETRACT(b)/2 4:b/0 5:RETRACT(c)/0 6:c/0",
      positional: ["a", "RETRACT(b)", "b", "RETRACT(c)", "c"],
      served: ["a"],
    });
  });

  it("admits every RETRACT of a job tied with targets that sort after it", async () => {
    await add("a", 1);
    const b = at({ ...addModule({ id: "b", name: "b" }), id: "~b" }, 3);
    const c = at({ ...addModule({ id: "c", name: "c" }), id: "~c" }, 3);
    await execute(b);
    await execute(c);

    const job = await executeJob([at(retract(b.id), 3), at(retract(c.id), 3)]);

    expect(job.error?.message ?? job.status).toBe(JobStatus.READ_READY);
    expect(await served()).toEqual(["a"]);
    await assertOneRuleAgreement({ module, document });
  });

  it("still refuses a backdated RETRACT whose target is absent", async () => {
    await add("a", 1);
    const b = await add("b", 3);
    const before = await storedRows(module, docId);

    expectRefused(
      await executeJob([at(retract(b.id), 2), at(retract("missing"), 2)]),
      "target-missing",
    );

    expect(await storedRows(module, docId)).toEqual(before);
    expect(await served()).toEqual(["a", "b"]);
  });

  it("still refuses a backdated RETRACT of a target the job already retracts", async () => {
    await add("a", 1);
    const b = await add("b", 3);

    expectRefused(
      await executeJob([at(retract(b.id), 2), at(retract(b.id), 2)]),
      "target-retracted",
    );

    expect(await served()).toEqual(["a", "b"]);
  });

  it("still refuses a backdated RETRACT of a target a moved RETRACT retracts", async () => {
    await add("a", 1);
    const b = await add("b", 3);
    await execute(at(retract(b.id), 4));

    expectRefused(await executeJob([at(retract(b.id), 2)]), "target-retracted");

    expect(await served()).toEqual(["a"]);
  });
});
