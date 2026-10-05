import { DateRangePreset } from "@powerhousedao/pieces-framework";
import { describe, expect, it } from "vitest";
import { DATE_PRESETS, richTextMode } from "./prop-controls.js";

describe("DATE_PRESETS", () => {
  it("offers the framework's presets, in its order, each labelled", () => {
    expect(DATE_PRESETS.map((preset) => preset.value)).toEqual(
      DateRangePreset.options,
    );
    for (const preset of DATE_PRESETS) expect(preset.label).not.toBe("");
  });
});

describe("richTextMode", () => {
  it("maps the values the framework declares", () => {
    expect(richTextMode("html")).toBe("html");
    expect(richTextMode("markdown")).toBe("markdown");
    expect(richTextMode("md")).toBe("markdown");
    expect(richTextMode("plain_text")).toBe("plain");
    expect(richTextMode("text")).toBe("plain");
  });

  it("falls back to plain for anything else, as the framework does", () => {
    expect(richTextMode("HTML")).toBe("plain");
    expect(richTextMode("text/html")).toBe("plain");
    expect(richTextMode(undefined)).toBe("plain");
    expect(richTextMode(3)).toBe("plain");
  });
});
