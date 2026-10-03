import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BUILDER_TOOLS_VERSION,
  computeSourceDigest,
  distDirFingerprint,
  findBundleSpecifierOffenders,
  findDisallowedSpecifiers,
  prebuildReactorWorker,
  REACTOR_WORKER_ENTRY,
  resolveOwnPackageVersion,
  resolveWorkspacePackageDir,
  vendorRelativePath,
  workerSafeVendorImports,
} from "./reactor-worker-build.js";

// The subprocess resolves vite from the project root; apps/connect has it,
// same fixture the vendor prebuild tests use.
const ROOT = join(__dirname, "../../..");
const DIRNAME = join(ROOT, "apps/connect");

describe("vendorRelativePath", () => {
  it("maps a vendor import-map value onto the sibling vendor dir", () => {
    expect(vendorRelativePath("/__vendor__/_powerhousedao_reactor.js")).toBe(
      "../__vendor__/_powerhousedao_reactor.js",
    );
  });

  it("uses only the last path segment, whatever prefix the value carries", () => {
    expect(vendorRelativePath("/app/__vendor__/zod.js")).toBe(
      "../__vendor__/zod.js",
    );
  });
});

describe("findDisallowedSpecifiers", () => {
  it("flags bare and node: specifiers in every import position", () => {
    const code = [
      `import { a } from "@powerhousedao/reactor";`,
      `import kysely from 'kysely';`,
      `import "side-effect-pkg";`,
      `export { b } from "re-exported-pkg";`,
      `const m = await import("dynamic-pkg");`,
      `import { f } from "node:fs";`,
    ].join("\n");
    expect(findDisallowedSpecifiers(code)).toEqual([
      "@powerhousedao/reactor",
      "dynamic-pkg",
      "kysely",
      "node:fs",
      "re-exported-pkg",
      "side-effect-pkg",
    ]);
  });

  it("accepts relative, root-relative, and URL specifiers", () => {
    const code = [
      `import { a } from "./chunks/x-abc.js";`,
      `import { b } from "../__vendor__/zod.js";`,
      `import { c } from "/app/__vendor__/zod.js";`,
      `import { d } from "https://cdn.example/pkg.js";`,
      `const m = await import("./lazy.js");`,
    ].join("\n");
    expect(findDisallowedSpecifiers(code)).toEqual([]);
  });

  it("handles minified output with no spaces around the specifier", () => {
    const code = `import{a as b}from"bare-pkg";import"another";export*from"./ok.js";`;
    expect(findDisallowedSpecifiers(code)).toEqual(["another", "bare-pkg"]);
  });

  it("ignores specifier-like strings outside import positions", () => {
    const code = `const s = "kysely"; log("import from nowhere"); map.import("x")`;
    expect(findDisallowedSpecifiers(code)).toEqual([]);
  });
});

describe("workerSafeVendorImports", () => {
  let vendorDir: string;

  beforeAll(() => {
    vendorDir = mkdtempSync(join(tmpdir(), "ph-worker-vendor-test-"));
    mkdirSync(join(vendorDir, "chunks"), { recursive: true });
    // Clean entry: relative imports only.
    writeFileSync(
      join(vendorDir, "zod.js"),
      `export * from "./chunks/zod-impl.js";\n`,
    );
    writeFileSync(
      join(vendorDir, "chunks/zod-impl.js"),
      `export const z = 1;\n`,
    );
    // React-entangled entry: its shared chunk keeps the bare react import the
    // page's import map resolves and a worker cannot.
    writeFileSync(
      join(vendorDir, "rpc.js"),
      `export * from "./chunks/shared-ui.js";\n`,
    );
    writeFileSync(
      join(vendorDir, "chunks/shared-ui.js"),
      `import { useState } from "react";\nexport const hook = useState;\n`,
    );
  });

  afterAll(() => {
    rmSync(vendorDir, { recursive: true, force: true });
  });

  it("keeps clean entries and demotes react-entangled or missing ones", () => {
    expect(
      workerSafeVendorImports(vendorDir, {
        zod: "/__vendor__/zod.js",
        "@powerhousedao/reactor-browser/rpc": "/__vendor__/rpc.js",
        missing: "/__vendor__/missing.js",
      }),
    ).toEqual({ zod: "/__vendor__/zod.js" });
  });
});

