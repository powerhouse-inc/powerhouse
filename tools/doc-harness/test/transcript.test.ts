import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Metrics } from "../src/lib/schemas.js";
import {
  detectFormat,
  docGaps,
  extractMetrics,
  extractMetricsFromFile,
  importedSymbols,
  isUnder,
  parseTranscriptLines,
  walkTranscript,
  type ExtractContext,
} from "../src/lib/transcript.js";

const FIXTURES = path.join(import.meta.dirname, "fixtures/transcripts");

function load(name: string) {
  return parseTranscriptLines(readFileSync(path.join(FIXTURES, name), "utf8"));
}

const SYNTH_CTX: ExtractContext = {
  workspaceDir: "/ws",
  docsDir: "/docs",
  deniedRoots: ["/secret"],
};

/* The spike ran with cwd spike-a/ws and --add-dir spike-a/docs. */
const SPIKE =
  "/private/tmp/claude-501/-Users-benjaminjordan-projects-powerhouse-powerhouse/f9919d84-d560-41ac-a32e-71e9537604c8/scratchpad/spike-a";
const SPIKE_CTX: ExtractContext = {
  workspaceDir: `${SPIKE}/ws`,
  docsDir: `${SPIKE}/docs`,
  deniedRoots: [
    "/Users/benjaminjordan/projects",
    "/Users/benjaminjordan/.claude",
  ],
};

describe("parseTranscriptLines", () => {
  it("skips blank lines and counts garbage", () => {
    const parsed = parseTranscriptLines(
      '{"type":"a"}\n\n  \nnot json\n[1]\n{"type":"b"}\n',
    );
    expect(parsed.records).toHaveLength(2);
    expect(parsed.badLines).toBe(2);
  });

  it("tolerates a BOM and CRLF", () => {
    const parsed = parseTranscriptLines(
      '\uFEFF{"type":"a"}\r\n{"type":"b"}\r\n',
    );
    expect(parsed.records).toHaveLength(2);
    expect(parsed.badLines).toBe(0);
  });
});

describe("detectFormat", () => {
  it("recognises the stream-json envelope", () => {
    expect(detectFormat(load("run1.stream.jsonl").records)).toBe("stream-json");
    expect(detectFormat(load("synthetic.stream.jsonl").records)).toBe(
      "stream-json",
    );
  });

  it("recognises the session envelope", () => {
    expect(detectFormat(load("synthetic.session.jsonl").records)).toBe(
      "session",
    );
  });

  it("defaults to stream-json when nothing distinguishes them", () => {
    expect(
      detectFormat([{ type: "assistant", message: { content: [] } }]),
    ).toBe("stream-json");
  });
});

