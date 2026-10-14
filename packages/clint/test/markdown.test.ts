import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../src/interactive/markdown.js";

describe("renderMarkdown", () => {
  it("returns empty string for empty input", () => {
    expect(renderMarkdown("")).toBe("");
  });

  it("renders plain text", () => {
    const result = renderMarkdown("Hello, world!");
    expect(result).toContain("Hello, world!");
  });

  it("renders bold text", () => {
    const result = renderMarkdown("**bold**");
    // The output should contain "bold" — ANSI codes may be absent
    // when chalk detects a non-TTY (e.g. in test/CI environments)
    expect(result).toContain("bold");
  });

  it("renders code blocks", () => {
    const result = renderMarkdown("`inline code`");
    expect(result).toContain("inline code");
  });

  it("renders multi-line content", () => {
    const result = renderMarkdown("Line 1\n\nLine 2");
    expect(result).toContain("Line 1");
    expect(result).toContain("Line 2");
  });

  it("renders headings", () => {
    const result = renderMarkdown("# Title");
    expect(result).toContain("Title");
  });

  it("renders lists", () => {
    const result = renderMarkdown("- item 1\n- item 2");
    expect(result).toContain("item 1");
    expect(result).toContain("item 2");
  });
});
