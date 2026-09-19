/**
 * Deterministic checks around the judge and verifier model calls. Pure: the
 * caller supplies file access through the ctx callbacks.
 */
import { normalizeDocPath } from "./findings.js";
import type {
  Finding,
  JudgeOutput,
  JudgeStepResult,
  VerifyResult,
} from "./schemas.js";

export const MIN_QUOTE_CHARS = 12;

/** Collapses whitespace runs to one space and trims. */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Finds the first whitespace-normalised, case-sensitive occurrence of quote
 * in docText and returns the 1-indexed line where it starts.
 */
export function locateQuote(
  docText: string,
  quote: string,
): { line: number } | null {
  const needle = normalizeWhitespace(quote);
  if (needle.length < MIN_QUOTE_CHARS) return null;

  // Normalised haystack plus a map from each normalised index to its source offset.
  let haystack = "";
  const offsets: number[] = [];
  let inSpace = false;
  for (let i = 0; i < docText.length; i += 1) {
    const ch = docText[i];
    if (/\s/.test(ch)) {
      if (!inSpace) {
        haystack += " ";
        offsets.push(i);
        inSpace = true;
      }
      continue;
    }
    inSpace = false;
    haystack += ch;
    offsets.push(i);
  }

  const at = haystack.indexOf(needle);
  if (at === -1) return null;
  const sourceOffset = offsets[at];
  let line = 1;
  for (let i = 0; i < sourceOffset; i += 1) {
    if (docText[i] === "\n") line += 1;
  }
  return { line };
}

export interface PostCheckContext {
  /** Doc text for a path relative to the docs snapshot; null when absent. */
  readDoc(rel: string): string | null;
  /** True when any doc page mentions the symbol. */
  docHasSymbol(symbol: string): boolean;
}

type PostCheckResult = Pick<JudgeStepResult, "kept" | "dropped" | "relabelled">;

function mergeKey(f: Finding): string {
  return `${normalizeDocPath(f.docPath ?? "")}|${f.symbol.trim()}|${f.kind}`;
}

function unionEvidence(
  a: Finding["evidence"],
  b: Finding["evidence"],
): Finding["evidence"] {
  const seen = new Set<string>();
  const out: Finding["evidence"] = [];
  for (const e of [...a, ...b]) {
    const id = `${e.turn}|${e.uuid ?? ""}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(e);
  }
  return out.sort((x, y) => x.turn - y.turn);
}

/**
 * Drops unlocatable quotes, recomputes line numbers, relabels MISSING findings
 * whose symbol the docs do mention, and merges duplicates by
 * (docPath, symbol, kind), keeping the higher confidence.
 */
export function postCheckFindings(
  raw: JudgeOutput,
  ctx: PostCheckContext,
): PostCheckResult {
  const result: PostCheckResult = { kept: [], dropped: [], relabelled: [] };
  const byKey = new Map<string, number>();

  raw.findings.forEach((original, index) => {
    let finding: Finding = { ...original };

    if (finding.kind === "MISSING" && ctx.docHasSymbol(finding.symbol)) {
      finding = { ...finding, kind: "UNCLEAR" };
      result.relabelled.push({ index, from: "MISSING", to: "UNCLEAR" });
      // A relabelled finding keeps whatever location it had; only its line is refreshed.
      if (finding.docPath !== null && finding.quote !== null) {
        const text = ctx.readDoc(finding.docPath);
        const at = text === null ? null : locateQuote(text, finding.quote);
        finding = { ...finding, line: at?.line ?? null };
      }
    } else if (finding.kind !== "MISSING") {
      if (finding.docPath === null || finding.quote === null) {
        result.dropped.push({ finding: original, reason: "unlocatable" });
        return;
      }
      const text = ctx.readDoc(finding.docPath);
      const at = text === null ? null : locateQuote(text, finding.quote);
      if (at === null) {
        result.dropped.push({ finding: original, reason: "unlocatable" });
        return;
      }
      finding = { ...finding, line: at.line };
    }

    const key = mergeKey(finding);
    const existingIndex = byKey.get(key);
    if (existingIndex === undefined) {
      byKey.set(key, result.kept.length);
      result.kept.push(finding);
      return;
    }

    const existing = result.kept[existingIndex];
    const winner =
      finding.confidence > existing.confidence ? finding : existing;
    const loser = winner === finding ? existing : finding;
    result.kept[existingIndex] = {
      ...winner,
      evidence: unionEvidence(existing.evidence, finding.evidence),
    };
    result.dropped.push({ finding: loser, reason: "duplicate" });
  });

  return result;
}

export interface PrecheckContext {
  /** True when the installed .d.ts declare the symbol. */
  dtsHasSymbol(symbol: string): boolean;
  /** True when any doc page mentions the symbol. */
  docHasSymbol(symbol: string): boolean;
}

/**
 * Settles a finding without a model call when the file system already
 * decides it. Returns null when the verifier has to look.
 */
export function precheckVerify(
  finding: Finding,
  ctx: PrecheckContext,
  index: number,
): VerifyResult | null {
  const inDocs = ctx.docHasSymbol(finding.symbol);

  if (finding.kind === "MISSING") {
    if (!inDocs) return null;
    return {
      index,
      status: "REFUTED",
      prediction: `no doc page mentions ${finding.symbol}`,
      observation: `the docs snapshot mentions ${finding.symbol}`,
      note: "precheck: symbol found in docs",
      byPrecheck: true,
    };
  }

  if (finding.kind === "WRONG" || finding.kind === "STALE") {
    if (!inDocs || ctx.dtsHasSymbol(finding.symbol)) return null;
    return {
      index,
      status: "VERIFIED",
      prediction: `the installed .d.ts do not declare ${finding.symbol} although the docs name it`,
      observation: `${finding.symbol} appears in the docs and in no installed .d.ts`,
      note: "precheck: symbol absent from installed types",
      byPrecheck: true,
    };
  }

  return null;
}
