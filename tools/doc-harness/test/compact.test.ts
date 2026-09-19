import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compactTranscript, truncate } from "../src/lib/compact.js";
import { parseTranscriptLines } from "../src/lib/transcript.js";

const FIXTURES = path.join(import.meta.dirname, "fixtures/transcripts");

function load(name: string) {
  return parseTranscriptLines(readFileSync(path.join(FIXTURES, name), "utf8"))
    .records;
}

describe("compactTranscript", () => {
  const records = load("synthetic.stream.jsonl");
  const md = compactTranscript(records);

  it("is deterministic", () => {
    expect(compactTranscript(records)).toBe(md);
  });

  it("numbers turns by assistant record and skips thinking-only records", () => {
    expect(md).not.toContain("## Turn 1\n");
    expect(md).toContain("## Turn 2\n");
    expect(md).toContain("## Turn 15\n");
    expect(md.indexOf("## Turn 2")).toBeLessThan(md.indexOf("## Turn 3"));
  });

  it("renders each tool with its salient input", () => {
    expect(md).toContain("- **Read** /docs/reactor/builder.md");
    expect(md).toContain("- **Grep** `withReadModel` in /docs");
    expect(md).toContain("- **Bash** `pnpm tsc --noEmit`");
    expect(md).toContain("- **Write** /ws/src/index.ts");
    expect(md).toContain("  ReactorBuilder,");
    expect(md).toContain("- **Edit** /ws/src/index.ts");
    expect(md).toContain("  old:");
    expect(md).toContain("  new:");
  });

  it("flags error and denied results", () => {
    expect(md).toContain("  result: ok");
    expect(md).toContain("  result: is_error\n");
    expect(md).toContain("  result: is_error, denied");
    expect(md).toContain("has been denied.");
  });

  it("ends with the result section", () => {
    const tail = md.slice(md.lastIndexOf("## Result"));
    expect(tail).toContain("- terminal_reason: completed");
    expect(tail).toContain("- turns: 15");
    expect(tail).toContain("- cost_usd: 0.5");
    expect(tail).toContain("- permission_denials: 1");
  });

  it("truncates long text and long results", () => {
    const small = compactTranscript(records, {
      textLimit: 10,
      resultLimit: 20,
      writeHeadLines: 2,
    });
    expect(small).toContain("[... truncated");
    expect(small).toContain("more lines]");
    expect(small).toContain("Let me rea\n[... truncated");
  });

  it("handles the session envelope without a result record", () => {
    const session = compactTranscript(load("synthetic.session.jsonl"));
    expect(session).toContain("## Turn 2\n");
    expect(session).toContain("(no result record)");
    expect(session).toContain("- cost_usd: 0.5");
    const stream = compactTranscript(records);
    expect(session.slice(0, session.indexOf("## Result"))).toBe(
      stream.slice(0, stream.indexOf("## Result")),
    );
  });

  it("renders the spike transcript with its denials", () => {
    const md1 = compactTranscript(load("run1.stream.jsonl"));
    expect(md1).toContain(
      "- **Bash** `cat /Users/benjaminjordan/projects/powerhouse/powerhouse/package.json | head -3`",
    );
    expect(md1).toContain("  result: is_error, denied");
    expect(md1).toContain(
      "- **Read** /Users/benjaminjordan/projects/powerhouse/powerhouse/package.json",
    );
    expect(md1).toContain("- permission_denials: 1");
  });
});

describe("truncate", () => {
  it("leaves short text alone and marks the cut", () => {
    expect(truncate("abc", 3)).toBe("abc");
    expect(truncate("abcdef", 3)).toBe("abc\n[... truncated 3 chars]");
  });
});