describe("resolveOwnPackageVersion / BUILDER_TOOLS_VERSION", () => {
  it("resolves builder-tools' own installed version, not 'unknown'", () => {
    // Regression guard for the walk-up-from-this-file resolution: if it
    // breaks, the cache key silently stops varying with builder-tools
    // releases instead of throwing.
    expect(resolveOwnPackageVersion()).not.toBe("unknown");
    expect(BUILDER_TOOLS_VERSION).toBe(resolveOwnPackageVersion());
  });
});

describe("resolveWorkspacePackageDir", () => {
  it("resolves a real workspace package through node_modules", () => {
    const dir = resolveWorkspacePackageDir(DIRNAME, "@powerhousedao/reactor");
    expect(dir).not.toBeNull();
    expect(existsSync(join(dir!, "package.json"))).toBe(true);
  });

  it("returns null for a package that isn't installed there", () => {
    expect(
      resolveWorkspacePackageDir(DIRNAME, "@powerhousedao/does-not-exist"),
    ).toBeNull();
  });
});

describe("distDirFingerprint", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "ph-dist-fingerprint-test-"));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("changes when a file's content/mtime changes", () => {
    writeFileSync(join(dir, "index.js"), "export const a = 1;\n");
    const before = distDirFingerprint(dir);

    writeFileSync(join(dir, "index.js"), "export const a = 2;\n");
    utimesSync(
      join(dir, "index.js"),
      new Date(Date.now() + 5000),
      new Date(Date.now() + 5000),
    );
    const after = distDirFingerprint(dir);

    expect(after).not.toBe(before);
  });

  it("changes when a content-hashed chunk is added (name itself differs)", () => {
    const before = distDirFingerprint(dir);
    writeFileSync(join(dir, "chunk-newhash123.js"), "export const b = 1;\n");
    const after = distDirFingerprint(dir);
    expect(after).not.toBe(before);
  });

  it("is a stable non-crashing string for a missing directory", () => {
    expect(distDirFingerprint(join(dir, "does-not-exist"))).toBe("unreadable");
  });
});

describe("computeSourceDigest", () => {
  let fixtureDir: string;
  let entryPath: string;

  beforeAll(() => {
    fixtureDir = mkdtempSync(join(tmpdir(), "ph-source-digest-test-"));
    entryPath = join(fixtureDir, "entry.js");
    writeFileSync(entryPath, "self.onconnect = () => {};\n");
    mkdirSync(join(fixtureDir, "node_modules/@powerhousedao/reactor/dist"), {
      recursive: true,
    });
    writeFileSync(
      join(fixtureDir, "node_modules/@powerhousedao/reactor/dist/index.js"),
      "export const r = 1;\n",
    );
  });

  afterAll(() => {
    rmSync(fixtureDir, { recursive: true, force: true });
  });

  it("is deterministic for identical inputs", () => {
    expect(computeSourceDigest(fixtureDir, entryPath)).toBe(
      computeSourceDigest(fixtureDir, entryPath),
    );
  });

  it("changes when the injected builder-tools version changes", () => {
    const a = computeSourceDigest(fixtureDir, entryPath, undefined, "1.0.0");
    const b = computeSourceDigest(fixtureDir, entryPath, undefined, "2.0.0");
    expect(a).not.toBe(b);
  });

  it("changes when an upstream workspace package's dist changes", () => {
    const before = computeSourceDigest(fixtureDir, entryPath);
    writeFileSync(
      join(fixtureDir, "node_modules/@powerhousedao/reactor/dist/index.js"),
      "export const r = 2;\n",
    );
    utimesSync(
      join(fixtureDir, "node_modules/@powerhousedao/reactor/dist/index.js"),
      new Date(Date.now() + 5000),
      new Date(Date.now() + 5000),
    );
    const after = computeSourceDigest(fixtureDir, entryPath);
    expect(after).not.toBe(before);
  });

  it("does not crash when upstream packages aren't installed", () => {
    const bareDir = mkdtempSync(join(tmpdir(), "ph-source-digest-bare-"));
    try {
      expect(() => computeSourceDigest(bareDir, entryPath)).not.toThrow();
    } finally {
      rmSync(bareDir, { recursive: true, force: true });
    }
  });
});

