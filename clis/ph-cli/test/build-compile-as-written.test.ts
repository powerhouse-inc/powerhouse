import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
  chmodSync,
  rmSync,
  renameSync,
} from "node:fs";
import { join, dirname, relative, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  build,
  cleanUp,
  declarationFiles,
  packageWith,
  writeShape,
  writeTsconfig,
  type Flow,
} from "./helpers/declarations.js";
import {
  plainCompile,
  addReference,
  recordTsc,
  siblingPackage,
  writeCmdShim,
} from "./helpers/workspace.js";
import { walkFiles } from "../src/services/definitions/file-walk.js";
import { createGenerationSteps } from "../src/services/definitions/build-steps.js";
import { canonicalPath } from "../src/services/definitions/paths.js";

import { importRuntime } from "./helpers/loader-cases.js";

afterEach(cleanUp);

it("rebuilds global declarations without an explicit exclude", async () => {
  const root = packageWith("schema-first");
  writeFileSync(join(root, "src", "widget.ts"), "class Widget {}\n");
  writeTsconfig(root, {
    declaration: true,
    declarationDir: "types",
    moduleDetection: "legacy",
  });
  expect([
    (await build(root, "schema-first")).exitCode,
    (await build(root, "schema-first")).exitCode,
  ]).toEqual([0, 0]);
}, 120_000);

it("resolves self-imports to current sources on fresh, valid and invalid builds", async () => {
  const root = packageWith("schema-first");
  const manifest = z
    .record(z.string(), z.unknown())
    .parse(JSON.parse(readFileSync(join(root, "package.json"), "utf8")));
  manifest.exports = {
    ".": { import: "./dist/node/index.mjs" },
    "./shape": { types: "./types/src/shape.d.ts" },
  };
  writeFileSync(join(root, "package.json"), JSON.stringify(manifest));
  writeTsconfig(root, { declaration: true, declarationDir: "types" });
  const consumer = join(root, "src", "consumer.ts");
  writeFileSync(
    consumer,
    'export const shape: import("ph-fixture-declarations/shape").Shape = { a: "ok" };\n',
  );
  expect((await build(root, "schema-first")).exitCode).toBe(0);
  writeShape(root, "number");
  writeFileSync(
    consumer,
    'export const shape: import("ph-fixture-declarations/shape").Shape = { a: 1 };\n',
  );
  expect((await build(root, "schema-first")).exitCode).toBe(0);
  writeFileSync(
    consumer,
    'export const shape: import("ph-fixture-declarations/shape").Shape = { a: "wrong" };\n',
  );
  const invalid = await build(root, "schema-first");
  expect(invalid.exitCode).toBe(2);
  expect(invalid.log).toContain("TS2322");
}, 120_000);

it("preserves the configured allowJs exclusion and rootDir", async () => {
  const rootDir = ".";

  const root = packageWith("schema-first");
  mkdirSync(join(root, "dist", "node"), { recursive: true });
  writeFileSync(
    join(root, "dist", "node", "index.mjs"),
    "export const stale = true;\n",
  );
  writeTsconfig(
    root,
    {
      rootDir,
      declaration: true,
      declarationDir: "types",
      outDir: "dist",
      allowJs: true,
      emitDeclarationOnly: true,
    },
    ["**/*"],
  );
  const result = await build(root, "schema-first");
  expect(result.exitCode, result.log).toBe(0);
  expect(
    declarationFiles(root).filter((file) => file.startsWith("types/dist/")),
  ).toEqual([]);
}, 120_000);

it("reports TS7's inferred source-root error as plain build mode does", async () => {
  const root = packageWith("schema-first");
  writeTsconfig(
    root,
    {
      rootDir: undefined,
      declaration: true,
      declarationDir: "types",
      allowJs: true,
    },
    ["src/**/*"],
  );
  const main = plainCompile(root);
  expect(main.status).toBe(2);
  expect(main.output).toContain("TS5011");
  const result = await build(root, "schema-first");
  expect(result.exitCode).toBe(2);
  expect(result.log).toContain("TS5011");
}, 120_000);

