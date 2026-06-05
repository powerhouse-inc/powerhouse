/**
 * Phase 3a: configurable pattern scan over the extracted packages.
 *
 * The search is supplied as data - nothing here is specific to any one audit.
 *
 * Usage:
 *   tsx tools/registry-audit/analyze.ts --rules <file.json> [options]
 *   tsx tools/registry-audit/analyze.ts --pattern "<regex>" [--pattern ...]
 *
 * Options:
 *   --rules <file>       JSON rules file (repeatable). See rules/legacy-attachments.json.
 *   --pattern <regex>    Ad-hoc rule (repeatable); id is derived from the regex.
 *   --rule <id>          Only run the rule(s) with this id (repeatable).
 *   --filter <substr>    Only scan packages whose name includes <substr> (repeatable).
 *   --ext <list>         Comma-separated file extensions to scan
 *                        (default: d.ts,js,mjs,d.mts,cjs).
 *   --json               Print the full report JSON to stdout instead of a summary.
 *
 * Reads extractedPath from the manifest, writes findings to
 * .cache/registry-audit/report.json.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { opt, parseArgs, REPORT_PATH, requireManifest } from "./lib.js";

/** Conventionally "high" | "medium" | "low", but any string is allowed. */
type Severity = string;

type Rule = {
  id: string;
  description?: string;
  severity?: Severity;
  pattern: string;
  flags?: string;
  /** Only apply to files whose relative path includes one of these substrings. */
  include?: string[];
  /** Skip files whose relative path includes one of these substrings. */
  exclude?: string[];
};

type RulesFile = { name?: string; description?: string; rules: Rule[] };

type CompiledRule = Rule & { regex: RegExp };

type Finding = {
  package: string;
  version: string;
  file: string;
  line: number;
  rule: string;
  severity: Severity;
  snippet: string;
};

async function loadRules(args: ReturnType<typeof parseArgs>): Promise<Rule[]> {
  const rules: Rule[] = [];

  for (const file of args.options.rules ?? []) {
    const parsed = JSON.parse(await readFile(file, "utf8")) as RulesFile;
    rules.push(...parsed.rules);
  }

  for (const pattern of args.options.pattern ?? []) {
    rules.push({
      id: `pattern:${pattern}`,
      severity: "medium",
      pattern,
    });
  }

  const onlyIds = new Set(args.options.rule ?? []);
  return onlyIds.size ? rules.filter((r) => onlyIds.has(r.id)) : rules;
}

function compile(rules: Rule[]): CompiledRule[] {
  return rules.map((r) => ({
    ...r,
    severity: r.severity ?? "medium",
    // Force global+multiline so we can iterate all matches with line numbers.
    regex: new RegExp(r.pattern, `${r.flags ?? ""}g`.replace(/g+/, "g")),
  }));
}

async function* walk(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules") continue;
      yield* walk(full);
    } else if (e.isFile()) {
      yield full;
    }
  }
}

function matchesExt(file: string, exts: string[]): boolean {
  return exts.some((ext) => file.endsWith(`.${ext}`));
}

function lineNumberAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === "\n") line++;
  }
  return line;
}

async function scanFile(
  absFile: string,
  relFile: string,
  pkgName: string,
  version: string,
  rules: CompiledRule[],
): Promise<Finding[]> {
  const findings: Finding[] = [];
  let text: string;
  try {
    text = await readFile(absFile, "utf8");
  } catch {
    return findings;
  }
  const lines = text.split("\n");

  for (const rule of rules) {
    if (rule.include && !rule.include.some((s) => relFile.includes(s)))
      continue;
    if (rule.exclude && rule.exclude.some((s) => relFile.includes(s))) continue;

    rule.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.regex.exec(text)) !== null) {
      const line = lineNumberAt(text, m.index);
      findings.push({
        package: pkgName,
        version,
        file: relFile,
        line,
        rule: rule.id,
        severity: rule.severity!,
        snippet: (lines[line - 1] ?? m[0]).trim().slice(0, 200),
      });
      if (m.index === rule.regex.lastIndex) rule.regex.lastIndex++; // guard zero-width
    }
  }
  return findings;
}

async function main() {
  const args = parseArgs(process.argv.slice(2), ["json"]);
  const filters = args.options.filter ?? [];
  const exts = (opt(args, "ext", "d.ts,js,mjs,d.mts,cjs") as string)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const rules = compile(await loadRules(args));
  if (!rules.length) {
    console.error(
      "No rules supplied. Pass --rules <file.json> and/or --pattern <regex>.",
    );
    process.exit(1);
  }

  const manifest = await requireManifest("tsx tools/registry-audit/extract.ts");
  let entries = Object.values(manifest.packages).filter((e) => e.extractedPath);
  if (filters.length) {
    entries = entries.filter((e) => filters.some((f) => e.name.includes(f)));
  }

  console.log(
    `Scanning ${entries.length} package(s) with ${rules.length} rule(s) ` +
      `over .${exts.join(", .")} files...\n`,
  );

  const allFindings: Finding[] = [];
  for (const entry of entries) {
    const root = entry.extractedPath!;
    for await (const absFile of walk(root)) {
      if (!matchesExt(absFile, exts)) continue;
      const relFile = relative(root, absFile);
      allFindings.push(
        ...(await scanFile(absFile, relFile, entry.name, entry.version, rules)),
      );
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    registry: manifest.registry,
    rules: rules.map((r) => ({
      id: r.id,
      severity: r.severity,
      description: r.description,
    })),
    packagesScanned: entries.length,
    findings: allFindings,
  };
  await writeFile(REPORT_PATH, JSON.stringify(report, null, 2));

  if (args.flags.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // Summary: per package, count by rule.
  const byPackage = new Map<string, Map<string, number>>();
  for (const f of allFindings) {
    const m = byPackage.get(f.package) ?? new Map<string, number>();
    m.set(f.rule, (m.get(f.rule) ?? 0) + 1);
    byPackage.set(f.package, m);
  }

  const flagged = [...byPackage.keys()].sort();
  if (!flagged.length) {
    console.log("No findings. 🎉");
  } else {
    console.log(`Flagged ${flagged.length}/${entries.length} package(s):\n`);
    for (const pkg of flagged) {
      const counts = byPackage.get(pkg)!;
      const total = [...counts.values()].reduce((a, b) => a + b, 0);
      console.log(`  ${pkg}  (${total} finding(s))`);
      for (const [ruleId, count] of [...counts.entries()].sort()) {
        console.log(`      ${count.toString().padStart(4)}  ${ruleId}`);
      }
    }
  }
  console.log(`\nFull report: ${REPORT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
