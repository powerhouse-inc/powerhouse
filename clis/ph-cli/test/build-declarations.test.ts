import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanUp,
  packageWith,
  writeShape,
  writeTsconfig,
  build,
  declarationFiles,
  shapeDeclaration,
} from "./helpers/declarations.js";
import type { Flow } from "./helpers/declarations.js";

afterEach(cleanUp);

describe.each<Flow>(["code-first", "schema-first"])(
  "a %s package with declarations outside the output directory",
  (flow) => {
    it("writes current declarations to the configured directory on a fresh build and on a rebuild", async () => {
      const root = packageWith(flow);
      writeTsconfig(root, {
        declaration: true,
        declarationMap: true,
        declarationDir: "./types",
      });

      const fresh = await build(root, flow);
      expect(fresh.exitCode, fresh.log).toBe(0);
      expect(
        readFileSync(join(root, "types", "src", "shape.d.ts"), "utf8").trim(),
      ).toBe(shapeDeclaration("string"));
      expect(
        JSON.parse(
          readFileSync(join(root, "types", "src", "shape.d.ts.map"), "utf8"),
        ),
      ).toMatchObject({ sources: ["../../src/shape.ts"] });
      expect(existsSync(join(root, "dist", "node", "index.mjs"))).toBe(true);
      expect(existsSync(join(root, "dist", "types"))).toBe(false);

      writeShape(root, "number");
      const rebuilt = await build(root, flow);
      expect(rebuilt.exitCode, rebuilt.log).toBe(0);
      expect(
        readFileSync(join(root, "types", "src", "shape.d.ts"), "utf8").trim(),
      ).toBe(shapeDeclaration("number"));
      expect(
        readFileSync(join(root, "types", "index.d.ts"), "utf8").trim(),
      ).toContain('export type { Shape } from "./src/shape.js";');
    }, 120_000);

    it("keeps the declaration of a deleted source, as tsc does", async () => {
      const root = packageWith(flow);
      writeTsconfig(root, { declaration: true, declarationDir: "./types" });
      writeFileSync(join(root, "src", "gone.ts"), "export type Gone = true;\n");
      expect((await build(root, flow)).exitCode).toBe(0);
      rmSync(join(root, "src", "gone.ts"));
      expect((await build(root, flow)).exitCode).toBe(0);
      expect(
        readFileSync(join(root, "types", "src", "gone.d.ts"), "utf8").trim(),
      ).toBe("export type Gone = true;");
      expect(
        readFileSync(join(root, "types", "src", "shape.d.ts"), "utf8"),
      ).toContain("a: string;");
    }, 120_000);
  },
);

