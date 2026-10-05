import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  locateQuote,
  postCheckFindings,
  precheckVerify,
} from "../src/lib/judge-checks.js";
import type { Finding, JudgeOutput } from "../src/lib/schemas.js";

const DOCS = path.join(import.meta.dirname, "fixtures/judge/docs");
const READ_MODELS = "04-Reference/01-Reactor/read-models.md";
const docText = readFileSync(path.join(DOCS, READ_MODELS), "utf8");

function readDoc(rel: string): string | null {
  try {
    return readFileSync(path.join(DOCS, rel), "utf8");
  } catch {
    return null;
  }
}

function docHasSymbol(symbol: string): boolean {
  const pages = [READ_MODELS, "04-Reference/01-Reactor/batches.md"];
  const leaf = symbol.split(".").pop() ?? symbol;
  return pages.some((p) => (readDoc(p) ?? "").includes(leaf));
}

function finding(overrides: Partial<Finding>): Finding {
  return {
    kind: "WRONG",
    docPath: READ_MODELS,
    line: null,
    quote: ".withReadModel(new DocumentCountReadModel())",
    symbol: "ReactorBuilder.withReadModel",
    claim: "takes a factory",
    evidence: [{ turn: 3, uuid: null }],
    proposedEdit: "use a factory",
    confidence: 0.7,
    ...overrides,
  };
}

function judged(findings: Finding[]): JudgeOutput {
  return { findings, summary: "", buildQualityNotes: "" };
}

describe("locateQuote", () => {
  it("finds a verbatim line and reports its 1-indexed line", () => {
    expect(
      locateQuote(docText, ".withReadModel(new DocumentCountReadModel())"),
    ).toEqual({ line: 13 });
  });

  it("normalises whitespace on both sides, including line breaks", () => {
    expect(
      locateQuote(docText, "has two members: `onOperations` and `query`."),
    ).toEqual({ line: 17 });
    expect(
      locateQuote(docText, "  Errors thrown from   `onOperations`"),
    ).toEqual({ line: 20 });
  });

  it("is case-sensitive", () => {
    expect(
      locateQuote(docText, "errors thrown from `onoperations`"),
    ).toBeNull();
  });

  it("rejects quotes shorter than 12 characters", () => {
    expect(locateQuote(docText, "Read models")).toBeNull();
    expect(locateQuote(docText, "# Read models")).toEqual({ line: 5 });
  });

  it("returns null when absent", () => {
    expect(locateQuote(docText, "this sentence is not in the doc")).toBeNull();
  });
});

describe("postCheckFindings", () => {
  const ctx = { readDoc, docHasSymbol };

  it("keeps locatable findings and recomputes line", () => {
    const out = postCheckFindings(judged([finding({ line: 99 })]), ctx);
    expect(out.kept).toHaveLength(1);
    expect(out.kept[0].line).toBe(13);
    expect(out.dropped).toEqual([]);
    expect(out.relabelled).toEqual([]);
  });

  it("drops unlocatable quotes, missing docPath, missing quote and unknown pages", () => {
    const bad = [
      finding({ quote: "not in the page at all" }),
      finding({ docPath: null }),
      finding({ quote: null }),
      finding({ docPath: "04-Reference/nope.md" }),
    ];
    const out = postCheckFindings(judged(bad), ctx);
    expect(out.kept).toEqual([]);
    expect(out.dropped.map((d) => d.reason)).toEqual([
      "unlocatable",
      "unlocatable",
      "unlocatable",
      "unlocatable",
    ]);
  });

  it("keeps MISSING findings with no page when the docs lack the symbol", () => {
    const missing = finding({
      kind: "MISSING",
      docPath: null,
      quote: null,
      symbol: "ReactorBuilder.withProcessor",
    });
    const out = postCheckFindings(judged([missing]), ctx);
    expect(out.kept).toEqual([missing]);
    expect(out.relabelled).toEqual([]);
  });

  it("relabels MISSING to UNCLEAR when the docs mention the symbol", () => {
    const out = postCheckFindings(
      judged([
        finding({
          kind: "MISSING",
          docPath: null,
          quote: null,
          symbol: "IReadModel.query",
        }),
      ]),
      ctx,
    );
    expect(out.kept).toHaveLength(1);
    expect(out.kept[0].kind).toBe("UNCLEAR");
    expect(out.relabelled).toEqual([
      { index: 0, from: "MISSING", to: "UNCLEAR" },
    ]);
  });

  it("merges duplicates by (docPath, symbol, kind), keeping confidence and the evidence union", () => {
    const low = finding({
      confidence: 0.4,
      evidence: [{ turn: 3, uuid: null }],
      proposedEdit: "low",
    });
    const high = finding({
      docPath: "./04-Reference/01-Reactor/read-models.mdx",
      confidence: 0.9,
      evidence: [
        { turn: 3, uuid: null },
        { turn: 8, uuid: "u8" },
      ],
      proposedEdit: "high",
    });
    const out = postCheckFindings(judged([low, high]), {
      readDoc: (rel) =>
        readDoc(rel.replace(/^\.\//, "").replace(/\.mdx$/, ".md")),
      docHasSymbol,
    });
    expect(out.kept).toHaveLength(1);
    expect(out.kept[0].proposedEdit).toBe("high");
    expect(out.kept[0].evidence).toEqual([
      { turn: 3, uuid: null },
      { turn: 8, uuid: "u8" },
    ]);
    expect(out.dropped).toEqual([
      { finding: { ...low, line: 13 }, reason: "duplicate" },
    ]);
  });

  it("does not merge across kinds", () => {
    const out = postCheckFindings(
      judged([finding({ kind: "WRONG" }), finding({ kind: "STALE" })]),
      ctx,
    );
    expect(out.kept).toHaveLength(2);
  });
});

describe("precheckVerify", () => {
  const dts = new Set(["ReactorBuilder.withReadModel", "IReadModel.query"]);
  const ctx = {
    dtsHasSymbol: (s: string) => dts.has(s),
    docHasSymbol,
  };

  it("refutes MISSING when the docs mention the symbol", () => {
    const r = precheckVerify(
      finding({
        kind: "MISSING",
        docPath: null,
        quote: null,
        symbol: "IReadModel.query",
      }),
      ctx,
      4,
    );
    expect(r?.status).toBe("REFUTED");
    expect(r?.index).toBe(4);
    expect(r?.byPrecheck).toBe(true);
  });

  it("leaves MISSING to the model when the docs lack the symbol", () => {
    expect(
      precheckVerify(
        finding({
          kind: "MISSING",
          docPath: null,
          quote: null,
          symbol: "withProcessor",
        }),
        ctx,
        0,
      ),
    ).toBeNull();
  });

  it("verifies WRONG/STALE when the doc names a symbol the .d.ts lack", () => {
    const r = precheckVerify(
      finding({ kind: "STALE", symbol: "executeBatch" }),
      ctx,
      1,
    );
    expect(r?.status).toBe("VERIFIED");
    expect(r?.byPrecheck).toBe(true);
  });

  it("leaves WRONG to the model when the .d.ts declare the symbol", () => {
    expect(precheckVerify(finding({ kind: "WRONG" }), ctx, 0)).toBeNull();
  });

  it("never short-circuits UNCLEAR", () => {
    expect(
      precheckVerify(
        finding({ kind: "UNCLEAR", symbol: "executeBatch" }),
        ctx,
        0,
      ),
    ).toBeNull();
  });
});
