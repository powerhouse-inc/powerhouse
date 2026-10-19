// Run listing pages: newest first on (enqueued_at, id), filtered by access
// before the page is cut, so a page is short only at the end of the journal.
import type { IRelationalDb } from "@powerhousedao/shared/processors";
import { afterEach, describe, expect, it } from "vitest";
import { createTestRelationalDb } from "../../test/helpers/pglite.js";
import { testRuntime } from "../../test/helpers/runtime.js";
import { InvalidRunCursorError } from "./run-cursor.js";
import type {
  RunPage,
  RunsPageArgs,
  WorkflowRuntimeService,
} from "./service.js";
import type { RunRow, WorkflowRuntimeDB } from "./store.js";

const CTX = { headers: {}, db: {}, user: { address: "0xabc" } } as never;

let seq = 0;
let services: WorkflowRuntimeService[] = [];

afterEach(() => {
  for (const service of services) service.shutdown();
  services = [];
});

// Only `readable` workflows pass the host's access check.
async function setup(readable: Set<string>) {
  const service = testRuntime({
    assertCanRead: (documentId: string) =>
      readable.has(documentId)
        ? Promise.resolve(undefined)
        : Promise.reject(new Error("forbidden")),
  } as never);
  services.push(service);
  await service.store();
  const db = await (
    createTestRelationalDb() as IRelationalDb
  ).createNamespace<WorkflowRuntimeDB>("workflow_runtime");
  return { service, db };
}

function row(
  workflowId: string,
  id: string,
  startedAt: string,
  triggerKind = "manual",
): RunRow {
  return {
    id,
    workflow_id: workflowId,
    workflow_name: workflowId,
    workflow_version: 1,
    trigger_kind: triggerKind,
    trigger_payload: null,
    status: "SUCCEEDED",
    error: null,
    error_name: null,
    enqueued_at: startedAt,
    started_at: startedAt,
    ended_at: startedAt,
    rerun_of: null,
    warnings: 0,
    warning_notes: null,
  };
}

const at = (second: number) =>
  new Date(Date.UTC(2026, 0, 1, 0, 0, second)).toISOString();

async function allPages(
  service: WorkflowRuntimeService,
  args: RunsPageArgs,
): Promise<RunPage[]> {
  const pages: RunPage[] = [];
  let cursor: string | null = null;
  do {
    const page = await service.runsPage({ ...args, cursor }, CTX);
    pages.push(page);
    cursor = page.hasNextPage ? page.cursor : null;
  } while (cursor);
  return pages;
}

const ids = (page: RunPage) => page.records.map((record) => record.row.id);

