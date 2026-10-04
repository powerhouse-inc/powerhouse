// Workflow execution is a singleton (multi-reactor plan, agreed decision 3).
// The claim is what enforces it: a second live process over one run journal is
// refused by name rather than left to fail the first one's runs.
import { describe, expect, it } from "vitest";
import { createFreshRelationalDb } from "../../test/helpers/pglite.js";
import {
  acquireWorkflowSingletonLease,
  singletonOwnerName,
  WORKFLOW_SINGLETON_OWNER_ENV,
  WorkflowSingletonConflictError,
} from "./singleton-lease.js";

const silent = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
  verbose: () => undefined,
  child: () => silent,
} as never;

function fixture() {
  const relationalDb = createFreshRelationalDb();
  let clock = Date.parse("2026-10-04T00:00:00.000Z");
  return {
    relationalDb,
    advance: (ms: number) => (clock += ms),
    acquire: (owner: string, ttlMs = 60_000) =>
      acquireWorkflowSingletonLease({
        relationalDb,
        logger: silent,
        owner,
        ttlMs,
        now: () => new Date(clock),
      }),
  };
}

describe("the workflow singleton lease", () => {
  it("lets the first process claim it", async () => {
    const { acquire } = fixture();
    const lease = await acquire("alpha");
    expect(lease.owner).toBe("alpha");
    await lease.release();
  });

  it("refuses a second live process, naming the holder", async () => {
    const { acquire } = fixture();
    await acquire("alpha");

    const refused = await acquire("beta").catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(WorkflowSingletonConflictError);
    const conflict = refused as WorkflowSingletonConflictError;
    expect(conflict.owner).toBe("alpha");
    expect(conflict.wouldBe).toBe("beta");
    expect(conflict.message).toContain(WORKFLOW_SINGLETON_OWNER_ENV);
  });

  it("gives the same owner its own lease back, so a restart does not wait", async () => {
    const { acquire } = fixture();
    await acquire("switchboard-0");

    const again = await acquire("switchboard-0");

    expect(again.owner).toBe("switchboard-0");
  });

  it("lets another process take over once the lease has expired", async () => {
    const { acquire, advance } = fixture();
    await acquire("alpha", 1_000);
    advance(1_001);

    const taken = await acquire("beta", 1_000);

    expect(taken.owner).toBe("beta");
  });

  it("frees the claim on release", async () => {
    const { acquire } = fixture();
    const lease = await acquire("alpha");
    await lease.release();

    const next = await acquire("beta");

    expect(next.owner).toBe("beta");
  });

  it("reports a heartbeat that finds the lease taken", async () => {
    const { acquire, advance } = fixture();
    const first = await acquire("alpha", 1_000);
    expect(await first.heartbeat()).toBe(true);

    advance(1_001);
    await acquire("beta", 1_000);

    // The takeover is what a second writer has to learn from; the heartbeat is
    // the only place it can.
    expect(await first.heartbeat()).toBe(false);
  });

  it("names the process when no owner is configured, and the env when one is", () => {
    expect(singletonOwnerName({})).toMatch(/\/\d+\//);
    expect(
      singletonOwnerName({ [WORKFLOW_SINGLETON_OWNER_ENV]: " slot-a " }),
    ).toBe("slot-a");
  });
});
