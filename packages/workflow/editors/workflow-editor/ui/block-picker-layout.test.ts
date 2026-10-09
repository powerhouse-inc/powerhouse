import { afterEach, describe, expect, it, vi } from "vitest";
import { pickerPlacement } from "./picker-placement.js";
import { recentPicks, rememberPick } from "./picker-recent.js";
import { rowOffsets, visibleRange } from "./VirtualList.js";

const SIZE = { width: 640, height: 480 };
const SCREEN = { width: 1440, height: 900 };
const button = (x: number, y: number) => ({
  left: x - 10,
  right: x + 10,
  top: y - 10,
  bottom: y + 10,
});

describe("pickerPlacement", () => {
  it("opens below the button when it fits, centred on it", () => {
    expect(pickerPlacement(button(720, 100), SIZE, SCREEN)).toEqual({
      left: 400,
      top: 116,
      width: 640,
      height: 480,
    });
  });

  it("opens above a button near the bottom of the screen", () => {
    const placement = pickerPlacement(button(720, 860), SIZE, SCREEN);
    expect(placement.height).toBe(480);
    expect(placement.top + placement.height).toBe(844);
  });

  it("shrinks to the roomier side when neither fits", () => {
    const placement = pickerPlacement(button(720, 420), SIZE, {
      width: 1440,
      height: 700,
    });
    expect(placement.top).toBeGreaterThanOrEqual(8);
    expect(placement.top + placement.height).toBeLessThanOrEqual(692);
    expect(placement.height).toBeLessThan(480);
  });

  it("stays inside the screen sideways, and narrows on a small one", () => {
    expect(pickerPlacement(button(20, 100), SIZE, SCREEN).left).toBe(8);
    expect(pickerPlacement(button(1430, 100), SIZE, SCREEN).left).toBe(792);
    expect(
      pickerPlacement(button(200, 100), SIZE, { width: 400, height: 900 }),
    ).toMatchObject({ left: 8, width: 384 });
  });
});

describe("visibleRange", () => {
  const offsets = rowOffsets(Array.from({ length: 100 }, () => 44));

  it("covers the window plus the overscan", () => {
    expect(visibleRange(offsets, 0, 440, 0)).toEqual([0, 10]);
    expect(visibleRange(offsets, 440, 440, 2)).toEqual([8, 22]);
  });

  it("stops at the ends of the list", () => {
    expect(visibleRange(offsets, 4300, 440, 6)).toEqual([91, 100]);
    expect(visibleRange(rowOffsets([]), 0, 440)).toEqual([0, 0]);
  });
});

describe("recent picks", () => {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    },
  });
  afterEach(() => store.clear());

  const preset = (name: string, kind: "action" | "trigger" = "action") => ({
    label: name,
    description: "",
    block: { pieceName: "@acme/piece-x", pieceVersion: "1.0.0", kind, name },
    defaultConfig: {},
  });

  it("lists the latest first, once each, per kind, without a version", () => {
    rememberPick(preset("a"));
    rememberPick(preset("b"));
    rememberPick(preset("a"));
    rememberPick(preset("t", "trigger"));
    expect(recentPicks("action").map((pick) => pick.label)).toEqual(["a", "b"]);
    expect(recentPicks("trigger").map((pick) => pick.label)).toEqual(["t"]);
    expect(recentPicks("action")[0].block).not.toHaveProperty("pieceVersion");
  });

  it("keeps the last six", () => {
    for (const name of ["1", "2", "3", "4", "5", "6", "7"]) {
      rememberPick(preset(name));
    }
    expect(recentPicks("action").map((pick) => pick.label)).toEqual([
      "7",
      "6",
      "5",
      "4",
      "3",
      "2",
    ]);
  });

  it("reads a corrupt store as empty", () => {
    store.set("ph-workflow-picker-recent:v1", "{not json");
    expect(recentPicks("action")).toEqual([]);
  });
});