describe("extractMetrics on the synthetic stream transcript", () => {
  const { records, badLines } = load("synthetic.stream.jsonl");
  const m = extractMetrics(records, SYNTH_CTX);

  it("validates against the Metrics schema", () => {
    expect(Metrics.safeParse(m).success).toBe(true);
    expect(badLines).toBe(2);
  });

  it("reads header fields from init and result", () => {
    expect(m.format).toBe("stream-json");
    expect(m.cliVersion).toBe("2.1.258");
    expect(m.model).toBe("claude-sonnet-5");
    expect(m.turns).toBe(15);
    expect(m.assistantMessages).toBe(15);
    expect(m.costUsd).toBe(0.5);
    expect(m.durationMs).toBe(12345);
  });

  it("sums usage once per message id", () => {
    expect(m.tokens).toEqual({
      input: 23,
      output: 63,
      cacheCreation: 100,
      cacheRead: 330,
    });
  });

  it("builds the tool histogram", () => {
    expect(m.toolHistogram).toEqual({
      Read: 4,
      Grep: 1,
      Write: 1,
      Bash: 5,
      Edit: 2,
    });
  });

  it("records doc pages read via Read and Grep, relative to docsDir", () => {
    expect(m.docPagesRead).toEqual([
      { rel: "reactor/builder.md", firstTurn: 2, via: "Read" },
      { rel: ".", firstTurn: 3, via: "Grep" },
    ]);
  });

  it("flags escapes and skips the denied ones", () => {
    expect(m.escapes).toEqual([
      {
        kind: "dts-read",
        turn: 4,
        detail: "/ws/node_modules/@powerhousedao/reactor/dist/index.d.ts",
      },
      {
        kind: "network-bash",
        turn: 10,
        detail:
          "curl -s https://registry.npmjs.org/@powerhousedao%2Freactor | head -c 200",
      },
      { kind: "outside-root-read", turn: 11, detail: "/etc/hosts" },
      { kind: "dep-change", turn: 14, detail: "/ws/package.json" },
    ]);
    expect(m.contaminated).toBe(true);
  });

  it("infers bash exit codes and stderr heads", () => {
    expect(m.bashCommands).toHaveLength(5);
    const [tsc1, tsc2, tsc3, curl, denied] = m.bashCommands;
    expect(tsc1).toMatchObject({ turn: 6, isError: true, exitCodeInferred: 2 });
    expect(tsc1.stderrHead).toMatch(/^Exit code 2\nsrc\/index\.ts\(4,3\)/);
    expect(tsc2).toMatchObject({ turn: 8, isError: true, exitCodeInferred: 2 });
    expect(tsc3).toMatchObject({
      turn: 9,
      isError: false,
      exitCodeInferred: 0,
      stderrHead: "WARN deprecated subdependency",
    });
    expect(curl).toMatchObject({
      turn: 10,
      isError: true,
      exitCodeInferred: 56,
    });
    expect(denied).toMatchObject({
      turn: 13,
      cmd: "cat /secret/keys.txt",
      isError: true,
      exitCodeInferred: null,
    });
    expect(m.errorToolResults).toBe(5);
  });

  it("collapses whitespace when counting retry loops", () => {
    expect(m.retryLoops).toEqual([{ cmd: "pnpm tsc --noEmit", count: 2 }]);
  });

  it("extracts symbols from a multiline import in a Write", () => {
    expect(m.symbols.map((s) => [s.pkg, s.name, s.firstUseTurn])).toEqual([
      ["@powerhousedao/reactor", "ReactorBuilder", 5],
      ["@powerhousedao/reactor", "ReactorOptions", 5],
      ["@powerhousedao/reactor", "InMemoryStorage", 5],
      ["document-model", "*", 5],
      ["@powerhousedao/codegen", "default", 5],
    ]);
    for (const s of m.symbols) {
      expect(s.docPage).toBeNull();
      expect(s.firstDocReadTurn).toBeNull();
      expect(s.documentedAnywhere).toBe(false);
    }
  });

  it("correlates symbols with doc pages when a docs index is supplied", () => {
    const withIndex = extractMetrics(records, {
      ...SYNTH_CTX,
      docsIndex: (symbol) =>
        symbol === "ReactorBuilder" ? { rel: "reactor/builder.md" } : null,
      docsHasSymbol: (symbol) =>
        symbol === "ReactorBuilder" || symbol === "ReactorOptions",
    });
    const builder = withIndex.symbols.find((s) => s.name === "ReactorBuilder");
    expect(builder).toMatchObject({
      docPage: "reactor/builder.md",
      firstDocReadTurn: 2,
      documentedAnywhere: true,
    });
    const options = withIndex.symbols.find((s) => s.name === "ReactorOptions");
    expect(options).toMatchObject({
      docPage: null,
      firstDocReadTurn: null,
      documentedAnywhere: true,
    });
    const storage = withIndex.symbols.find((s) => s.name === "InMemoryStorage");
    expect(storage?.documentedAnywhere).toBe(false);
  });

  it("keeps the final text and the stated documentation gaps", () => {
    expect(m.finalText.startsWith("Done. The recipe compiles.")).toBe(true);
    expect(m.docGapsStated).toBe(
      "- builder.md never mentions `withReadModels`; I found it in the .d.ts.\n- No page covers `ReactorConfig`.",
    );
  });
});