describe.each<Flow>(["code-first", "schema-first"])(
  "%s original option diagnostics",
  (flow) => {
    it.each([
      { code: "TS5053", options: { sourceMap: true, inlineSourceMap: true } },
      { code: "TS5051", options: { inlineSources: true } },
      { code: "TS5051", options: { sourceRoot: "sources" } },
      { code: "TS5069", options: { mapRoot: "maps" } },
      { code: "TS5096", options: { allowImportingTsExtensions: true } },
    ])(
      "reports $code and allows the type-error override",
      async ({ code, options }) => {
        const root = packageWith(flow);
        writeTsconfig(root, {
          declaration: true,
          declarationDir: "types",
          outDir: "lib",
          emitDeclarationOnly: false,
          ...options,
        });
        const main = plainCompile(root);
        expect(main.status).toBe(2);
        expect(main.output).toContain(code);
        const strict = await build(root, flow);
        expect(strict.exitCode).toBe(2);
        expect(strict.log).toContain(code);
        const allowed = await build(root, flow, "dist", undefined, true);
        expect(allowed.exitCode, allowed.log).toBe(0);
      },
      120_000,
    );

    it("keeps noEmit with overlapping JSX destinations", async () => {
      const root = packageWith(flow);
      writeFileSync(join(root, "index.tsx"), "export const unused = 1;\n");
      writeTsconfig(
        root,
        { noEmit: true, emitDeclarationOnly: false, jsx: "react" },
        ["index.ts", "index.tsx", "src/**/*.ts"],
      );
      expect(plainCompile(root).status).toBe(0);
      const result = await build(root, flow);
      expect(result.exitCode, result.log).toBe(0);
      expect(existsSync(join(root, "index.js"))).toBe(false);
    }, 120_000);

    it("reports the build-info collision in build mode", async () => {
      const root = packageWith(flow);
      mkdirSync(join(root, "lib"));
      writeFileSync(join(root, "lib", "index.ts"), "export const value = 1;\n");
      writeFileSync(
        join(root, "lib", "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            composite: true,
            rootDir: ".",
            outDir: "../generated",
            tsBuildInfoFile: "../shared.tsbuildinfo",
          },
          files: ["index.ts"],
        }),
      );
      writeTsconfig(root, {
        declaration: true,
        declarationDir: "types",
        incremental: true,
        tsBuildInfoFile: "shared.tsbuildinfo",
      });
      const config = z
        .record(z.string(), z.unknown())
        .parse(JSON.parse(readFileSync(join(root, "tsconfig.json"), "utf8")));
      config.references = [{ path: "./lib" }];
      writeFileSync(join(root, "tsconfig.json"), JSON.stringify(config));
      const main = plainCompile(root);
      expect(main.status).toBe(2);
      expect(main.output).toContain("TS6377");
      const strict = await build(root, flow);
      expect(strict.exitCode).toBe(2);
      expect(strict.log).toContain("TS6377");
      const allowed = await build(root, flow, "dist", undefined, true);
      expect(allowed.exitCode, allowed.log).toBe(0);
    }, 120_000);
  },
);

describe("compiler work bounds", () => {
  afterEach(cleanUp);

  it.each([0, 3])(
    "emits each reference once and bounds compiler invocations with %s references",
    async (count) => {
      const root = packageWith("code-first");
      writeTsconfig(root, { noEmit: true, emitDeclarationOnly: false });
      const refs = Array.from({ length: count }, (_, index) => `lib${index}`);
      for (const directory of refs)
        addReference(root, directory, { files: ["index.ts"] });
      const readCommands = recordTsc(root);
      const steps = await createGenerationSteps();
      let refEmits: string[] = [];

      const result = await build(root, "code-first", "dist", {
        ...steps,
        typecheck: async (request) => {
          const checked = await steps.typecheck(request);
          refEmits = walkFiles(request.emittedRoot).filter((path) => {
            if (!/\.[cm]?js\.map$/.test(path)) return false;
            const map = z
              .object({ sources: z.array(z.string()) })
              .parse(JSON.parse(readFileSync(path, "utf8")));
            return map.sources.some((source) =>
              refs.some(
                (directory) =>
                  canonicalPath(resolve(dirname(path), source)) ===
                  canonicalPath(join(root, directory, "index.ts")),
              ),
            );
          });
          return checked;
        },
      });

      const commands = readCommands();
      expect(result.exitCode, result.log).toBe(0);
      expect(refEmits.length).toBe(count);
      // One listing per loader program covers sources its context imports.
      expect(commands.length).toBeLessThanOrEqual(count === 0 ? 9 : 39);
      expect(
        commands.filter((args) => args.includes("--showConfig")).length,
      ).toBeLessThanOrEqual(count === 0 ? 2 : 11);
    },
    120_000,
  );
});

