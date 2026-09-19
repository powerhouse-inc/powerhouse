import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildDocsSymbolIndex,
  hashTree,
  listFiles,
  pageTitle,
  snapshotDocs,
  symbolPattern,
  writeDocsIndex,
} from "../src/lib/docs.js";
import { DOCS_REL } from "../src/lib/paths.js";

const FIXTURE = path.resolve(import.meta.dirname, "fixtures/docs-mini");

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "doc-harness-docs-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function git(repo: string, ...args: string[]): string {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@example.com",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@example.com",
    },
  }).trim();
}

function initRepoWithDocs(): string {
  const repo = path.join(tmp, "repo");
  mkdirSync(repo, { recursive: true });
  git(repo, "init", "-q");
  cpSync(FIXTURE, path.join(repo, DOCS_REL), { recursive: true });
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "docs");
  return repo;
}

describe("snapshotDocs", () => {
  it("archives HEAD, drops binaries and empty dirs, hashes stably", async () => {
    const repo = initRepoWithDocs();
    const head = git(repo, "rev-parse", "HEAD");

    const out1 = path.join(tmp, "out1");
    const snap1 = await snapshotDocs({
      monorepoRoot: repo,
      sha: "HEAD",
      outDir: out1,
    });
    expect(snap1.sha).toBe(head);
    expect(snap1.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(listFiles(out1)).toEqual([
      "00-Home.md",
      "reactor/builder.md",
      "reactor/intro.mdx",
      "reactor/meta.json",
      "reactor/processors.md",
    ]);
    expect(snap1.fileCount).toBe(5);
    expect(existsSync(path.join(out1, "img"))).toBe(false);

    const out2 = path.join(tmp, "out2");
    const snap2 = await snapshotDocs({
      monorepoRoot: repo,
      sha: head,
      outDir: out2,
    });
    expect(snap2.hash).toBe(snap1.hash);
    expect(snap2.hash).toMatch(/^[0-9a-f]{40}$/);
  });

  it("rejects an unknown revision", async () => {
    const repo = initRepoWithDocs();
    await expect(
      snapshotDocs({
        monorepoRoot: repo,
        sha: "no-such-ref",
        outDir: path.join(tmp, "out"),
      }),
    ).rejects.toThrow(/rev-parse/);
  });
});

describe("hashTree", () => {
  it("changes when content changes and ignores the directory location", () => {
    const a = path.join(tmp, "a");
    const b = path.join(tmp, "b");
    cpSync(FIXTURE, a, { recursive: true });
    cpSync(FIXTURE, b, { recursive: true });
    expect(hashTree(a)).toBe(hashTree(b));
    rmSync(path.join(b, "00-Home.md"));
    expect(hashTree(a)).not.toBe(hashTree(b));
  });
});

describe("writeDocsIndex", () => {
  it("lists md/mdx pages with their title, sorted", () => {
    const docs = path.join(tmp, "docs");
    cpSync(FIXTURE, docs, { recursive: true });
    const content = writeDocsIndex(docs);
    expect(content).toBe(
      [
        "- 00-Home.md : Welcome to the mini docs",
        "- reactor/builder.md : Building a Reactor",
        "- reactor/intro.mdx : Reactor Overview",
        "- reactor/processors.md : Processors",
        "",
      ].join("\n"),
    );
    expect(readFileSync(path.join(docs, "INDEX.md"), "utf8")).toBe(content);
    // Re-running does not index INDEX.md itself.
    expect(writeDocsIndex(docs)).toBe(content);
  });

  it("falls back to the file name when there is no title", () => {
    expect(pageTitle("just prose", "page")).toBe("page");
    expect(pageTitle('---\ntitle: "Quoted"\n---\n# H', "x")).toBe("Quoted");
  });
});

describe("buildDocsSymbolIndex", () => {
  it("matches whole tokens inside code blocks and prose", () => {
    const index = buildDocsSymbolIndex(FIXTURE);
    expect(index.hasSymbol("ReactorBuilder")).toBe(true);
    expect(index.pagesWith("ReactorBuilder")).toEqual([
      "reactor/builder.md",
      "reactor/intro.mdx",
    ]);
    expect(index.pagesWith("withReadModels")).toEqual(["reactor/builder.md"]);
    // Present only in prose as "no withReadModel": still a whole-token hit.
    expect(index.hasSymbol("withReadModel")).toBe(true);
    expect(index.hasSymbol("ProcessorManager")).toBe(true);
    expect(index.hasSymbol("Processor")).toBe(false);
    expect(index.hasSymbol("nope")).toBe(false);
  });

  it("supports dotted symbols", () => {
    expect(symbolPattern("a.b").test("x a.b y")).toBe(true);
    expect(symbolPattern("a.b").test("x a.by")).toBe(false);
    expect(symbolPattern("a.b").test("x axb")).toBe(false);
  });

  it("is empty for a missing directory", () => {
    const index = buildDocsSymbolIndex(path.join(tmp, "missing"));
    expect(index.hasSymbol("ReactorBuilder")).toBe(false);
  });
});
