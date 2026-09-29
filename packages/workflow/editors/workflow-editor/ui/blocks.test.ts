import { describe, expect, it } from "vitest";
import {
  BRANCH_BLOCK,
  CORE_PIECE,
  isCoreBlock,
  isReactorPieceBlock,
  MANUAL_TRIGGER,
  pinBlock,
  REACTOR_PIECE,
  sameBlock,
  STEP_PRESETS,
  stepBlock,
  stepFields,
  TRIGGER_PRESETS,
  triggerBlock,
  triggerFields,
} from "./blocks.js";

const installed = (piece: string) =>
  piece === REACTOR_PIECE
    ? "6.2.3-dev.27"
    : piece === CORE_PIECE
      ? "6.2.3-dev.28"
      : undefined;

describe("pinBlock", () => {
  it("pins an unpinned pick to the installed version", () => {
    expect(
      pinBlock(
        { pieceName: REACTOR_PIECE, kind: "action", name: "document-get" },
        installed,
      ),
    ).toEqual({
      pieceName: REACTOR_PIECE,
      pieceVersion: "6.2.3-dev.27",
      kind: "action",
      name: "document-get",
    });
    expect(pinBlock(MANUAL_TRIGGER, installed)?.pieceVersion).toBe(
      "6.2.3-dev.28",
    );
  });

  it("keeps a pinned pick as it is", () => {
    const pinned = {
      pieceName: "@acme/http",
      pieceVersion: "1.0.0",
      kind: "action" as const,
      name: "send",
    };
    expect(pinBlock(pinned, installed)).toEqual(pinned);
  });

  it("gives nothing for a piece that isn't installed", () => {
    expect(
      pinBlock(
        { pieceName: "@acme/http", kind: "action", name: "send" },
        installed,
      ),
    ).toBeUndefined();
  });

  it("pins every preset", () => {
    for (const preset of [...TRIGGER_PRESETS, ...STEP_PRESETS]) {
      expect(pinBlock(preset.block, installed), preset.label).toBeDefined();
    }
  });
});

describe("block helpers", () => {
  it("names the core piece and the reactor piece", () => {
    expect(isCoreBlock(BRANCH_BLOCK)).toBe(true);
    expect(isCoreBlock({ pieceName: REACTOR_PIECE })).toBe(false);
    expect(isReactorPieceBlock({ pieceName: REACTOR_PIECE })).toBe(true);
    expect(isReactorPieceBlock({ pieceName: `${REACTOR_PIECE}-extra` })).toBe(
      false,
    );
  });

  it("compares blocks by piece, kind and name, not version", () => {
    const step = stepBlock({
      pieceName: CORE_PIECE,
      pieceVersion: "1.0.0",
      actionName: "branch",
    });
    expect(sameBlock(step, BRANCH_BLOCK)).toBe(true);
    expect(sameBlock(step, MANUAL_TRIGGER)).toBe(false);
    expect(sameBlock({ ...BRANCH_BLOCK, kind: "trigger" }, BRANCH_BLOCK)).toBe(
      false,
    );
  });

  it("round-trips the fields a step and a trigger store", () => {
    const fields = {
      pieceName: "@acme/imap",
      pieceVersion: "1.2.0",
      triggerName: "new_mail",
    };
    expect(triggerFields(triggerBlock(fields))).toEqual(fields);
    const action = {
      pieceName: "@acme/http",
      pieceVersion: "1.2.0",
      actionName: "send",
    };
    expect(stepFields(stepBlock(action))).toEqual(action);
  });
});
