import { describe, expect, it, vi } from "vitest";
import {
  dispatchTableOp,
  INSPECTOR_OPS,
  InspectorOpRefusedError,
  InspectorOpUnavailableError,
  methodOf,
  opKeyOf,
  READ_ONLY_ACCESS,
  SYNC_INSPECTION_OPS,
  UnknownInspectorOpError,
} from "../../src/inspector/ops.js";
import {
  INSPECTION_ROOT_FIELDS,
  INSPECTION_WIRE_FIELDS,
} from "../../src/inspector/wire.js";

const tables = { INSPECTOR_OPS, SYNC_INSPECTION_OPS };

describe("inspection op tables", () => {
  it.each(Object.entries(tables))("%s names each rpc method once", (_, t) => {
    const rpcs = Object.values(t).map((spec) => spec.rpc);
    expect(new Set(rpcs).size).toBe(rpcs.length);
  });

  it("gives a GraphQL field to read rows and to nothing else", () => {
    for (const table of Object.values(tables)) {
      for (const spec of Object.values(table)) {
        expect("gql" in spec).toBe(spec.tier === "read");
      }
    }
  });

  it("derives the subgraph's root fields from the read rows", () => {
    expect([...INSPECTION_ROOT_FIELDS.ReactorInspection].sort()).toEqual(
      [
        "info",
        "documentModels",
        "drives",
        "driveIntegrity",
        "attachmentInfo",
        "queueState",
        "processors",
        "catchUpStatus",
        "storageHealth",
        "validateDocument",
        "remote",
        "remotes",
        "deadLetters",
      ].sort(),
    );
  });

  it("keeps the tiers of every lever", () => {
    expect(INSPECTOR_OPS.queryDb.tier).toBe("sql");
    for (const key of [
      "pauseQueue",
      "resumeQueue",
      "retryProcessor",
      "sweepCatchUp",
      "rebuildKeyframes",
      "rebuildSnapshots",
    ] as const) {
      expect(INSPECTOR_OPS[key].tier).toBe("admin");
    }
    for (const key of [
      "resetChannel",
      "requeueDeadLetter",
      "clearDeadLetter",
    ] as const) {
      expect(SYNC_INSPECTION_OPS[key].tier).toBe("admin");
    }
    expect(INSPECTOR_OPS.validateDocument.tier).toBe("read");
  });

  it("pins the reactor info record", () => {
    expect(INSPECTION_WIRE_FIELDS.ReactorInfo).toEqual([
      "storage",
      "workflows",
      "syncChannels",
      "access",
    ]);
    expect(INSPECTION_WIRE_FIELDS.InspectionStorageHealth).toContain("tracked");
  });
});

describe("dispatchTableOp", () => {
  const target = {
    getQueueState: vi.fn(() => Promise.resolve("state")),
    pauseQueue: vi.fn(() => Promise.resolve()),
    queryDb: vi.fn(() => Promise.resolve([])),
  };
  const resolve = (key: string) => methodOf(target, key);

  it("runs a read row with its arguments", async () => {
    await expect(
      dispatchTableOp(
        INSPECTOR_OPS,
        resolve,
        READ_ONLY_ACCESS,
        "queue.getState",
        [],
      ),
    ).resolves.toBe("state");
  });

  it("refuses an admin row without admin access, before running it", async () => {
    await expect(
      dispatchTableOp(
        INSPECTOR_OPS,
        resolve,
        READ_ONLY_ACCESS,
        "queue.pause",
        [],
      ),
    ).rejects.toBeInstanceOf(InspectorOpRefusedError);
    expect(target.pauseQueue).not.toHaveBeenCalled();
  });

  it("refuses sql with admin access alone", async () => {
    await expect(
      dispatchTableOp(
        INSPECTOR_OPS,
        resolve,
        { admin: true, sql: false },
        "db.query",
        ["select 1"],
      ),
    ).rejects.toBeInstanceOf(InspectorOpRefusedError);
    expect(target.queryDb).not.toHaveBeenCalled();
  });

  it("runs a granted lever", async () => {
    await dispatchTableOp(
      INSPECTOR_OPS,
      resolve,
      { admin: true, sql: false },
      "queue.pause",
      [],
    );
    expect(target.pauseQueue).toHaveBeenCalledOnce();
  });

  it("refuses a method no row names", async () => {
    await expect(
      dispatchTableOp(INSPECTOR_OPS, resolve, READ_ONLY_ACCESS, "nope", []),
    ).rejects.toBeInstanceOf(UnknownInspectorOpError);
  });

  it("refuses a row the host has nothing to serve", async () => {
    await expect(
      dispatchTableOp(
        INSPECTOR_OPS,
        resolve,
        READ_ONLY_ACCESS,
        "storage.health",
        [],
      ),
    ).rejects.toBeInstanceOf(InspectorOpUnavailableError);
  });

  it("finds rows by rpc name", () => {
    expect(opKeyOf(SYNC_INSPECTION_OPS, "inspect.remotes")).toBe(
      "inspectRemotes",
    );
    expect(opKeyOf(SYNC_INSPECTION_OPS, "list")).toBeUndefined();
  });
});
