import { describe, expect, it } from "vitest";
import {
  describeDrift,
  excerpt,
  nearestSymbolLine,
} from "../../bench/fix/fix-sites.js";

const lines = [
  "import x from 'y';",
  "",
  "function _baseReducer() {",
  "  return 1;",
  "}",
  "",
  "export function baseReducer() {",
  "  const hash = compute();",
  "  return _baseReducer();",
  "}",
];

describe("excerpt", () => {
  it("marks the cited line and clips to the file", () => {
    expect(excerpt(lines, 2, 1)).toEqual([
      "  1 | import x from 'y';",
      "> 2 | ",
      "  3 | function _baseReducer() {",
    ]);
    expect(excerpt(lines, 10, 3)).toEqual([
      "   7 | export function baseReducer() {",
      "   8 |   const hash = compute();",
      "   9 |   return _baseReducer();",
      "> 10 | }",
    ]);
  });
});

describe("nearestSymbolLine", () => {
  it("picks the occurrence closest to the cited line, whole word only", () => {
    expect(nearestSymbolLine(lines, "_baseReducer", 8)).toBe(9);
    expect(nearestSymbolLine(lines, "_baseReducer", 2)).toBe(3);
    expect(nearestSymbolLine(lines, "baseReducer", 3)).toBe(7);
    expect(nearestSymbolLine(lines, "_baseReducer", undefined)).toBe(3);
    expect(nearestSymbolLine(lines, "compute", 1)).toBe(8);
    expect(nearestSymbolLine(lines, "nothing", 1)).toBeUndefined();
  });
});

describe("describeDrift", () => {
  const site = { file: "a.ts", line: 8, symbol: "_baseReducer" };

  it("says when the file or symbol is gone, and when the line is beyond the file", () => {
    expect(describeDrift(site, false, 0, undefined, 30)).toContain("MISSING");
    expect(describeDrift(site, true, 5, undefined, 30)).toContain(
      "MOVED: the file has 5 lines",
    );
    expect(describeDrift(site, true, 10, undefined, 30)).toContain(
      "MOVED: _baseReducer does not appear",
    );
  });

  it("names the distance, and calls it drift when the symbol is outside the window", () => {
    expect(describeDrift(site, true, 10, 8, 30)).toBe(
      "_baseReducer on the cited line",
    );
    expect(describeDrift(site, true, 10, 9, 30)).toBe(
      "_baseReducer at line 9, 1 lines from the cited 8",
    );
    expect(describeDrift(site, true, 700, 454, 30)).toContain(
      "DRIFT: _baseReducer nearest at line 454, 446 lines from the cited 8",
    );
    expect(
      describeDrift({ file: "a.ts", line: 8 }, true, 10, undefined, 30),
    ).toBe("no symbol cited");
    expect(
      describeDrift({ file: "a.ts", symbol: "baseReducer" }, true, 10, 7, 30),
    ).toBe("baseReducer at line 7");
  });
});