describe("compiler diagnostics", () => {
  afterEach(cleanUp);

  it("reports a compiler failure written only to stderr", async () => {
    const root = packageWith("code-first");
    writeTsconfig(root, { noEmit: true, emitDeclarationOnly: false });
    const bin = join(root, "node_modules/.bin/tsc");
    rmSync(bin);
    writeFileSync(
      bin,
      '#!/usr/bin/env node\nif (process.argv.includes("--version")) { console.log("Version 7.0.2"); } else { process.stderr.write("compiler stderr diagnostic\\n"); process.exit(1); }\n',
    );
    chmodSync(bin, 0o755);
    writeCmdShim(bin);
    const result = await build(root, "code-first");
    expect(result.exitCode).toBe(2);
    expect(result.log).toContain("compiler stderr diagnostic");
  }, 120_000);
});

describe("compiler graph behavior", () => {
  afterEach(cleanUp);

  it.each([
    { count: 0, listings: 2 },
    { count: 1, listings: 5 },
    { count: 3, listings: 11 },
  ])(
    "refreshes every writing compile graph with $count references",
    async ({ count, listings }) => {
      const root = packageWith("schema-first");
      writeTsconfig(root, { declaration: true, declarationDir: "types" });
      for (let index = 0; index < count; index++)
        addReference(root, `lib${index}`, {
          compilerOptions: {
            rootDir: undefined,
            outDir: `../generated${index}`,
          },
        });
      const commands = recordTsc(root);
      const result = await build(root, "schema-first");
      expect(result.exitCode, result.log).toBe(0);
      const calls = commands();
      expect(calls.filter((args) => args.includes("--version"))).toHaveLength(
        1,
      );
      expect(
        calls.filter((args) => args.includes("--showConfig")),
      ).toHaveLength(listings);
      expect(
        calls.filter(
          (args) =>
            args.includes("--listFilesOnly") || args.includes("--explainFiles"),
        ),
      ).toHaveLength(listings);
    },
    120_000,
  );
});

describe("compiler graph behavior", () => {
  afterEach(cleanUp);

  // Its outputs are not retained, so an external reference is read for the
  // plan and once more after the last build, however its builds write.
  it("reads a chain of external references twice", async () => {
    const { root } = siblingPackage("schema-first");
    writeTsconfig(root, { declaration: true, declarationDir: "types" });
    for (let index = 0; index < 3; index++)
      addReference(root, `../lib${index}`, {
        compilerOptions: { rootDir: undefined, outDir: undefined },
        files: ["index.ts"],
      });
    const parse = (file: string) =>
      z.looseObject({}).parse(JSON.parse(readFileSync(file, "utf8")));
    for (let index = 1; index < 3; index++) {
      const config = join(root, `../lib${index}/tsconfig.json`);
      writeFileSync(
        config,
        JSON.stringify({
          ...parse(config),
          references: [{ path: `../lib${index - 1}` }],
        }),
      );
    }
    const config = join(root, "tsconfig.json");
    writeFileSync(
      config,
      JSON.stringify({ ...parse(config), references: [{ path: "../lib2" }] }),
    );
    const commands = recordTsc(root);
    const result = await build(root, "schema-first");
    expect(result.exitCode, result.log).toBe(0);
    const reads = commands()
      .filter((args) => args.includes("--showConfig"))
      .map((args) =>
        // Both resolved: Windows may spell the temp folder in its 8.3 form.
        relative(
          realpathSync.native(dirname(root)),
          realpathSync.native(args[args.indexOf("-p") + 1]),
        ),
      );
    expect(reads.sort()).toEqual(
      [
        join("lib0", "tsconfig.json"),
        join("lib1", "tsconfig.json"),
        join("lib2", "tsconfig.json"),
        join("package", "tsconfig.json"),
      ].flatMap((file) => [file, file]),
    );
    expect(existsSync(join(root, "../lib0/index.js"))).toBe(true);
    // Nothing had build info yet, so --force would only rebuild each
    // reference's dependencies again.
    expect(commands().filter((args) => args.includes("--force"))).toEqual([]);
  }, 120_000);

  it("honours ignore-type-errors for a failing reference build", async () => {
    const root = packageWith("code-first");
    writeTsconfig(root, { declaration: true, declarationDir: "types" });
    addReference(root, "lib", {
      compilerOptions: { outDir: "../dist/lib" },
      files: ["index.ts"],
      source: "export const value: string = 42;\n",
    });
    importRuntime(root, "../lib/index.js");
    const result = await build(root, "code-first", "dist", undefined, true);
    expect(
      result.exitCode,
      result.log + JSON.stringify(result.report?.diagnostics),
    ).toBe(0);
  }, 120_000);
});

