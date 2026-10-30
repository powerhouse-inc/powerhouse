import { describe, expect, it } from "vitest";
import {
  judgeLayer,
  loadPlacements,
  PLACEMENTS_STORAGE_KEY,
  savePlacements,
} from "./placements.js";

const throwing = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("placements", () => {
  it("survives storage that throws or holds garbage", () => {
    expect(loadPlacements(throwing, "lab")).toEqual({});
    expect(savePlacements(throwing, "lab", { a: { backend: "x" } })).toBe(
      false,
    );
    expect(savePlacements(undefined, "lab", {})).toBe(false);
    const garbage = {
      getItem: () => "{not json",
      setItem: () => undefined,
    };
    expect(loadPlacements(garbage, "lab")).toEqual({});
    const wrong = {
      getItem: () =>
        JSON.stringify({ lab: { a: { backend: 1 }, b: { backend: "x" } } }),
      setItem: () => undefined,
    };
    expect(loadPlacements(wrong, "lab")).toEqual({ b: { backend: "x" } });
  });

  it("keeps each set apart", () => {
    const items = new Map<string, string>();
    const storage = {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
    };
    savePlacements(storage, "a", { d: { backend: "x", configWas: "y" } });
    savePlacements(storage, "b", { d: { backend: "z" } });
    expect(loadPlacements(storage, "a")).toEqual({
      d: { backend: "x", configWas: "y" },
    });
    savePlacements(storage, "b", {});
    expect(JSON.parse(items.get(PLACEMENTS_STORAGE_KEY) ?? "")).toEqual({
      a: { d: { backend: "x", configWas: "y" } },
    });
  });

  it("judges only the router's own moves, dropping those whose config changed", () => {
    expect(
      judgeLayer(
        {
          same: { backend: "x", configWas: "y" },
          changed: { backend: "x", configWas: "y" },
          unplaced: { backend: "x" },
          absent: { backend: "gone" },
          app: { backend: "x", app: "web/app" },
        },
        { config: { same: "y", changed: "z" }, backends: new Set(["x", "y"]) },
      ),
    ).toEqual({
      apply: [
        ["same", { backend: "x", configWas: "y" }],
        ["unplaced", { backend: "x" }],
      ],
      dropped: ["changed"],
    });
    expect(
      judgeLayer(
        { app: { backend: "x", app: "web/app" }, other: { backend: "x" } },
        { app: "web/app", config: {}, backends: new Set(["x"]) },
      ).apply,
    ).toEqual([["app", { backend: "x", app: "web/app" }]]);
  });
});
