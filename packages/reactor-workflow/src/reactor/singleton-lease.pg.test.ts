// The lease against a real Postgres, from two connection pools as two hosts
// would hold them.
import {
  createRelationalDb,
  type IRelationalDb,
} from "@powerhousedao/shared/processors";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  acquireWorkflowSingletonLease,
  SINGLETON_HEARTBEAT_MS,
  SINGLETON_STALE_HEARTBEATS,
  WorkflowSingletonConflictError,
  type WorkflowSingletonLease,
} from "./singleton-lease.js";

const PG_URL = process.env.REACTOR_TEST_PG_URL;
const DATABASE = "reactor_workflow_singleton";

const silent = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
  verbose: () => undefined,
  child: () => silent,
} as never;

describe.skipIf(!PG_URL)("the workflow singleton lease [Postgres]", () => {
  let hosts: { db: Kysely<unknown>; relationalDb: IRelationalDb }[];
  let held: WorkflowSingletonLease[];

  beforeEach(async () => {
    const admin = new Pool({ connectionString: PG_URL });
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${DATABASE}" WITH (FORCE)`);
      await admin.query(`CREATE DATABASE "${DATABASE}"`);
    } finally {
      await admin.end();
    }
    const url = new URL(PG_URL!);
    url.pathname = `/${DATABASE}`;
    hosts = [0, 1].map(() => {
      const db = new Kysely<unknown>({
        dialect: new PostgresDialect({
          pool: new Pool({ connectionString: url.toString(), max: 4 }),
        }),
      });
      return { db, relationalDb: createRelationalDb(db) };
    });
    held = [];
  });

  afterEach(async () => {
    for (const lease of held) await lease.release();
    for (const { db } of hosts) await db.destroy();
    const admin = new Pool({ connectionString: PG_URL });
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${DATABASE}" WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  });

  function acquire(host: number, owner: string) {
    return acquireWorkflowSingletonLease({
      relationalDb: hosts[host]!.relationalDb,
      logger: silent,
      owner,
    }).then((lease) => {
      held.push(lease);
      return lease;
    });
  }

  async function ageHeartbeat(ms: number) {
    const db = await hosts[0]!.relationalDb.createNamespace<{
      workflow_singleton: { heartbeat_at: Date };
    }>("workflow_runtime");
    await db
      .updateTable("workflow_singleton")
      .set({
        heartbeat_at: sql<Date>`heartbeat_at - ${ms} * interval '1 millisecond'`,
      })
      .execute();
  }

  it("grants exactly one of many concurrent first claims", async () => {
    const claims = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) => acquire(i % 2, `host-${i}`)),
    );

    const granted = claims.filter((claim) => claim.status === "fulfilled");
    const refused = claims.filter((claim) => claim.status === "rejected");
    expect(granted).toHaveLength(1);
    for (const claim of refused) {
      expect(claim.reason).toBeInstanceOf(WorkflowSingletonConflictError);
    }
  });

  it("refuses a live holder's own owner name from another pool", async () => {
    await acquire(0, "switchboard-0");

    await expect(acquire(1, "switchboard-0")).rejects.toBeInstanceOf(
      WorkflowSingletonConflictError,
    );
  });

  it("hands a stale holder's lease to its own slot, and keeps it there", async () => {
    const oldPod = await acquire(0, "switchboard-0");
    await ageHeartbeat(SINGLETON_HEARTBEAT_MS * SINGLETON_STALE_HEARTBEATS + 1);

    const newPod = await acquire(1, "switchboard-0");
    expect(await oldPod.heartbeat()).toBe(false);
    await oldPod.release();

    expect(await newPod.heartbeat()).toBe(true);
    await expect(acquire(0, "someone-else")).rejects.toBeInstanceOf(
      WorkflowSingletonConflictError,
    );
  });
});
