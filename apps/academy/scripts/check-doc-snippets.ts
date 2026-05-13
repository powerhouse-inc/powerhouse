/**
 * Tier 1 static checker for ph-lora.
 *
 * Finds all ```typescript check fenced blocks in mapped academy doc sections,
 * compiles them with tsc as ambient declarations, and reports type errors as
 * doc drift.
 *
 * Exit code: 0 = all pass, 1 = any failure (CI-safe).
 *
 * Authoring convention:
 *   ```typescript check
 *   function myHook(): string | undefined;
 *   ```
 * Snippets are compiled as .d.ts (ambient declarations). They must be
 * self-contained type/function/interface signatures — no imports, no bodies.
 * Only API-reference docs should use the `check` tag; tutorial snippets
 * (partial, step-in-context) stay as plain ```typescript.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ACADEMY_ROOT = path.resolve(__dirname, "..");
const MONOREPO_ROOT = path.resolve(ACADEMY_ROOT, "../..");
const MAPPING_PATH = path.resolve(
  MONOREPO_ROOT,
  "test/ph-lora/ph-lora-mapping.json",
);

interface MappingSection {
  id: string;
  label: string;
  docPath: string;
  packages: string[];
  checkFocus: string;
  skipMechanicalCheck?: boolean;
}

interface Mapping {
  sections: MappingSection[];
}

interface Snippet {
  sourceFile: string;
  sourceLine: number; // 1-based line of the opening fence in the doc
  content: string;
  sectionId: string;
}

interface CheckResult {
  snippet: Snippet;
  passed: boolean;
  errors: string[];
}

// ---------------------------------------------------------------------------
// 1. Load mapping
// ---------------------------------------------------------------------------

function loadMapping(): Mapping {
  if (!fs.existsSync(MAPPING_PATH)) {
    throw new Error(`Mapping file not found: ${MAPPING_PATH}`);
  }
  return JSON.parse(fs.readFileSync(MAPPING_PATH, "utf8")) as Mapping;
}

// ---------------------------------------------------------------------------
// 2. Extract tagged snippets from doc files
// ---------------------------------------------------------------------------

const FENCE_RE = /^```(?:typescript|ts)\s+check\s*$/;
const CLOSE_FENCE_RE = /^```\s*$/;

function extractSnippets(filePath: string, sectionId: string): Snippet[] {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const snippets: Snippet[] = [];

  let inSnippet = false;
  let snippetLines: string[] = [];
  let openLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!inSnippet && FENCE_RE.test(line.trim())) {
      inSnippet = true;
      snippetLines = [];
      openLine = i + 1; // 1-based
    } else if (inSnippet && CLOSE_FENCE_RE.test(line.trim())) {
      snippets.push({
        sourceFile: filePath,
        sourceLine: openLine,
        content: snippetLines.join("\n"),
        sectionId,
      });
      inSnippet = false;
    } else if (inSnippet) {
      snippetLines.push(line);
    }
  }

  return snippets;
}

function walkMarkdown(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory() && !entry.startsWith("_")) {
      results.push(...walkMarkdown(full));
    } else if (entry.endsWith(".md") || entry.endsWith(".mdx")) {
      results.push(full);
    }
  }
  return results;
}

function collectSnippets(mapping: Mapping): Snippet[] {
  const seen = new Set<string>(); // "file:line" dedup key
  const snippets: Snippet[] = [];

  for (const section of mapping.sections) {
    if (section.skipMechanicalCheck) continue;

    const docPath = path.resolve(ACADEMY_ROOT, section.docPath);
    if (!fs.existsSync(docPath)) continue;

    const files = fs.statSync(docPath).isDirectory()
      ? walkMarkdown(docPath)
      : [docPath];

    for (const file of files) {
      for (const snippet of extractSnippets(file, section.id)) {
        const key = `${snippet.sourceFile}:${snippet.sourceLine}`;
        if (seen.has(key)) continue;
        seen.add(key);
        snippets.push(snippet);
      }
    }
  }

  return snippets;
}

// ---------------------------------------------------------------------------
// 3. Compile snippets via tsc
//
// Snippets are wrapped in `declare module "__snippet__" { ... }` so that:
// - Function/type signatures without bodies are valid (ambient declarations)
// - References to undefined types ARE still reported as errors (unlike .d.ts)
// ---------------------------------------------------------------------------

function runChecks(snippets: Snippet[]): CheckResult[] {
  if (snippets.length === 0) return [];

  // Resolve symlinks so tsc emits bare "snippet-N.ts" relative paths (macOS /tmp → /private/tmp).
  const tmpDir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "ph-lora-snippets-")),
  );

  try {
    // basename → snippet index, for error attribution
    const basenameMap = new Map<string, number>();
    const fileList: string[] = [];

    for (let i = 0; i < snippets.length; i++) {
      const snippet = snippets[i]!;
      const basename = `snippet-${i}.ts`;
      const tmpFile = path.join(tmpDir, basename);
      // Wrap in declare module so signatures need no implementation, but
      // unresolved type names still produce TS2304 errors.
      const wrapped = `declare module "__snippet__" {\n${snippet.content}\n}\n`;
      fs.writeFileSync(tmpFile, wrapped);
      basenameMap.set(basename, i);
      fileList.push(basename);
    }

    const tsconfig = {
      compilerOptions: {
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "bundler",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
      },
      files: fileList,
    };
    const tsconfigPath = path.join(tmpDir, "tsconfig.json");
    fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2));

    // Use the local tsc from the monorepo — the global tsc wrapper may be broken.
    const tscBin = path.resolve(MONOREPO_ROOT, "node_modules/.bin/tsc");

    let tscOutput = "";
    try {
      execSync(`"${tscBin}" --project "${tsconfigPath}"`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        cwd: tmpDir,
      });
    } catch (err: unknown) {
      if (err && typeof err === "object") {
        const e = err as { stdout?: string; stderr?: string };
        tscOutput = (e.stdout ?? "") + (e.stderr ?? "");
      }
    }

    // tsc output format: "snippet-N.ts(line,col): error TSxxxx: message"
    const errorsBySnippet = new Map<number, string[]>();
    const errorRe = /^(snippet-\d+\.ts)\((\d+),\d+\):\s+error\s+\w+:\s+(.+)$/gm;
    let match: RegExpExecArray | null;

    while ((match = errorRe.exec(tscOutput)) !== null) {
      const basename = match[1]!;
      const lineInFile = parseInt(match[2]!, 10);
      const message = match[3]!.trim();

      const idx = basenameMap.get(basename);
      if (idx === undefined) continue;

      const snippet = snippets[idx]!;
      // Temp file: line 1 = "declare module..." wrapper, snippet starts line 2.
      // sourceLine = fence line in doc, content starts at sourceLine+1.
      // docLine = (sourceLine+1) + (lineInFile-2) = sourceLine + lineInFile - 1
      const docLine = snippet.sourceLine + lineInFile - 1;

      const relSource = path.relative(MONOREPO_ROOT, snippet.sourceFile);
      const errorEntry = `  ${relSource}:${docLine} — ${message}`;

      if (!errorsBySnippet.has(idx)) errorsBySnippet.set(idx, []);
      errorsBySnippet.get(idx)!.push(errorEntry);
    }

    return snippets.map((snippet, i) => ({
      snippet,
      passed: !errorsBySnippet.has(i),
      errors: errorsBySnippet.get(i) ?? [],
    }));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 4. Report
// ---------------------------------------------------------------------------

function report(results: CheckResult[]): boolean {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  if (results.length === 0) {
    console.log(
      "ℹ  No typescript check snippets found.\n" +
        "   Tag API reference snippets with ```typescript check to opt in.",
    );
    return true;
  }

  console.log(`\n✅  ${passed} snippet${passed !== 1 ? "s" : ""} passed`);
  if (failed > 0) {
    console.log(`❌  ${failed} snippet${failed !== 1 ? "s" : ""} failed\n`);
  }

  for (const result of results) {
    if (result.passed) continue;
    const rel = path.relative(MONOREPO_ROOT, result.snippet.sourceFile);
    console.log(`FAIL  ${rel}:${result.snippet.sourceLine}`);
    for (const err of result.errors) {
      console.log(err);
    }
    console.log();
  }

  return failed === 0;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

try {
  const mapping = loadMapping();
  const snippets = collectSnippets(mapping);
  const results = runChecks(snippets);
  const ok = report(results);
  process.exit(ok ? 0 : 1);
} catch (err) {
  console.error("check-doc-snippets:", err);
  process.exit(1);
}
