import { describe, expect, it } from "vitest";
import {
  connectionUsage,
  enabledDependents,
  type UsageWorkflow,
} from "./connection-usage.js";

function workflow(
  id: string,
  overrides: Partial<UsageWorkflow> = {},
): UsageWorkflow {
  return {
    id,
    name: id,
    status: "DRAFT",
    trigger: null,
    steps: [],
    ...overrides,
  };
}

function step(key: string, connectionId?: string | null) {
  return {
    id: `${key}-id`,
    key,
    name: key,
    blockType: "piece#action",
    connectionId,
  };
}

describe("connectionUsage", () => {
  it("finds steps bound to the connection", () => {
    const usage = connectionUsage("conn-1", [
      workflow("a", { steps: [step("post", "conn-1"), step("other", "x")] }),
      workflow("b", { steps: [step("nope", "x")] }),
    ]);
    expect(usage).toHaveLength(1);
    expect(usage[0].workflow.id).toBe("a");
    expect(usage[0].steps.map((s) => s.key)).toEqual(["post"]);
    expect(usage[0].trigger).toBe(false);
  });

  it("finds a trigger bound to the connection", () => {
    const usage = connectionUsage("conn-1", [
      workflow("a", {
        trigger: { blockType: "piece#trigger", connectionId: "conn-1" },
      }),
    ]);
    expect(usage[0].trigger).toBe(true);
    expect(usage[0].steps).toEqual([]);
  });

  it("reports a workflow that uses it in both places once", () => {
    const usage = connectionUsage("conn-1", [
      workflow("a", {
        trigger: { blockType: "piece#trigger", connectionId: "conn-1" },
        steps: [step("post", "conn-1")],
      }),
    ]);
    expect(usage).toHaveLength(1);
    expect(usage[0].trigger).toBe(true);
    expect(usage[0].steps.map((s) => s.key)).toEqual(["post"]);
  });

  it("ignores steps with no connection and sorts by name", () => {
    const usage = connectionUsage("conn-1", [
      workflow("z", { name: "Zeta", steps: [step("s", "conn-1")] }),
      workflow("a", { name: "Alpha", steps: [step("s", "conn-1")] }),
      workflow("n", { name: "None", steps: [step("s", null), step("t")] }),
    ]);
    expect(usage.map((entry) => entry.workflow.name)).toEqual([
      "Alpha",
      "Zeta",
    ]);
  });

  it("counts only enabled dependents", () => {
    const usage = connectionUsage("conn-1", [
      workflow("a", { status: "ENABLED", steps: [step("s", "conn-1")] }),
      workflow("b", { status: "DRAFT", steps: [step("s", "conn-1")] }),
    ]);
    expect(enabledDependents(usage)).toBe(1);
  });
});
