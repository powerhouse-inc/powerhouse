/** The docs snapshot the builder reads: git archive reduced to text, indexed. */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { DOCS_REL } from "./paths.js";
import { run } from "./process.js";

export const DOCS_KEEP_EXTENSIONS = new Set([".md", ".mdx", ".json", ".css"]);
const PAGE_EXTENSIONS = new Set([".md", ".mdx"]);
export const DOCS_INDEX_FILE = "INDEX.md";

export interface SnapshotDocsOptions {
  monorepoRoot: string;
  /** Any revision git resolves; HEAD is fine. */
  sha: string;
  outDir: string;
  /** Tree to archive, relative to the repo root. */
  docsRel?: string;
  timeoutMs?: number;
}

export interface DocsSnapshot {
  sha: string;
  fileCount: number;
  hash: string;
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export async function snapshotDocs(
  options: SnapshotDocsOptions,
): Promise<DocsSnapshot> {
  const {
    monorepoRoot,
    sha,
    outDir,
    docsRel = DOCS_REL,
    timeoutMs = 120_000,
  } = options;

  const rev = await run(
    "git",
    ["-C", monorepoRoot, "rev-parse", "--verify", `${sha}^{commit}`],
    { cwd: monorepoRoot, timeoutMs, verbose: false },
  );
  if (rev.status !== "pass") {
    throw new Error(`git rev-parse ${sha} failed: ${rev.output.trim()}`);
  }
  const fullSha = rev.output.trim();

  mkdirSync(outDir, { recursive: true });
  const depth = docsRel.split("/").filter(Boolean).length;
  const pipeline = [
    "set -o pipefail;",
    `git -C ${shellQuote(monorepoRoot)} archive ${fullSha} ${shellQuote(docsRel)}`,
    `| tar -x --strip-components=${depth} -C ${shellQuote(outDir)}`,
  ].join(" ");
  const archive = await run("bash", ["-c", pipeline], {
    cwd: monorepoRoot,
    timeoutMs,
    verbose: false,
  });
  if (archive.status !== "pass") {
    throw new Error(`git archive ${docsRel} failed: ${archive.output.trim()}`);
  }

  for (const rel of listFiles(outDir)) {
    if (!DOCS_KEEP_EXTENSIONS.has(path.extname(rel))) {
      rmSync(path.join(outDir, rel));
    }
  }
  pruneEmptyDirs(outDir);

  const files = listFiles(outDir);
  return {
    sha: fullSha,
    fileCount: files.length,
    hash: hashTree(outDir, files),
  };
}

/** Sorted, posix-style relative paths of every file under dir. */
export function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    const abs = rel ? path.join(dir, rel) : dir;
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(childRel);
      else if (entry.isFile()) out.push(childRel);
    }
  };
  walk("");
  return out.sort();
}

function pruneEmptyDirs(dir: string): boolean {
  let empty = true;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory() && pruneEmptyDirs(child)) {
      rmSync(child, { recursive: true });
    } else {
      empty = false;
    }
  }
  return empty;
}

/** sha1 over sorted relative paths and file bytes; stable across checkouts. */
export function hashTree(dir: string, files = listFiles(dir)): string {
  const h = createHash("sha1");
  for (const rel of files) {
    h.update(rel);
    h.update("\0");
    h.update(readFileSync(path.join(dir, rel)));
    h.update("\0");
  }
  return h.digest("hex");
}

/* ------------------------------------------------------------- index */

export function pageTitle(text: string, fallback: string): string {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (fm) {
    const title = /^title:\s*(.+)$/m.exec(fm[1]);
    if (title) return title[1].trim().replace(/^["']|["']$/g, "");
  }
  const heading = /^#\s+(.+)$/m.exec(text);
  if (heading) return heading[1].trim();
  return fallback;
}

/** Writes docsDir/INDEX.md and returns its content. */
export function writeDocsIndex(docsDir: string): string {
  const lines = listFiles(docsDir)
    .filter((rel) => PAGE_EXTENSIONS.has(path.extname(rel)))
    .filter((rel) => rel !== DOCS_INDEX_FILE)
    .map((rel) => {
      const text = readFileSync(path.join(docsDir, rel), "utf8");
      const fallback = path.basename(rel, path.extname(rel));
      return `- ${rel} : ${pageTitle(text, fallback)}`;
    });
  const content = `${lines.join("\n")}\n`;
  writeFileSync(path.join(docsDir, DOCS_INDEX_FILE), content);
  return content;
}

/* ------------------------------------------------------------ symbols */

const IDENT = "[A-Za-z0-9_$]";

/** Whole-token match: `withReadModel` does not match `withReadModels`. */
export function symbolPattern(symbol: string): RegExp {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<!${IDENT})${escaped}(?!${IDENT})`);
}

export interface DocsSymbolIndex {
  hasSymbol(symbol: string): boolean;
  pagesWith(symbol: string): string[];
}

/** Scans md/mdx text, code blocks included: that is where symbols live. */
export function buildDocsSymbolIndex(docsDir: string): DocsSymbolIndex {
  const pages = new Map<string, string>();
  if (existsSync(docsDir)) {
    for (const rel of listFiles(docsDir)) {
      if (PAGE_EXTENSIONS.has(path.extname(rel)) && rel !== DOCS_INDEX_FILE) {
        pages.set(rel, readFileSync(path.join(docsDir, rel), "utf8"));
      }
    }
  }
  const memo = new Map<string, string[]>();
  const pagesWith = (symbol: string): string[] => {
    const hit = memo.get(symbol);
    if (hit) return hit;
    const re = symbolPattern(symbol);
    const found = [...pages]
      .filter(([, text]) => re.test(text))
      .map(([rel]) => rel);
    memo.set(symbol, found);
    return found;
  };
  return { pagesWith, hasSymbol: (symbol) => pagesWith(symbol).length > 0 };
}
