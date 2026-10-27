import { describe, expect, it } from "vitest";
import { errorCodeSchema, instanceSchema } from "./api.js";

const INSTANCE = {
  id: "i1",
  project: "/project",
  host: "switchboard",
  status: "running",
  startedAt: "2026-10-27T00:00:00.000Z",
};

describe("controller wire", () => {
  it("keeps an instance without an owner", () => {
    expect(instanceSchema.parse(INSTANCE)).toEqual(INSTANCE);
  });

  it("carries a matrix owner", () => {
    const owner = {
      kind: "matrix",
      runId: "r1",
      cellId: "auth=l2,workers=w0",
      rep: 2,
    };
    expect(instanceSchema.parse({ ...INSTANCE, owner }).owner).toEqual(owner);
  });

  it.each([
    { kind: "manual", runId: "r1", cellId: "c", rep: 1 },
    { kind: "matrix", runId: "r1", cellId: "c", rep: 0 },
    { kind: "matrix", runId: "r1", cellId: "c" },
    { kind: "matrix", runId: "r1", cellId: "c", rep: 1, extra: true },
  ])("refuses the owner %j", (owner) => {
    expect(instanceSchema.safeParse({ ...INSTANCE, owner }).success).toBe(
      false,
    );
  });

  it("knows the matrix error codes", () => {
    for (const code of ["matrix_invalid", "matrix_limit", "run_not_found"]) {
      expect(errorCodeSchema.safeParse(code).success).toBe(true);
    }
  });
});