describe("extractMetrics on the synthetic session transcript", () => {
  const stream = extractMetrics(
    load("synthetic.stream.jsonl").records,
    SYNTH_CTX,
  );
  const session = extractMetrics(
    load("synthetic.session.jsonl").records,
    SYNTH_CTX,
  );

  it("yields the same content-derived metrics as the stream envelope", () => {
    expect(session.format).toBe("session");
    expect(session.toolHistogram).toEqual(stream.toolHistogram);
    expect(session.docPagesRead).toEqual(stream.docPagesRead);
    expect(session.symbols).toEqual(stream.symbols);
    expect(session.escapes).toEqual(stream.escapes);
    expect(session.bashCommands).toEqual(stream.bashCommands);
    expect(session.retryLoops).toEqual(stream.retryLoops);
    expect(session.tokens).toEqual(stream.tokens);
    expect(session.finalText).toBe(stream.finalText);
    expect(session.docGapsStated).toBe(stream.docGapsStated);
    expect(session.contaminated).toBe(true);
  });

  it("falls back to the envelope version and the budget attachment", () => {
    expect(session.cliVersion).toBe("2.1.258");
    expect(session.model).toBe("claude-sonnet-5");
    expect(session.costUsd).toBe(0.5);
    expect(session.durationMs).toBeNull();
    expect(session.turns).toBe(15);
    expect(session.assistantMessages).toBe(15);
  });

  it("honours toolDenialKind on the record", () => {
    const walk = walkTranscript(load("synthetic.session.jsonl").records);
    const denied = walk.toolCalls.find(
      (c) => c.input.command === "cat /secret/keys.txt",
    );
    expect(denied?.result?.denied).toBe(true);
    const read = walk.toolCalls.find(
      (c) => c.input.file_path === "/secret/keys.txt",
    );
    expect(read?.result?.denied).toBe(true);
  });
});

describe("extractMetrics on the spike transcripts", () => {
  it("run1: every escape attempt was denied, so nothing is contaminated", () => {
    const m = extractMetricsFromFile(
      path.join(FIXTURES, "run1.stream.jsonl"),
      SPIKE_CTX,
    );
    expect(Metrics.safeParse(m).success).toBe(true);
    expect(m.format).toBe("stream-json");
    expect(m.cliVersion).toBe("2.1.258");
    expect(m.model).toBe("claude-haiku-4-5-20251001");
    expect(m.turns).toBe(5);
    expect(m.assistantMessages).toBe(7);
    expect(m.costUsd).toBeCloseTo(0.0188, 3);
    expect(m.toolHistogram).toEqual({ Read: 3, Bash: 1 });
    expect(m.docPagesRead).toEqual([
      { rel: "guide.md", firstTurn: 4, via: "Read" },
    ]);
    expect(m.escapes).toEqual([]);
    expect(m.bashCommands).toEqual([
      {
        turn: 5,
        cmd: "cat /Users/benjaminjordan/projects/powerhouse/powerhouse/package.json | head -3",
        isError: true,
        exitCodeInferred: null,
        stderrHead:
          "Permission to use Bash with command cat /Users/benjaminjordan/projects/powerhouse/powerhouse/package.json has been denied.",
      },
    ]);
    expect(m.errorToolResults).toBe(2);
    expect(m.contaminated).toBe(false);
    expect(m.docGapsStated).toBeNull();
    expect(m.finalText).toMatch(/^\(1\) Permission denied/);
    expect(m.tokens).toEqual({
      input: 18,
      output: 6,
      cacheCreation: 5710,
      cacheRead: 19652,
    });
  });

  it("run1b: the python read of a denied path executed, so it is contaminated", () => {
    const m = extractMetricsFromFile(
      path.join(FIXTURES, "run1b.stream.jsonl"),
      SPIKE_CTX,
    );
    expect(Metrics.safeParse(m).success).toBe(true);
    expect(m.toolHistogram).toEqual({ Bash: 6 });
    expect(m.escapes).toHaveLength(1);
    expect(m.escapes[0]).toMatchObject({ kind: "denied-path-bash" });
    expect(m.escapes[0].detail).toMatch(/^python3 -c/);
    expect(m.contaminated).toBe(true);
    const denied = m.bashCommands.filter(
      (b) => b.exitCodeInferred === null && b.isError,
    );
    expect(denied).toHaveLength(4);
    const enoent = m.bashCommands.find((b) => b.cmd === "head -2 package.json");
    expect(enoent).toMatchObject({ isError: true, exitCodeInferred: 1 });
    const python = m.bashCommands.find((b) => b.cmd.startsWith("python3"));
    expect(python).toMatchObject({
      isError: false,
      exitCodeInferred: 0,
      stderrHead: "",
    });
    expect(m.retryLoops).toEqual([]);
    expect(m.docPagesRead).toEqual([]);
  });
});