describe("run listing pages", () => {
  it("walks the journal newest first, ties broken by id, with no gaps", async () => {
    seq += 1;
    const wf = `wf-pages-${seq}`;
    const { service, db } = await setup(new Set([wf]));
    // Two runs share a start time: the id orders them.
    await db
      .insertInto("run")
      .values([
        row(wf, `${wf}-a`, at(1)),
        row(wf, `${wf}-b`, at(2)),
        row(wf, `${wf}-c`, at(2)),
        row(wf, `${wf}-d`, at(3)),
        row(wf, `${wf}-e`, at(4)),
      ])
      .execute();

    const pages = await allPages(service, { workflowId: wf, limit: 2 });

    expect(pages.map(ids)).toEqual([
      [`${wf}-e`, `${wf}-d`],
      [`${wf}-c`, `${wf}-b`],
      [`${wf}-a`],
    ]);
    expect(pages.map((page) => page.hasNextPage)).toEqual([true, true, false]);
  });

  it("fills a page past runs the caller may not read", async () => {
    seq += 1;
    const mine = `wf-mine-${seq}`;
    const theirs = `wf-theirs-${seq}`;
    const { service, db } = await setup(new Set([mine]));
    // Theirs are the newest and interleaved: a filter after LIMIT would come
    // back with nothing on the first page.
    const rows: RunRow[] = [];
    for (let i = 0; i < 12; i++) {
      rows.push(row(theirs, `${theirs}-${i}`, at(20 + i * 2 + 1)));
      if (i < 5) rows.push(row(mine, `${mine}-${i}`, at(20 + i * 2)));
    }
    await db.insertInto("run").values(rows).execute();

    const first = await service.runsPage({ limit: 3 }, CTX);
    expect(ids(first)).toEqual([`${mine}-4`, `${mine}-3`, `${mine}-2`]);
    expect(first.hasNextPage).toBe(true);

    const second = await service.runsPage(
      { limit: 3, cursor: first.cursor },
      CTX,
    );
    expect(ids(second)).toEqual([`${mine}-1`, `${mine}-0`]);
    expect(second.hasNextPage).toBe(false);
  });

  it("leaves excluded trigger kinds out without shortening the page", async () => {
    seq += 1;
    const wf = `wf-kinds-${seq}`;
    const { service, db } = await setup(new Set([wf]));
    await db
      .insertInto("run")
      .values([
        row(wf, `${wf}-real-1`, at(1)),
        row(wf, `${wf}-test-1`, at(2), "test"),
        row(wf, `${wf}-real-2`, at(3)),
        row(wf, `${wf}-test-2`, at(4), "test"),
      ])
      .execute();

    const page = await service.runsPage(
      { workflowId: wf, limit: 2, excludeTriggerKinds: ["test"] },
      CTX,
    );
    expect(ids(page)).toEqual([`${wf}-real-2`, `${wf}-real-1`]);
    expect(page.hasNextPage).toBe(false);
    // The plain listing is the first page, with the same semantics.
    expect(
      (
        await service.runs(
          { workflowId: wf, limit: 2, excludeTriggerKinds: ["test"] },
          CTX,
        )
      ).map((record) => record.row.id),
    ).toEqual(ids(page));
  });

  it("returns short at the scan budget with a cursor that moves past it", async () => {
    seq += 1;
    const mine = `wf-budget-mine-${seq}`;
    const theirs = `wf-budget-theirs-${seq}`;
    const { service, db } = await setup(new Set([mine]));
    const hidden = Array.from({ length: 1100 }, (_, i) =>
      row(theirs, `${theirs}-${String(i).padStart(4, "0")}`, at(100)),
    );
    await db.insertInto("run").values(hidden).execute();
    await db
      .insertInto("run")
      .values(row(mine, `${mine}-old`, at(50)))
      .execute();

    const first = await service.runsPage({ limit: 5 }, CTX);
    expect(ids(first)).toEqual([]);
    expect(first.hasNextPage).toBe(true);
    const second = await service.runsPage(
      { limit: 5, cursor: first.cursor },
      CTX,
    );
    expect(ids(second)).toEqual([`${mine}-old`]);
    expect(second.hasNextPage).toBe(false);
  });

  it("keeps a run in place when it starts between two page fetches", async () => {
    seq += 1;
    const wf = `wf-starting-${seq}`;
    const { service, db } = await setup(new Set([wf]));
    await db
      .insertInto("run")
      .values([
        { ...row(wf, `${wf}-a`, at(1)), status: "PENDING", ended_at: null },
        row(wf, `${wf}-b`, at(2)),
        row(wf, `${wf}-c`, at(3)),
        row(wf, `${wf}-d`, at(4)),
      ])
      .execute();

    const first = await service.runsPage({ workflowId: wf, limit: 2 }, CTX);
    await (await service.store())!.beginRun(`${wf}-a`, {
      workflowName: wf,
      workflowVersion: 1,
    });
    const second = await service.runsPage(
      { workflowId: wf, limit: 2, cursor: first.cursor },
      CTX,
    );

    expect(ids(first)).toEqual([`${wf}-d`, `${wf}-c`]);
    expect(ids(second)).toEqual([`${wf}-b`, `${wf}-a`]);
    expect(second.records[1].row.status).toBe("RUNNING");
    expect(second.hasNextPage).toBe(false);
  });

  it("rejects a cursor it did not issue", async () => {
    const { service } = await setup(new Set());
    await expect(
      service.runsPage({ cursor: "not-a-cursor" }, CTX),
    ).rejects.toThrow(InvalidRunCursorError);
  });
});
