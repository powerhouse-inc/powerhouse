import { describe, expect, it } from "vitest";
import {
  anchorLeftPosition,
  contextMenuItems,
  menuHeight,
  menuPosition,
  MENU_WIDTH,
} from "./canvas-menu.js";
import type { StepModel, WorkflowModel } from "./model.js";

function step(
  id: string,
  blockType = "@powerhousedao/piece-reactor#document-dispatch",
): StepModel {
  return {
    id,
    key: id,
    name: id,
    blockType,
    connectionId: null,
    config: {},
    retry: null,
    timeoutSeconds: null,
    idempotencyKeyExpression: null,
    position: null,
  };
}

function model(
  steps: StepModel[],
  edges: [string, string, string][] = [],
): WorkflowModel {
  return {
    name: "wf",
    status: "DRAFT",
    version: 1,
    trigger: {
      id: "t",
      blockType: "core#manual",
      config: {},
      connectionId: null,
    },
    steps,
    edges: edges.map(([from, to, port], index) => ({
      id: `e${index}`,
      from,
      to,
      port,
      condition: null,
    })),
    variables: [],
  };
}

describe("contextMenuItems", () => {
  it("offers the step actions, with add-below free on a leaf", () => {
    const items = contextMenuItems(
      { kind: "step", id: "a" },
      model([step("a")], [["t", "a", "next"]]),
    );
    expect(items).toEqual([
      { id: "open", label: "Open settings" },
      { id: "addBelow", label: "Add step below", disabled: false },
      { id: "duplicate", label: "Duplicate step" },
      { id: "removeStep", label: "Remove step" },
    ]);
  });

  it("keeps add-below on a wired next port, since ports fan out", () => {
    const taken = model(
      [step("a"), step("b")],
      [
        ["t", "a", "next"],
        ["a", "b", "next"],
      ],
    );
    expect(contextMenuItems({ kind: "step", id: "a" }, taken)[1]).toMatchObject(
      { id: "addBelow", disabled: false },
    );
  });

  it("disables add-below on a branch, which has no next port", () => {
    const branch = model([step("a", "core#branch")], [["t", "a", "next"]]);
    expect(
      contextMenuItems({ kind: "step", id: "a" }, branch)[1],
    ).toMatchObject({ id: "addBelow", disabled: true });
  });

  it("offers trigger actions whether or not it is already wired", () => {
    const empty = model([]);
    expect(contextMenuItems({ kind: "trigger" }, empty)).toEqual([
      { id: "open", label: "Open settings" },
      { id: "addBelow", label: "Add step below", disabled: false },
      { id: "changeTrigger", label: "Change trigger" },
      { id: "removeTrigger", label: "Remove trigger" },
    ]);
    const wired = model([step("a")], [["t", "a", "next"]]);
    expect(contextMenuItems({ kind: "trigger" }, wired)[1]).toMatchObject({
      id: "addBelow",
      disabled: false,
    });
  });

  it("offers insert and remove on an edge", () => {
    const items = contextMenuItems(
      { kind: "edge", id: "e0" },
      model([step("a")], [["t", "a", "next"]]),
    );
    expect(items.map((item) => item.id)).toEqual(["insertStep", "removeEdge"]);
  });

  it("offers pane actions, with select-all disabled on an empty graph", () => {
    expect(contextMenuItems({ kind: "pane" }, model([]))).toEqual([
      { id: "addStep", label: "Add step here" },
      { id: "selectAll", label: "Select all steps", disabled: true },
      { id: "fitView", label: "Fit view" },
    ]);
    expect(
      contextMenuItems({ kind: "pane" }, model([step("a")]))[1],
    ).toMatchObject({ id: "selectAll", disabled: false });
  });
});

describe("menuPosition", () => {
  const size = { width: MENU_WIDTH, height: menuHeight(4) };
  const viewport = { width: 1000, height: 800 };

  it("anchors at the pointer when the menu fits", () => {
    expect(menuPosition({ x: 100, y: 200 }, size, viewport)).toEqual({
      x: 100,
      y: 200,
    });
  });

  it("flips back over the pointer near the right and bottom edges", () => {
    expect(menuPosition({ x: 960, y: 780 }, size, viewport)).toEqual({
      x: 960 - size.width,
      y: 780 - size.height,
    });
  });

  it("keeps the menu inside the viewport when the flip overshoots", () => {
    expect(
      menuPosition(
        { x: 10, y: 8 },
        { ...size, width: 60 },
        {
          width: 60,
          height: 40,
        },
      ),
    ).toEqual({ x: 8, y: 8 });
  });
});

describe("anchorLeftPosition", () => {
  const size = { width: 320, height: 360 };
  const viewport = { width: 1200, height: 800 };
  // A field row in the 384px side panel, level with the middle of the screen.
  const field = { left: 828, right: 1188, top: 300 };

  it("puts the popup's right edge beside the field's left edge", () => {
    expect(anchorLeftPosition(field, size, viewport)).toEqual({
      x: 828 - 8 - 320,
      y: 300,
    });
  });

  it("flips to the field's right side when the left has no room", () => {
    // Panel docked left: nothing fits to the left of the field.
    expect(
      anchorLeftPosition({ left: 24, right: 384, top: 100 }, size, {
        width: 900,
        height: 800,
      }),
    ).toEqual({ x: 384 + 8, y: 100 });
  });

  it("clamps a flip that overshoots back inside the viewport", () => {
    expect(
      anchorLeftPosition({ left: 20, right: 380, top: 100 }, size, {
        width: 400,
        height: 800,
      }),
    ).toEqual({ x: 400 - 320 - 8, y: 100 });
  });

  it("clamps vertically so a tall popup stays on screen", () => {
    expect(anchorLeftPosition({ ...field, top: 700 }, size, viewport).y).toBe(
      800 - 360 - 8,
    );
    expect(anchorLeftPosition({ ...field, top: 2 }, size, viewport).y).toBe(8);
  });
});