describe("prebuildReactorWorker", () => {
  let fixtureDir: string;
  let outDir: string;
  let vendorDir: string;

  beforeAll(() => {
    fixtureDir = mkdtempSync(join(tmpdir(), "ph-reactor-worker-test-"));
    outDir = join(fixtureDir, "__reactor_worker__");
    vendorDir = join(fixtureDir, "__vendor__");
    mkdirSync(vendorDir);
    writeFileSync(join(vendorDir, "zod.js"), `export const z = () => "z";\n`);
    writeFileSync(join(vendorDir, "import-map.json"), `{"imports":{}}`);
  });

  afterAll(() => {
    rmSync(fixtureDir, { recursive: true, force: true });
  });

  it(
    "builds a worker bundle whose vendor imports point at the sibling vendor dir",
    { timeout: 120_000 },
    async () => {
      const entryPath = join(fixtureDir, "entry.js");
      const helperPath = join(fixtureDir, "helper.js");
      writeFileSync(helperPath, `export const local = "local";\n`);
      writeFileSync(
        entryPath,
        `import { z } from "zod";\n` +
          `import { local } from "./helper.js";\n` +
          `self.onconnect = () => {\n` +
          `  console.log(z.string().parse(local));\n` +
          `};\n`,
      );

      const errorRef: { message?: string } = {};
      const built = await prebuildReactorWorker({
        dirname: DIRNAME,
        outDir,
        entryPath,
        vendor: { imports: { zod: "/__vendor__/zod.js" }, dir: vendorDir },
        nodeEnv: "development",
        errorRef,
      });

      expect(errorRef.message).toBeUndefined();
      expect(built).not.toBeNull();
      expect(built?.sourceDigest).toBeTruthy();
      const emitted = join(outDir, REACTOR_WORKER_ENTRY);
      expect(existsSync(emitted)).toBe(true);
      const code = readFileSync(emitted, "utf8");
      expect(code).toContain("../__vendor__/zod.js");
      // The local helper was bundled, not referenced.
      expect(code).toContain("local");
      expect(findDisallowedSpecifiers(code)).toEqual([]);
    },
  );

  it(
    "reuses the cached bundle when nothing changed",
    { timeout: 120_000 },
    async () => {
      const emitted = join(outDir, REACTOR_WORKER_ENTRY);
      const before = statSync(emitted).mtimeMs;
      const built = await prebuildReactorWorker({
        dirname: DIRNAME,
        outDir,
        entryPath: join(fixtureDir, "entry.js"),
        vendor: { imports: { zod: "/__vendor__/zod.js" }, dir: vendorDir },
        nodeEnv: "development",
      });
      expect(built).not.toBeNull();
      expect(statSync(emitted).mtimeMs).toBe(before);
    },
  );

  it(
    "busts the cache when an upstream workspace package's dist changes, even though the entry file itself did not",
    { timeout: 120_000 },
    async () => {
      // An isolated project root (not DIRNAME/outDir above) so this test's
      // upstream mutation can't race the shared fixture's other tests.
      const projectDir = mkdtempSync(
        join(tmpdir(), "ph-reactor-worker-upstream-test-"),
      );
      const upstreamDistDir = join(
        projectDir,
        "node_modules/@powerhousedao/reactor/dist",
      );
      mkdirSync(upstreamDistDir, { recursive: true });
      writeFileSync(join(upstreamDistDir, "index.js"), "export const r = 1;\n");
      const entryPath = join(projectDir, "entry.js");
      writeFileSync(entryPath, "self.onconnect = () => {};\n");
      const outDir = join(projectDir, "__reactor_worker__");

      try {
        const first = await prebuildReactorWorker({
          dirname: projectDir,
          outDir,
          entryPath,
          nodeEnv: "development",
        });
        expect(first).not.toBeNull();
        const mtimeAfterFirstBuild = statSync(
          join(outDir, REACTOR_WORKER_ENTRY),
        ).mtimeMs;

        // Unchanged inputs: cache hit, no rebuild.
        const second = await prebuildReactorWorker({
          dirname: projectDir,
          outDir,
          entryPath,
          nodeEnv: "development",
        });
        expect(second?.sourceDigest).toBe(first?.sourceDigest);
        expect(statSync(join(outDir, REACTOR_WORKER_ENTRY)).mtimeMs).toBe(
          mtimeAfterFirstBuild,
        );

        // The upstream reactor dist changes; connect's own entry file does not.
        writeFileSync(
          join(upstreamDistDir, "index.js"),
          "export const r = 2;\n",
        );
        const future = new Date(Date.now() + 5000);
        utimesSync(join(upstreamDistDir, "index.js"), future, future);

        const third = await prebuildReactorWorker({
          dirname: projectDir,
          outDir,
          entryPath,
          nodeEnv: "development",
        });
        expect(third).not.toBeNull();
        expect(third?.sourceDigest).not.toBe(first?.sourceDigest);
        // A real rebuild happened (cache was busted), not just a different
        // reported digest.
        expect(statSync(join(outDir, REACTOR_WORKER_ENTRY)).mtimeMs).not.toBe(
          mtimeAfterFirstBuild,
        );
      } finally {
        rmSync(projectDir, { recursive: true, force: true });
      }
    },
  );

  it("names the file and specifier when a bundle keeps a bare import", () => {
    const badDir = join(fixtureDir, "bad-bundle");
    const chunksDir = join(badDir, "chunks");
    rmSync(badDir, { recursive: true, force: true });
    mkdirSync(chunksDir, { recursive: true });
    writeFileSync(
      join(badDir, "reactor.worker.js"),
      `import "./chunks/dep-abc.js";\n`,
    );
    writeFileSync(
      join(chunksDir, "dep-abc.js"),
      `import{Kysely}from"kysely";export const k = Kysely;\n`,
    );
    const offenders = findBundleSpecifierOffenders(badDir);
    expect(offenders).toEqual([
      { file: "chunks/dep-abc.js", specs: ["kysely"] },
    ]);
  });

  it("ignores emitted files the entry's import graph never reaches", () => {
    const dir = join(fixtureDir, "stray-assets");
    const assetsDir = join(dir, "assets");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(assetsDir, { recursive: true });
    writeFileSync(
      join(dir, "reactor.worker.js"),
      // A vendor external escapes the bundle dir and is not followed.
      `import { z } from "../__vendor__/zod.js";\nexport const ok = z;\n`,
    );
    // The bundled reactor's node worker-thread entries land here: full of
    // node-only imports, never imported by the worker graph.
    writeFileSync(
      join(assetsDir, "entry-abc123.js"),
      `import { parentPort } from "node:worker_threads";\nimport pg from "pg";\nexport const run = () => [parentPort, pg];\n`,
    );
    expect(findBundleSpecifierOffenders(dir)).toEqual([]);
  });

  it("reports the missing worker entry on an unknown project", async () => {
    const errorRef: { message?: string } = {};
    const built = await prebuildReactorWorker({
      dirname: fixtureDir,
      outDir: join(fixtureDir, "__reactor_worker_none__"),
      errorRef,
    });
    expect(built).toBeNull();
    expect(errorRef.message).toMatch(/reactor\.worker\.js/);
  });
});
