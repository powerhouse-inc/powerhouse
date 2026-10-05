import { describe, expect, it } from "vitest";
import {
  anchorLeftPosition,
  contextMenuItems,
  menuHeight,
  menuPosition,
  MENU_WIDTH,
} from "./canvas-menu.js";
import { BRANCH_BLOCK, sameBlock, type BlockRef } from "./blocks.js";
import type { StepModel, WorkflowModel } from "./model.js";
import type { ContextMenuTarget } from "./canvas-menu.js";

// The ports the core piece serves for branch, and every piece action's.
const portsOf = (block: BlockRef) =>
  sameBlock(block, BRANCH_BLOCK)
    ? ["true", "false", "error"]
    : ["next", "error"];

const menu = (target: ContextMenuTarget, workflow: WorkflowModel) =>
  contextMenuItems(target, workflow, portsOf);

function step(
  id: string,
  block = {
    pieceName: "@powerhousedao/piece-reactor",
    pieceVersion: "1.0.0",
    actionName: "document-dispatch",
  },
): StepModel {
  return {
    id,
    key: id,
    name: id,
    ...block,
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
      pieceName: "@powerhousedao/piece-core",
      pieceVersion: "1.0.0",
      triggerName: "manual",
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
    const items = menu(
      { kind: "step", id: "a" },
      model([step("a")], [["t", "a", "next"]]),
    );
    expect(items).toEqual([
      { id: "open", label: "Open settings" },
      { id: "addBelow", label: "Add step below", disabled: false },
      { id: "duplicate", label: "Duplicate step" },
      { id: "toggleSkip", label: "Skip this step" },
      { id: "removeStep", label: "Remove step" },
    ]);
  });

  it("offers to stop skipping a skipped step", () => {
    const skipped = { ...step("a"), skip: true };
    const items = menu(
      { kind: "step", id: "a" },
      model([skipped], [["t", "a", "next"]]),
    );
    expect(items.find((item) => item.id === "toggleSkip")?.label).toBe(
      "Stop skipping this step",
    );
  });

  it("keeps add-below on a wired next port, since ports fan out", () => {
    const taken = model(
      [step("a"), step("b")],
      [
        ["t", "a", "next"],
        ["a", "b", "next"],
      ],
    );
    expect(menu({ kind: "step", id: "a" }, taken)[1]).toMatchObject({
      id: "addBelow",
      disabled: false,
    });
  });

  it("disables add-below on a branch, which has no next port", () => {
    const branch = model(
      [
        step("a", {
          pieceName: "@powerhousedao/piece-core",
          pieceVersion: "1.0.0",
          actionName: "branch",
        }),
      ],
      [["t", "a", "next"]],
    );
    expect(menu({ kind: "step", id: "a" }, branch)[1]).toMatchObject({
      id: "addBelow",
      disabled: true,
    });
  });

  it("offers trigger actions whether or not it is already wired", () => {
    const empty = model([]);
    expect(menu({ kind: "trigger" }, empty)).toEqual([
      { id: "open", label: "Open settings" },
      { id: "addBelow", label: "Add step below", disabled: false },
      { id: "changeTrigger", label: "Change trigger" },
      { id: "removeTrigger", label: "Remove trigger" },
    ]);
    const wired = model([step("a")], [["t", "a", "next"]]);
    expect(menu({ kind: "trigger" }, wired)[1]).toMatchObject({
      id: "addBelow",
      disabled: false,
    });
  });

  it("offers insert and remove on an edge", () => {
    const items = menu(
      { kind: "edge", id: "e0" },
      model([step("a")], [["t", "a", "next"]]),
    );
    expect(items.map((item) => item.id)).toEqual(["insertStep", "removeEdge"]);
  });

  it("offers pane actions, with select-all disabled on an empty graph", () => {
    expect(menu({ kind: "pane" }, model([]))).toEqual([
      { id: "addStep", label: "Add step here" },
      { id: "selectAll", label: "Select all steps", disabled: true },
      { id: "fitView", label: "Fit view" },
    ]);
    expect(menu({ kind: "pane" }, model([step("a")]))[1]).toMatchObject({
      id: "selectAll",
      disabled: false,
    });
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
