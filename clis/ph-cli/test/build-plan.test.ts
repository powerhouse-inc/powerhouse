// `planBuild` decides which of `ph build`'s steps run for a project, from the
// files on disk alone; these shape the three package kinds it must support.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { assertPiecesOutDir } from "@powerhousedao/shared/build-pieces";
import { afterEach, describe, expect, it } from "vitest";
import { planBuild } from "../src/services/build-plan.js";

const created: string[] = [];

function makeProject(files: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "ph-build-plan-"));
  created.push(dir);
  for (const file of files) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), "export {};\n");
  }
  return dir;
}

afterEach(() => {
  while (created.length > 0) {
    const dir = created.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

const classicFiles = [
  "index.ts",
  "document-models/index.ts",
  "document-models/thing/index.ts",
  "editors/index.ts",
  "style.css",
];

const pieceFiles = [
  "index.ts",
  "pieces/index.ts",
  "pieces/hello/index.ts",
  "pieces/goodbye/index.ts",
];

describe("planBuild", () => {
  it("B. piece-only: no browser build, node build, two pieces, no stylesheet", () => {
    const root = makeProject(pieceFiles);
    const plan = planBuild(root, "dist");

    expect(plan.browser).toEqual({
      run: false,
      reason: "no browser modules (pieces only)",
    });
    expect(plan.node).toEqual({ run: true });
    expect(plan.pieces).toEqual([
      {
        dir: "goodbye",
        entry: join("pieces", "goodbye", "index.ts"),
        outDir: join("dist", "node", "pieces", "goodbye"),
      },
      {
        dir: "hello",
        entry: join("pieces", "hello", "index.ts"),
        outDir: join("dist", "node", "pieces", "hello"),
      },
    ]);
    expect(plan.stylesheet).toEqual({ run: false, reason: "no style.css" });
    expect(plan.types).toEqual({ run: true });
  });

  it("A. classic: browser and stylesheet on, no pieces", () => {
    const root = makeProject(classicFiles);
    const plan = planBuild(root, "dist");

    expect(plan.browser).toEqual({ run: true });
    expect(plan.node).toEqual({ run: true });
    expect(plan.stylesheet).toEqual({ run: true });
    expect(plan.pieces).toEqual([]);
  });

  it("C. mixed: everything on", () => {
    const root = makeProject([...classicFiles, ...pieceFiles]);
    const plan = planBuild(root, "dist");

    expect(plan.browser).toEqual({ run: true });
    expect(plan.node).toEqual({ run: true });
    expect(plan.stylesheet).toEqual({ run: true });
    expect(plan.pieces.map((p) => p.dir)).toEqual(["goodbye", "hello"]);
  });

  it("index.ts alone keeps its browser build and skips the stylesheet", () => {
    const root = makeProject(["index.ts"]);
    const plan = planBuild(root, "dist");

    expect(plan.browser).toEqual({ run: true });
    expect(plan.node).toEqual({ run: true });
    expect(plan.stylesheet).toEqual({ run: false, reason: "no style.css" });
    expect(plan.pieces).toEqual([]);
  });

  it("a reactor entry beside pieces keeps the browser build", () => {
    const root = makeProject([...pieceFiles, "reactor/index.ts"]);
    const plan = planBuild(root, "dist");

    expect(plan.browser).toEqual({ run: true });
    expect(plan.pieces).toHaveLength(2);
  });

  it("nothing at all: every build skipped, with a reason each", () => {
    const root = makeProject([]);
    const plan = planBuild(root, "dist");

    expect(plan.browser).toEqual({ run: false, reason: "no browser modules" });
    expect(plan.node).toEqual({ run: false, reason: "no node modules" });
    expect(plan.pieces).toEqual([]);
  });

  // The plan still follows --out-dir, but a host reads a piece from
  // dist/node/pieces/<name>, so a package shipping pieces may not use one.
  it("records a custom outDir the piece build then refuses", () => {
    const root = makeProject(pieceFiles);
    const plan = planBuild(root, "build");

    expect(plan.pieces[0].outDir).toBe(
      join("build", "node", "pieces", "goodbye"),
    );
    expect(() => assertPiecesOutDir(plan)).toThrow(
      /a package that ships pieces builds to dist/,
    );
  });

  it("leaves a custom outDir alone for a package with no pieces", () => {
    const plan = planBuild(makeProject(classicFiles), "build");

    expect(plan.pieces).toEqual([]);
    expect(() => assertPiecesOutDir(plan)).not.toThrow();
  });
});
