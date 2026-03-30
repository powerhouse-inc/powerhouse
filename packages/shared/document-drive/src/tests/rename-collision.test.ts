import { describe, expect, it } from "vitest";
import { handleTargetNameCollisions } from "../utils.js";

describe("handleTargetNameCollisions", () => {
  it("should not detect collision with the node itself when excluded from list", () => {
    const nodes = [
      { id: "1", name: "budget", parentFolder: null, kind: "file" as const },
      {
        id: "2",
        name: "budget (copy) 1",
        parentFolder: null,
        kind: "file" as const,
      },
    ];

    // Simulating rename of node "2" to "my-budget"
    // Exclude node "2" from collision check (the fix)
    const result = handleTargetNameCollisions({
      nodes: nodes.filter((n) => n.id !== "2"),
      srcName: "my-budget",
      targetParentFolder: null,
    });

    expect(result).toBe("my-budget");
  });

  it("should detect collision when renaming to same name as another node", () => {
    const nodes = [
      { id: "1", name: "budget", parentFolder: null, kind: "file" as const },
      {
        id: "2",
        name: "budget (copy) 1",
        parentFolder: null,
        kind: "file" as const,
      },
    ];

    // Renaming node "2" to "budget" should collide with node "1"
    const result = handleTargetNameCollisions({
      nodes: nodes.filter((n) => n.id !== "2"),
      srcName: "budget",
      targetParentFolder: null,
    });

    expect(result).toBe("budget (copy) 1");
  });

  it("should not detect self-collision when renaming to same name (no-op rename)", () => {
    const nodes = [
      { id: "1", name: "budget", parentFolder: null, kind: "file" as const },
    ];

    // Renaming node "1" to "budget" (same name) — excluding self
    const result = handleTargetNameCollisions({
      nodes: nodes.filter((n) => n.id !== "1"),
      srcName: "budget",
      targetParentFolder: null,
    });

    expect(result).toBe("budget");
  });

  it("should not detect collision across different folders", () => {
    const nodes = [
      {
        id: "1",
        name: "my-doc",
        parentFolder: null,
        kind: "file" as const,
      },
      {
        id: "2",
        name: "budget",
        parentFolder: "folder-1",
        kind: "file" as const,
      },
    ];

    // Renaming node "2" in folder-1 to "my-doc" should NOT collide
    // with root-level "my-doc" because different folder
    const result = handleTargetNameCollisions({
      nodes: nodes.filter((n) => n.id !== "2"),
      srcName: "my-doc",
      targetParentFolder: "folder-1",
    });

    expect(result).toBe("my-doc");
  });

  it("should handle double rename (simulating UI double dispatch)", () => {
    // Initial state: original + copy
    const nodes = [
      { id: "1", name: "budget", parentFolder: null, kind: "file" as const },
      {
        id: "2",
        name: "budget (copy) 1",
        parentFolder: null,
        kind: "file" as const,
      },
    ];

    // First rename: "budget (copy) 1" -> "my-budget"
    const firstResult = handleTargetNameCollisions({
      nodes: nodes.filter((n) => n.id !== "2"),
      srcName: "my-budget",
      targetParentFolder: null,
    });
    expect(firstResult).toBe("my-budget");

    // Update state after first rename
    const updatedNodes = nodes.map((n) =>
      n.id === "2" ? { ...n, name: firstResult } : n,
    );

    // Second rename (same action dispatched again)
    const secondResult = handleTargetNameCollisions({
      nodes: updatedNodes.filter((n) => n.id !== "2"),
      srcName: "my-budget",
      targetParentFolder: null,
    });

    // Should STILL be "my-budget", not "my-budget (copy) 1"
    expect(secondResult).toBe("my-budget");
  });
});