describe("compiler graph behavior", () => {
  afterEach(cleanUp);

  it("classifies default-include program roots without an include property", async () => {
    const root = packageWith("schema-first");
    writeFileSync(
      join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          rootDir: ".",
          module: "nodenext",
          target: "esnext",
          noEmit: true,
          skipLibCheck: true,
        },
      }),
    );
    const steps = await createGenerationSteps();
    const result = await build(root, "schema-first", "dist", {
      ...steps,
      preflight: async (...request) => {
        const checked = await steps.preflight(...request);
        assert(checked.ok);
        expect(
          checked.plan.projects[0].rootFiles
            .filter((file) => file === join(root, "index.ts"))
            .map(() => "index.ts"),
        ).toEqual(["index.ts"]);
        return checked;
      },
    });
    expect(result.exitCode, result.log).toBe(0);
  }, 120_000);

  it("reports TS6202 for a reference cycle without overflowing dependent traversal", async () => {
    const root = packageWith("schema-first");
    writeTsconfig(root, { declaration: true, declarationDir: "types" });
    for (const directory of ["a", "b", "c"]) {
      mkdirSync(join(root, directory));
      writeFileSync(
        join(root, directory, "index.ts"),
        "export const ready = true;\n",
      );
      writeFileSync(
        join(root, directory, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { composite: true },
          files: ["index.ts"],
          ...(directory !== "a" && {
            references: [{ path: directory === "b" ? "../c" : "../b" }],
          }),
        }),
      );
    }
    const config = join(root, "tsconfig.json");
    const value = z
      .record(z.string(), z.unknown())
      .parse(JSON.parse(readFileSync(config, "utf8")));
    value.references = [{ path: "./a" }, { path: "./b" }];
    writeFileSync(config, JSON.stringify(value));
    const result = await build(root, "schema-first");
    expect(result.exitCode).toBe(2);
    expect(result.log).toContain("TS6202");
    expect(result.log).not.toContain("Maximum call stack");
  }, 120_000);

  it("keeps preflight resolution tracing off for a package with a non-ASCII path", async () => {
    const fixture = siblingPackage("schema-first");
    const root = join(dirname(fixture.root), "café-🧪");
    renameSync(fixture.root, root);
    writeTsconfig(root, { noEmit: true, emitDeclarationOnly: false });
    const readCommands = recordTsc(root);
    const result = await build(root, "schema-first");
    expect(result.exitCode, result.log).toBe(0);
    const commands = readCommands();
    expect(
      commands.filter((args) => args.includes("--traceResolution")),
    ).toEqual([]);
  }, 120_000);
});

describe("compiler graph behavior", () => {
  afterEach(cleanUp);

  it("rebuilds a beside-source reference whose declarations are also root inputs", async () => {
    const root = packageWith("code-first");
    writeTsconfig(root, { declaration: true, declarationDir: "types" });
    addReference(root, "lib", {
      compilerOptions: { outDir: undefined },
      files: ["index.ts"],
      source: "export const value: number = 42;\n",
    });
    writeFileSync(join(root, "lib", "index.ts"), "export const value = 42;\n");
    writeFileSync(
      join(root, "index.ts"),
      readFileSync(join(root, "index.ts"), "utf8") +
        'export { value } from "./lib/index.js";\n',
    );
    const first = await build(root, "code-first");
    expect(first.exitCode, first.log).toBe(0);
    writeFileSync(join(root, "lib", "index.ts"), "export const value = 43;\n");
    const second = await build(root, "code-first");
    expect(second.exitCode, second.log).toBe(0);
    expect(readFileSync(join(root, "lib", "index.js"), "utf8")).toBe(
      "export const value = 43;\n",
    );
  }, 120_000);
});
