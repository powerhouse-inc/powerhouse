#!/usr/bin/env node
/* eslint-disable */
// Normalize ESLint + oxlint JSON outputs to comparable findings and
// compute the symmetric diff. Output is grouped by severity then rule.

import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());

const eslintRaw = JSON.parse(fs.readFileSync("/tmp/eslint.json", "utf8"));
const oxlintRaw = JSON.parse(fs.readFileSync("/tmp/oxlint.json", "utf8"));

const relPath = (p) => path.relative(root, p);

// ESLint shape: [{ filePath, messages: [{ ruleId, severity, line, column, message }] }]
const eslintFindings = [];
for (const file of eslintRaw) {
  const file_path = relPath(file.filePath);
  for (const m of file.messages) {
    if (!m.ruleId) continue; // skip parser errors
    eslintFindings.push({
      tool: "eslint",
      file: file_path,
      line: m.line ?? 0,
      rule: m.ruleId,
      severity: m.severity === 2 ? "error" : "warn",
      message: m.message,
    });
  }
}

// Oxlint shape: array of arrays per file? Single array of diagnostics?
// Inspect: oxlint -f json emits a flat array of diagnostics.
// Each diagnostic: { severity, code, filename, message, labels: [{ span: { offset, length } }]}
// We approximate `line` from labels[0].span.offset by reading the file once.
const fileLineCache = new Map();
const offsetToLine = (file, offset) => {
  if (!file) return 0;
  let lineIdx = fileLineCache.get(file);
  if (!lineIdx) {
    try {
      const src = fs.readFileSync(file, "utf8");
      lineIdx = [];
      let pos = 0;
      lineIdx.push(0);
      for (let i = 0; i < src.length; i++) {
        if (src.charCodeAt(i) === 10) lineIdx.push(i + 1);
      }
    } catch {
      lineIdx = [0];
    }
    fileLineCache.set(file, lineIdx);
  }
  let lo = 0, hi = lineIdx.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineIdx[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
};

const normalizeRule = (rawCode) => {
  // oxlint code like "eslint(no-unused-vars)" or "typescript(no-floating-promises)"
  // Map to ESLint-equivalent rule id when possible:
  //   eslint(X) -> X
  //   typescript(X) -> @typescript-eslint/X
  //   react-hooks(X) -> react-hooks/X
  //   <plugin>(X) -> <plugin>/X
  const m = /^([a-z0-9-]+)\(([a-z0-9_/-]+)\)$/.exec(rawCode);
  if (!m) return rawCode;
  const [, plugin, name] = m;
  if (plugin === "eslint") return name;
  if (plugin === "typescript") return `@typescript-eslint/${name}`;
  return `${plugin}/${name}`;
};

const oxlintFindings = [];
const oxlintArr = Array.isArray(oxlintRaw) ? oxlintRaw : oxlintRaw.diagnostics ?? [];
for (const d of oxlintArr) {
  const file = d.filename ?? d.file ?? "";
  // oxlint filenames are already relative to the cwd
  const file_path = file.startsWith("/") ? relPath(file) : file;
  const line = d.labels?.[0]?.span?.line ?? 0;
  const code = d.code ?? d.rule ?? "";
  oxlintFindings.push({
    tool: "oxlint",
    file: file_path,
    line,
    rule: normalizeRule(code),
    rawRule: code,
    severity: d.severity === "error" ? "error" : "warn",
    message: d.message ?? "",
  });
}

// Alternative rule keys to cover oxlint emitting `eslint(no-unused-vars)`
// where ESLint emits `@typescript-eslint/no-unused-vars` (the TS plugin
// shadows the core rule).
const altRules = (rule) => {
  const out = [rule];
  if (rule.startsWith("@typescript-eslint/")) out.push(rule.slice("@typescript-eslint/".length));
  else if (!rule.includes("/")) out.push(`@typescript-eslint/${rule}`);
  return out;
};
const keys = (f) => altRules(f.rule).map((r) => `${f.file}|${f.line}|${r}`);
const key = (f) => keys(f)[0];

const eslintIndex = new Set();
for (const f of eslintFindings) for (const k of keys(f)) eslintIndex.add(k);
const oxlintIndex = new Set();
for (const f of oxlintFindings) for (const k of keys(f)) oxlintIndex.add(k);

const onlyEslint = eslintFindings.filter((f) => !keys(f).some((k) => oxlintIndex.has(k)));
const onlyOxlint = oxlintFindings.filter((f) => !keys(f).some((k) => eslintIndex.has(k)));
const both = eslintFindings.filter((f) => keys(f).some((k) => oxlintIndex.has(k)));

const groupBy = (arr, k) => {
  const m = new Map();
  for (const item of arr) {
    const g = m.get(item[k]) ?? [];
    g.push(item);
    m.set(item[k], g);
  }
  return m;
};

const summarize = (arr, label) => {
  const errs = arr.filter((f) => f.severity === "error");
  const warns = arr.filter((f) => f.severity === "warn");
  console.log(`\n=== ${label}: ${arr.length} total (${errs.length} errors, ${warns.length} warnings) ===`);
  for (const sev of ["error", "warn"]) {
    const bucket = arr.filter((f) => f.severity === sev);
    if (!bucket.length) continue;
    const byRule = groupBy(bucket, "rule");
    console.log(`  ${sev.toUpperCase()} (${bucket.length}):`);
    const rows = [...byRule.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [rule, items] of rows) {
      console.log(`    ${String(items.length).padStart(4)} ${rule}`);
    }
  }
};

console.log(`ESLint findings: ${eslintFindings.length}`);
console.log(`Oxlint findings: ${oxlintFindings.length}`);
console.log(`Overlap (same file+line+rule): ${both.length}`);

summarize(onlyEslint, "Only ESLint catches");
summarize(onlyOxlint, "Only oxlint catches");

// Persist diff as JSON for the HTML report
const out = {
  totals: {
    eslint: eslintFindings.length,
    oxlint: oxlintFindings.length,
    overlap: both.length,
    only_eslint: onlyEslint.length,
    only_oxlint: onlyOxlint.length,
  },
  by_rule: {
    only_eslint: [...groupBy(onlyEslint, "rule").entries()]
      .map(([rule, items]) => ({
        rule,
        severity_max: items.some((i) => i.severity === "error") ? "error" : "warn",
        errors: items.filter((i) => i.severity === "error").length,
        warnings: items.filter((i) => i.severity === "warn").length,
        total: items.length,
        sample: items.slice(0, 2).map((i) => ({ file: i.file, line: i.line, message: i.message.slice(0, 200) })),
      }))
      .sort((a, b) => {
        const sev = (s) => (s === "error" ? 0 : 1);
        return sev(a.severity_max) - sev(b.severity_max) || b.total - a.total;
      }),
    only_oxlint: [...groupBy(onlyOxlint, "rule").entries()]
      .map(([rule, items]) => ({
        rule,
        severity_max: items.some((i) => i.severity === "error") ? "error" : "warn",
        errors: items.filter((i) => i.severity === "error").length,
        warnings: items.filter((i) => i.severity === "warn").length,
        total: items.length,
        sample: items.slice(0, 2).map((i) => ({ file: i.file, line: i.line, message: i.message.slice(0, 200) })),
      }))
      .sort((a, b) => {
        const sev = (s) => (s === "error" ? 0 : 1);
        return sev(a.severity_max) - sev(b.severity_max) || b.total - a.total;
      }),
  },
};

fs.writeFileSync("benchmarks/diff.json", JSON.stringify(out, null, 2));
console.log("\nWrote benchmarks/diff.json");