describe("where declarations land, as on main", () => {
  it.each<{
    name: string;
    options: Record<string, unknown>;
    outDir?: string;
    expected: string[];
  }>([
    {
      name: "a declarationDir inside the output directory",
      options: { declaration: true, declarationDir: "./dist/types" },
      expected: [
        "dist/types/index.d.ts",
        "dist/types/src/helper.d.ts",
        "dist/types/src/shape.d.ts",
      ],
    },
    {
      name: "a declarationDir the --out-dir does not contain",
      options: { declaration: true, declarationDir: "./dist/types" },
      outDir: "build",
      expected: [
        "dist/types/index.d.ts",
        "dist/types/src/helper.d.ts",
        "dist/types/src/shape.d.ts",
      ],
    },
    {
      name: "no declarationDir and a compiler outDir",
      options: { declaration: true, outDir: "./dist" },
      expected: [
        "dist/index.d.ts",
        "dist/src/helper.d.ts",
        "dist/src/shape.d.ts",
      ],
    },
    {
      name: "no declarationDir and a compiler outDir the --out-dir does not contain",
      options: { declaration: true, outDir: "./dist" },
      outDir: "build",
      expected: [
        "dist/index.d.ts",
        "dist/src/helper.d.ts",
        "dist/src/shape.d.ts",
      ],
    },
    {
      name: "neither a declarationDir nor a compiler outDir",
      options: { declaration: true },
      expected: ["index.d.ts", "src/helper.d.ts", "src/shape.d.ts"],
    },
    {
      name: "declarations on and emit off",
      options: { declaration: true, emitDeclarationOnly: false, noEmit: true },
      expected: [],
    },
    {
      name: "declarations turned off",
      options: { declaration: false, emitDeclarationOnly: false, noEmit: true },
      expected: [],
    },
  ])(
    "$name",
    async ({ options, outDir, expected }) => {
      const root = packageWith("schema-first");
      writeTsconfig(root, options);
      const result = await build(root, "schema-first", outDir);
      expect(result.exitCode, result.log).toBe(0);
      expect(declarationFiles(root)).toEqual(expected);
    },
    120_000,
  );

  it("writes nothing for a declarationDir when nothing is emitted", async () => {
    const root = packageWith("schema-first");
    const outside = join(root, "..", `${relative(tmpdir(), root)}-types`);
    for (const declarationDir of ["./types", outside]) {
      writeTsconfig(root, {
        declaration: true,
        declarationDir,
        emitDeclarationOnly: false,
        noEmit: true,
      });
      const result = await build(root, "schema-first");
      expect(result.exitCode, result.log).toBe(0);
    }
    expect(declarationFiles(root)).toEqual([]);
    expect(existsSync(outside)).toBe(false);
  }, 120_000);

  it("builds a package that emits nothing from an output directory without a rootDir", async () => {
    const root = packageWith("schema-first");
    writeTsconfig(
      root,
      {
        rootDir: undefined,
        outDir: "./dist",
        declaration: true,
        emitDeclarationOnly: false,
        noEmit: true,
      },
      ["src/**/*.ts"],
    );
    const result = await build(root, "schema-first");
    expect(result.exitCode, result.log).toBe(0);
    expect(declarationFiles(root)).toEqual([]);
  }, 120_000);

  it("reports no declaration-only type error when declarations are off", async () => {
    const root = packageWith("schema-first");
    writeTsconfig(root, {
      declaration: false,
      emitDeclarationOnly: false,
      noEmit: true,
      strict: true,
    });
    writeFileSync(
      join(root, "src", "widget.ts"),
      "export const Widget = class {\n  private secret = 1;\n};\n",
    );
    const result = await build(root, "schema-first");
    expect(result.exitCode, result.log).toBe(0);
    expect(declarationFiles(root)).toEqual([]);
  }, 120_000);
});

describe("declaration options without declarations", () => {
  it.each([
    { declaration: false, declarationMap: true },
    { emitDeclarationOnly: true },
  ])(
    "fail the build with the error tsc reports for %o, as on main",
    async (options) => {
      const root = packageWith("schema-first");
      writeTsconfig(root, { emitDeclarationOnly: false, ...options });
      const result = await build(root, "schema-first");
      expect(result.exitCode).toBe(2);
      expect(result.log).toContain("error TS5069");
      expect(declarationFiles(root)).toEqual([]);
    },
    120_000,
  );
});

describe("declarations byte for byte as tsc writes them", () => {
  const snapshot = (root: string): Record<string, string> =>
    Object.fromEntries(
      declarationFiles(root).map((file) => [
        file,
        readFileSync(join(root, file), "utf8"),
      ]),
    );

  it.each<{
    name: string;
    options: Record<string, unknown>;
    include?: string[];
  }>([
    {
      name: "declarationDir outside the output",
      options: { declarationDir: "./types" },
    },
    {
      name: "declarationDir inside the output",
      options: { declarationDir: "./dist/types" },
    },
    {
      name: "a source root above the package",
      options: { rootDir: ".." },
    },
    {
      name: "a declarationDir with an inferred source root",
      options: { rootDir: undefined, declarationDir: "./types" },
    },
    {
      name: "an explicit source root",
      options: { rootDir: "src", declarationDir: "./types" },
      include: ["src/**/*.ts"],
    },
    { name: "compiler outDir", options: { outDir: "./lib" } },
    { name: "declarations beside the sources", options: {} },
    {
      name: "declarations beside an inferred source root",
      options: { rootDir: undefined },
      include: ["src/**/*.ts"],
    },
  ])(
    "$name",
    async ({ options, include }) => {
      const root = packageWith("schema-first");
      writeTsconfig(
        root,
        { declaration: true, declarationMap: true, ...options },
        include,
      );
      execFileSync(
        process.execPath,
        [join(root, "node_modules", "typescript", "bin", "tsc"), "-p", "."],
        { cwd: root },
      );
      const fromTsc = snapshot(root);
      for (const file of Object.keys(fromTsc)) rmSync(join(root, file));

      const result = await build(root, "schema-first");
      expect(result.exitCode, result.log).toBe(0);
      expect(Object.keys(fromTsc).length).toBeGreaterThan(1);
      expect(snapshot(root)).toEqual(fromTsc);
    },
    120_000,
  );
});