describe("unknown records", () => {
  it("are ignored", () => {
    const base = load("synthetic.stream.jsonl").records;
    const noisy = [
      { type: "weird" },
      { nope: 1 },
      ...base,
      { type: "attachment", attachment: {} },
    ];
    expect(extractMetrics(noisy, SYNTH_CTX)).toEqual(
      extractMetrics(base, SYNTH_CTX),
    );
  });

  it("yields an empty Metrics for an empty transcript", () => {
    const m = extractMetrics([], SYNTH_CTX);
    expect(Metrics.safeParse(m).success).toBe(true);
    expect(m.turns).toBe(0);
    expect(m.costUsd).toBeNull();
    expect(m.finalText).toBe("");
    expect(m.contaminated).toBe(false);
  });
});

describe("importedSymbols", () => {
  it("handles named, type, aliased, namespace and default imports", () => {
    const src = `
import { A, type B, C as D } from "@powerhousedao/reactor";
import type { E } from '@powerhousedao/document-drive';
import * as ns from "document-model/core";
import def, { F } from "@powerhousedao/codegen";
import { G } from "zod";
import "@powerhousedao/side-effect";
`;
    expect(importedSymbols(src)).toEqual([
      { pkg: "@powerhousedao/reactor", name: "A" },
      { pkg: "@powerhousedao/reactor", name: "B" },
      { pkg: "@powerhousedao/reactor", name: "C" },
      { pkg: "@powerhousedao/document-drive", name: "E" },
      { pkg: "document-model/core", name: "*" },
      { pkg: "@powerhousedao/codegen", name: "default" },
      { pkg: "@powerhousedao/codegen", name: "F" },
    ]);
  });

  it("does not span two statements when one has no from clause", () => {
    const src =
      'import "./polyfill";\nimport { A } from "@powerhousedao/reactor";';
    expect(importedSymbols(src)).toEqual([
      { pkg: "@powerhousedao/reactor", name: "A" },
    ]);
  });
});

describe("docGaps", () => {
  it("is heading-level agnostic and case-insensitive", () => {
    expect(
      docGaps(
        "Intro\n\n### DOCUMENTATION GAPS\n\n- one\n- two\n\n## Next\n\nmore",
      ),
    ).toBe("- one\n- two");
  });

  it("returns null when absent", () => {
    expect(docGaps("Nothing here")).toBeNull();
  });
});

describe("network heuristics", () => {
  const ok = (cmd: string) =>
    extractMetrics(
      [
        {
          type: "assistant",
          message: {
            id: "m",
            content: [
              {
                type: "tool_use",
                id: "t",
                name: "Bash",
                input: { command: cmd },
              },
            ],
          },
        },
        {
          type: "user",
          message: {
            content: [{ type: "tool_result", tool_use_id: "t", content: "" }],
          },
        },
      ],
      SYNTH_CTX,
    ).escapes.some((e) => e.kind === "network-bash");

  it("flags fetching commands", () => {
    expect(ok("curl https://x")).toBe(true);
    expect(ok("cd /ws && wget https://x")).toBe(true);
    expect(ok("git clone https://x")).toBe(true);
    expect(ok("pnpm add left-pad")).toBe(true);
    expect(ok("npm i left-pad")).toBe(true);
    expect(ok("npm install")).toBe(true);
    expect(ok("npx create-thing")).toBe(true);
  });

  it("allows local tooling", () => {
    expect(ok("npx tsc --noEmit")).toBe(false);
    expect(ok("npx vitest run")).toBe(false);
    expect(ok("pnpm tsc")).toBe(false);
    expect(ok("git status")).toBe(false);
    expect(ok("echo curling")).toBe(false);
  });
});

describe("isUnder", () => {
  it("is exact on the boundary", () => {
    expect(isUnder("/ws", "/ws")).toBe(true);
    expect(isUnder("/ws/a/b", "/ws")).toBe(true);
    expect(isUnder("/wsx/a", "/ws")).toBe(false);
    expect(isUnder("/", "/ws")).toBe(false);
  });
});
