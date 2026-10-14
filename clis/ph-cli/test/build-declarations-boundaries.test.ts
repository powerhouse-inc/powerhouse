import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { declarationSnapshot, plainCompile } from "./helpers/workspace.js";
import { runPrepack } from "../src/services/build.js";
import { createGenerationSteps } from "../src/services/definitions/build-steps.js";
import {
  caseInsensitive,
  cleanUp,
  itWithSymlinks,
  disposals,
  packageWith,
  writeTsconfig,
  build,
  declarationFiles,
  shapeDeclaration,
} from "./helpers/declarations.js";

afterEach(cleanUp);

describe("where a declaration may be written", () => {
  itWithSymlinks.each(["../generated", "generated"])(
    "writes declarations at the configured path under the output directory when it was a symlink to %s",
    async (link) => {
      const root = packageWith("schema-first");
      mkdirSync(join(root, "dist", "generated"), { recursive: true });
      mkdirSync(join(root, "generated"), { recursive: true });
      symlinkSync(link, join(root, "dist", "types"));
      writeTsconfig(root, {
        declaration: true,
        declarationDir: "./dist/types",
      });
      const result = await build(root, "schema-first");
      expect(result.exitCode, result.log).toBe(0);
      expect(
        readFileSync(
          join(root, "dist", "types", "src", "shape.d.ts"),
          "utf8",
        ).trim(),
      ).toBe(shapeDeclaration("string").split("\n//#")[0]);
    },
    120_000,
  );

  it.each([
    [
      "changed",
      (file: string) => writeFileSync(file, "export type Shape = never;\n"),
    ],
    ["deleted", (file: string) => rmSync(file)],
  ] as const)(
    "refuses a release check whose declarations were %s after it",
    async (_how, alter) => {
      const root = packageWith("code-first");
      writeTsconfig(root, { declaration: true, declarationDir: "./types" });
      expect((await build(root, "code-first")).exitCode).toBe(0);
      alter(join(root, "types", "src", "shape.d.ts"));

      const messages: string[] = [];
      await runPrepack(
        {
          configFile: join(root, "powerhouse.config.json"),
          outDir: "dist",
          source: [],
          warningsAsErrors: false,
          noSharedDeps: false,
          ignoreTypeErrors: false,
          debug: false,
        },
        { log: (text) => messages.push(text) },
      );
      expect(messages.join("")).toContain(
        "Running a release check: the compiler outputs changed since that check",
      );
      expect(
        readFileSync(join(root, "types", "src", "shape.d.ts"), "utf8"),
      ).toContain(_how === "changed" ? "Shape = never" : "a: string;");
    },
    120_000,
  );

  it("writes them through a symlinked package root", async () => {
    const root = packageWith("code-first");
    writeTsconfig(root, { declaration: true, declarationDir: "./types" });
    const temporary = mkdtempSync(join(tmpdir(), "ph-build-declarations-"));
    disposals.push(() => rmSync(temporary, { recursive: true, force: true }));
    const alias = join(temporary, "package");
    symlinkSync(root, alias, process.platform === "win32" ? "junction" : "dir");

    const linked = await build(alias, "code-first");
    expect(linked.exitCode, linked.log).toBe(0);
    expect(
      readFileSync(join(root, "types", "src", "shape.d.ts"), "utf8").trim(),
    ).toBe(shapeDeclaration("string").split("\n//#")[0]);
  }, 120_000);

  it("refuses a declaration directory outside the package and writes nothing there", async () => {
    const root = packageWith("code-first");
    const outside = join(root, "..", `${relative(tmpdir(), root)}-types`);
    writeTsconfig(root, { declaration: true, declarationDir: outside });

    const result = await build(root, "code-first");
    expect(result.exitCode).toBe(2);
    expect(result.log).toContain(
      `tsc would write to ${JSON.stringify(outside)} outside the package.`,
    );
    expect(existsSync(outside)).toBe(false);
  }, 120_000);

  itWithSymlinks(
    "fails a declaration directory that cannot be resolved before writing anything",
    async () => {
      const root = packageWith("code-first");
      writeTsconfig(root, { declaration: true, declarationDir: "./types" });
      mkdirSync(join(root, "types"));
      symlinkSync(join(root, "missing"), join(root, "types", "src"));

      const result = await build(root, "code-first");
      expect(result.exitCode).toBe(2);
      expect(result.log).toContain("ENOENT");
      expect(existsSync(join(root, "dist"))).toBe(false);
    },
    120_000,
  );

  itWithSymlinks(
    "refuses to promote when a declaration target moved outside the package during the build",
    async () => {
      const root = packageWith("code-first");
      writeTsconfig(root, { declaration: true, declarationDir: "./types" });
      const outside = mkdtempSync(
        join(tmpdir(), "ph-build-declarations-outside-"),
      );
      disposals.push(() => rmSync(outside, { recursive: true, force: true }));

      const steps = await createGenerationSteps();
      const result = await build(root, "code-first", "dist", {
        ...steps,
        emitCandidate: async (request) => {
          const emitted = await steps.emitCandidate(request);
          rmSync(join(root, "types"), { recursive: true });
          symlinkSync(outside, join(root, "types"));
          return emitted;
        },
      });
      expect(result.exitCode).toBe(2);
      expect(result.log).toContain("nothing was promoted");
      expect(readdirSync(outside)).toEqual([]);
      expect(existsSync(join(root, "dist"))).toBe(false);
    },
    120_000,
  );

  itWithSymlinks(
    "refuses to promote when the configured declaration symlink was repointed during the build",
    async () => {
      const root = packageWith("schema-first");
      mkdirSync(join(root, "generated", "types"), { recursive: true });
      mkdirSync(join(root, "generated", "other"), { recursive: true });
      symlinkSync(join(root, "generated", "types"), join(root, "types"));
      writeTsconfig(root, { declaration: true, declarationDir: "./types" });

      const steps = await createGenerationSteps();
      const result = await build(root, "schema-first", "dist", {
        ...steps,
        emitCandidate: async (request) => {
          const emitted = await steps.emitCandidate(request);
          rmSync(join(root, "types"));
          symlinkSync(join(root, "generated", "other"), join(root, "types"));
          return emitted;
        },
      });
      expect(result.exitCode).toBe(2);
      expect(result.log).toContain("nothing was promoted");
      expect(
        readFileSync(
          join(root, "generated", "types", "src", "shape.d.ts"),
          "utf8",
        ),
      ).toContain("a: string;");
      expect(existsSync(join(root, "dist"))).toBe(false);
    },
    120_000,
  );

  itWithSymlinks(
    "refuses a compiler directory under the output that resolves outside the package",
    async () => {
      const root = packageWith("schema-first");
      const outside = mkdtempSync(join(tmpdir(), "ph-build-declarations-out-"));
      disposals.push(() => rmSync(outside, { recursive: true, force: true }));
      mkdirSync(join(root, "dist"));
      symlinkSync(outside, join(root, "dist", "types"));
      writeTsconfig(root, {
        declaration: true,
        declarationDir: "./dist/types",
      });
      const result = await build(root, "schema-first");
      expect(result.exitCode).toBe(2);
      expect(result.log).toContain("outside the package");
      expect(readdirSync(outside)).toEqual([]);
    },
    120_000,
  );

  itWithSymlinks(
    "refuses a declaration directory the build clears through a symlinked .ph",
    async () => {
      const root = packageWith("schema-first");
      mkdirSync(join(root, "state"));
      symlinkSync("state", join(root, ".ph"));
      writeTsconfig(root, {
        declaration: true,
        declarationDir: "./state/build/types",
      });
      const result = await build(root, "schema-first");
      expect(result.exitCode).toBe(2);
      expect(result.log).toContain("which every build clears.");
    },
    120_000,
  );

  itWithSymlinks(
    "refuses an --out-dir the build clears through a symlinked .ph",
    async () => {
      const root = packageWith("schema-first");
      mkdirSync(join(root, "state"));
      symlinkSync("state", join(root, ".ph"));
      writeTsconfig(root, { declaration: true, declarationDir: "./types" });
      await expect(build(root, "schema-first", "state/build")).rejects.toThrow(
        "--out-dir must not overlap",
      );
    },
    120_000,
  );

  const sharedFile = (first: string): string => {
    const root = packageWith("schema-first");
    mkdirSync(join(root, "src", "a"), { recursive: true });
    mkdirSync(join(root, "src", "b"), { recursive: true });
    writeFileSync(join(root, "src", "a", first), "export type A = 1;\n");
    writeFileSync(join(root, "src", "b", "x.ts"), "export type B = 2;\n");
    mkdirSync(join(root, "types", "src"), { recursive: true });
    mkdirSync(join(root, "generated"));
    symlinkSync("../../generated", join(root, "types", "src", "a"));
    symlinkSync("../../generated", join(root, "types", "src", "b"));
    writeTsconfig(root, { declaration: true, declarationDir: "./types" });
    return root;
  };

  itWithSymlinks(
    "keeps the declaration main leaves when two outputs resolve to one file",
    async () => {
      const root = sharedFile("x.ts");
      const main = plainCompile(root);
      expect(main.status, main.output).toBe(0);
      const expected = declarationSnapshot(root);
      const result = await build(root, "schema-first");
      expect(result.exitCode, result.log).toBe(0);
      expect(declarationSnapshot(root)).toEqual(expected);
      expect(["export type A = 1;\n", "export type B = 2;\n"]).toContain(
        readFileSync(join(root, "generated", "x.d.ts"), "utf8"),
      );
    },
    120_000,
  );

  itWithSymlinks(
    "keeps the declaration main leaves when output aliases differ only in case",
    async ({ skip }) => {
      const root = sharedFile("X.ts");
      if (!caseInsensitive(root)) skip();
      const main = plainCompile(root);
      expect(main.status, main.output).toBe(0);
      const expected = declarationSnapshot(root);
      const result = await build(root, "schema-first");
      expect(result.exitCode, result.log).toBe(0);
      expect(declarationSnapshot(root)).toEqual(expected);
      expect(["export type A = 1;\n", "export type B = 2;\n"]).toContain(
        readFileSync(join(root, "generated", "x.d.ts"), "utf8"),
      );
    },
    120_000,
  );

  itWithSymlinks(
    "builds declarations that differ only in case on a case-sensitive file system",
    async ({ skip }) => {
      const root = sharedFile("X.ts");
      if (caseInsensitive(root)) skip();
      writeFileSync(join(root, "PACKAGE.JSON"), "{}\n");
      const result = await build(root, "schema-first");
      expect(result.exitCode, result.log).toBe(0);
      expect(readdirSync(join(root, "generated")).sort()).toEqual([
        "X.d.ts",
        "x.d.ts",
      ]);
    },
    120_000,
  );

  itWithSymlinks(
    "keeps the symlink the compiler declaration directory goes through",
    async () => {
      const root = packageWith("schema-first");
      mkdirSync(join(root, "dist"));
      mkdirSync(join(root, "generated"));
      symlinkSync("../generated", join(root, "dist", "types"));
      symlinkSync("dist/types", join(root, "types"));
      writeTsconfig(root, { declaration: true, declarationDir: "./types" });
      const result = await build(root, "schema-first");
      expect(result.exitCode, result.log).toBe(0);
      expect(
        readFileSync(join(root, "types", "src", "shape.d.ts"), "utf8"),
      ).toContain("a: string;");
      expect(
        readFileSync(join(root, "generated", "src", "shape.d.ts"), "utf8"),
      ).toContain("a: string;");
    },
    120_000,
  );

  it("writes declarations beside the sources when the shell is in a symlinked spelling of the package", async () => {
    const root = packageWith("schema-first");
    writeTsconfig(root, { declaration: true, rootDir: undefined });
    const temporary = mkdtempSync(join(tmpdir(), "ph-build-declarations-pwd-"));
    disposals.push(() => rmSync(temporary, { recursive: true, force: true }));
    const alias = join(temporary, "package");
    symlinkSync(root, alias, process.platform === "win32" ? "junction" : "dir");
    const pwd = process.env.PWD;
    process.env.PWD = alias;
    disposals.unshift(() => {
      process.env.PWD = pwd;
    });

    const result = await build(alias, "schema-first");
    expect(result.exitCode, result.log).toBe(0);
    expect(declarationFiles(root)).toEqual([
      "index.d.ts",
      "src/helper.d.ts",
      "src/shape.d.ts",
    ]);
    expect(existsSync(join(root, "src", "shape.js"))).toBe(false);
  }, 120_000);

  itWithSymlinks(
    "refuses to promote when a symlink into the output directory was repointed during the build",
    async () => {
      const root = packageWith("schema-first");
      mkdirSync(join(root, "dist", "types"), { recursive: true });
      mkdirSync(join(root, "generated"));
      symlinkSync("dist/types", join(root, "types"));
      writeTsconfig(root, { declaration: true, declarationDir: "./types" });

      const steps = await createGenerationSteps();
      const result = await build(root, "schema-first", "dist", {
        ...steps,
        emitCandidate: async (request) => {
          const emitted = await steps.emitCandidate(request);
          rmSync(join(root, "types"));
          symlinkSync("generated", join(root, "types"));
          return emitted;
        },
      });
      expect(result.exitCode).toBe(2);
      expect(result.log).toContain("nothing was promoted");
    },
    120_000,
  );

  itWithSymlinks(
    "matches main when a compiler directory symlink leads to an input",
    async () => {
      const root = packageWith("schema-first");
      const authored = "export interface Handwritten {\n  value: number;\n}\n";
      mkdirSync(join(root, "generated"));
      writeFileSync(join(root, "generated", "shape.d.ts"), authored);
      symlinkSync("generated", join(root, "types"));
      writeFileSync(
        join(root, "src", "shape.ts"),
        'import type { Handwritten } from "../generated/shape.js";\nexport type Shape = { a: Handwritten };\n',
      );
      writeFileSync(
        join(root, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            rootDir: "src",
            module: "nodenext",
            target: "esnext",
            declaration: true,
            declarationDir: "./types",
            emitDeclarationOnly: true,
            skipLibCheck: true,
          },
          files: ["src/shape.ts"],
        }),
      );
      const main = plainCompile(root);
      expect(main.status, main.output).toBe(0);
      const expected = readFileSync(
        join(root, "generated", "shape.d.ts"),
        "utf8",
      );
      writeFileSync(join(root, "generated", "shape.d.ts"), authored);
      rmSync(join(root, "tsconfig.tsbuildinfo"), { force: true });
      const result = await build(root, "schema-first");
      expect(result.exitCode, result.log).toBe(0);
      expect(readFileSync(join(root, "generated", "shape.d.ts"), "utf8")).toBe(
        expected,
      );
      expect(expected).toContain("a: Handwritten;");
    },
    120_000,
  );

  it.skipIf(process.platform === "win32")(
    "refuses to place declarations when tsc cannot list the program",
    async () => {
      const root = packageWith("schema-first");
      writeTsconfig(root, { declaration: true, declarationDir: "./types" });
      const bin = join(root, "node_modules", ".bin", "tsc");
      rmSync(bin);
      writeFileSync(
        bin,
        [
          "#!/usr/bin/env node",
          'const { spawnSync } = require("node:child_process");',
          'if (process.argv.includes("--listFilesOnly")) process.exit(1);',
          'const tsc = require("node:path").join(process.cwd(), "node_modules", "typescript", "bin", "tsc");',
          'const run = spawnSync(process.execPath, [tsc, ...process.argv.slice(2)], { stdio: "inherit" });',
          "process.exit(run.status ?? 1);",
          "",
        ].join("\n"),
      );
      chmodSync(bin, 0o755);

      const result = await build(root, "schema-first");
      expect(result.exitCode).toBe(2);
      expect(result.log).toContain(
        "--ignore-type-errors cannot bypass this preflight failure",
      );
      expect(existsSync(join(root, "types"))).toBe(false);
    },
    120_000,
  );

  itWithSymlinks.each([
    ["a fresh build", false],
    ["a rebuild over earlier declarations", true],
  ])(
    "keeps current declarations at both compiler and published paths with a symlinked output, on %s",
    async (_build, earlier) => {
      const root = packageWith("schema-first");
      mkdirSync(join(root, "lib", "types", "src"), { recursive: true });
      if (earlier) {
        for (const file of [
          "index.d.ts",
          "src/helper.d.ts",
          "src/shape.d.ts",
        ]) {
          writeFileSync(join(root, "lib", "types", file), "export {};\n");
        }
      }
      symlinkSync("lib", join(root, "dist"));
      writeTsconfig(root, { declaration: true, declarationDir: "./lib/types" });
      const result = await build(root, "schema-first");
      expect(result.exitCode, result.log).toBe(0);
      expect(
        readFileSync(join(root, "lib", "types", "src", "shape.d.ts"), "utf8"),
      ).toContain("a: string;");
      expect(
        readFileSync(join(root, "dist", "types", "src", "shape.d.ts"), "utf8"),
      ).toContain("a: string;");
    },
    120_000,
  );

  it("builds a solution tsconfig whose program lists no files", async () => {
    const root = packageWith("schema-first");
    mkdirSync(join(root, "lib"));
    writeFileSync(
      join(root, "lib", "x.ts"),
      "export type X = { a: string };\n",
    );
    writeFileSync(
      join(root, "lib", "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          composite: true,
          rootDir: ".",
          outDir: "./dist",
          module: "nodenext",
          target: "esnext",
          skipLibCheck: true,
        },
        include: ["x.ts"],
      }),
    );
    writeFileSync(
      join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { composite: true, declaration: true },
        files: [],
        references: [{ path: "./lib" }],
      }),
    );
    const result = await build(root, "schema-first");
    expect(result.exitCode, result.log).toBe(0);
    expect(existsSync(join(root, "lib", "dist", "x.d.ts"))).toBe(true);
  }, 120_000);

  it("refuses to overwrite a declaration the tsconfig lists as an input, as tsc does", async () => {
    const root = packageWith("schema-first");
    const authored = "interface Handwritten {\n  value: number;\n}\n";
    writeFileSync(join(root, "src", "shape.d.ts"), authored);
    writeFileSync(
      join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          rootDir: ".",
          module: "nodenext",
          target: "esnext",
          declaration: true,
          emitDeclarationOnly: true,
          skipLibCheck: true,
        },
        files: ["src/shape.ts", "src/shape.d.ts"],
      }),
    );
    const result = await build(root, "schema-first");
    expect(result.exitCode).toBe(2);
    expect(result.log).toContain("TS5055");
    expect(readFileSync(join(root, "src", "shape.d.ts"), "utf8")).toBe(
      authored,
    );
  }, 120_000);

  it("refuses to overwrite a declaration the program imports, as tsc does", async () => {
    const root = packageWith("schema-first");
    const authored = "export interface Handwritten {\n  value: number;\n}\n";
    mkdirSync(join(root, "types"));
    writeFileSync(join(root, "types", "shape.d.ts"), authored);
    writeFileSync(
      join(root, "src", "shape.ts"),
      'import type { Handwritten } from "../types/shape.js";\nexport type Shape = { a: Handwritten };\n',
    );
    writeFileSync(
      join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          rootDir: "src",
          module: "nodenext",
          target: "esnext",
          declaration: true,
          declarationDir: "./types",
          emitDeclarationOnly: true,
          skipLibCheck: true,
        },
        files: ["src/shape.ts"],
      }),
    );
    const result = await build(root, "schema-first");
    expect(result.exitCode).toBe(2);
    expect(result.log).toContain("TS5055");
    expect(readFileSync(join(root, "types", "shape.d.ts"), "utf8")).toBe(
      authored,
    );
  }, 120_000);

  itWithSymlinks(
    "refuses to overwrite an imported declaration reached through a symlink in the output directory",
    async () => {
      const root = packageWith("schema-first");
      const authored = "export interface Handwritten {\n  value: number;\n}\n";
      mkdirSync(join(root, "dist"));
      mkdirSync(join(root, "generated"));
      writeFileSync(join(root, "generated", "shape.d.ts"), authored);
      symlinkSync("../generated", join(root, "dist", "types"));
      writeFileSync(
        join(root, "src", "shape.ts"),
        'import type { Handwritten } from "../dist/types/shape.js";\nexport type Shape = { a: Handwritten };\n',
      );
      writeFileSync(
        join(root, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            rootDir: "src",
            module: "nodenext",
            target: "esnext",
            declaration: true,
            declarationDir: "./dist/types",
            emitDeclarationOnly: true,
            skipLibCheck: true,
          },
          files: ["src/shape.ts"],
        }),
      );
      const result = await build(root, "schema-first");
      expect(result.exitCode).toBe(2);
      expect(result.log).toContain("TS5055");
      expect(readFileSync(join(root, "generated", "shape.d.ts"), "utf8")).toBe(
        authored,
      );
    },
    120_000,
  );

  itWithSymlinks(
    "builds when the output directory's symlink leads to a declaration imported by its own path, as tsc does",
    async () => {
      const root = packageWith("schema-first");
      const authored = "export interface Handwritten {\n  value: number;\n}\n";
      mkdirSync(join(root, "dist"));
      mkdirSync(join(root, "generated"));
      writeFileSync(join(root, "generated", "shape.d.ts"), authored);
      symlinkSync("../generated", join(root, "dist", "types"));
      writeFileSync(
        join(root, "src", "shape.ts"),
        'import type { Handwritten } from "../generated/shape.js";\nexport type Shape = { a: Handwritten };\n',
      );
      writeFileSync(
        join(root, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            rootDir: "src",
            module: "nodenext",
            target: "esnext",
            declaration: true,
            declarationDir: "./dist/types",
            emitDeclarationOnly: true,
            skipLibCheck: true,
          },
          files: ["src/shape.ts"],
        }),
      );
      const main = plainCompile(root);
      expect(main.status, main.output).toBe(0);
      const expected = readFileSync(
        join(root, "generated", "shape.d.ts"),
        "utf8",
      );
      writeFileSync(join(root, "generated", "shape.d.ts"), authored);
      rmSync(join(root, "tsconfig.tsbuildinfo"), { force: true });
      const result = await build(root, "schema-first");
      expect(result.exitCode, result.log).toBe(0);
      expect(
        readFileSync(join(root, "dist", "types", "shape.d.ts"), "utf8"),
      ).toContain("a: Handwritten;");
      expect(readFileSync(join(root, "generated", "shape.d.ts"), "utf8")).toBe(
        expected,
      );
    },
    120_000,
  );

  it("refuses to overwrite a declaration imported in another case on a case-insensitive file system, as tsc does", async ({
    skip,
  }) => {
    const root = packageWith("schema-first");
    if (!caseInsensitive(root)) skip();
    const authored = "export interface Handwritten {\n  value: number;\n}\n";
    mkdirSync(join(root, "dist", "types"), { recursive: true });
    writeFileSync(join(root, "dist", "types", "shape.d.ts"), authored);
    writeFileSync(
      join(root, "src", "shape.ts"),
      'import type { Handwritten } from "../Dist/Types/shape.js";\nexport type Shape = { a: Handwritten };\n',
    );
    writeFileSync(
      join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          rootDir: "src",
          module: "nodenext",
          target: "esnext",
          declaration: true,
          declarationDir: "./dist/types",
          emitDeclarationOnly: true,
          forceConsistentCasingInFileNames: false,
          skipLibCheck: true,
        },
        files: ["src/shape.ts"],
      }),
    );
    const result = await build(root, "schema-first");
    expect(result.exitCode).toBe(2);
    expect(result.log).toContain("TS5055");
    expect(
      readFileSync(join(root, "dist", "types", "shape.d.ts"), "utf8"),
    ).toBe(authored);
  }, 120_000);

  it("matches main when a syntax error suppresses the input-overwrite diagnostic", async () => {
    const root = packageWith("schema-first");
    const authored = "export interface Handwritten {\n  value: number;\n}\n";
    mkdirSync(join(root, "types"));
    writeFileSync(join(root, "types", "shape.d.ts"), authored);
    writeFileSync(
      join(root, "src", "shape.ts"),
      'import type { Handwritten } from "../types/shape.js";\nexport type Shape = { a: Handwritten };\n',
    );
    writeFileSync(
      join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          rootDir: "src",
          module: "nodenext",
          target: "esnext",
          declaration: true,
          declarationDir: "./types",
          emitDeclarationOnly: true,
          skipLibCheck: true,
        },
        files: ["src/shape.ts"],
      }),
    );
    writeFileSync(join(root, "src", "broken.ts"), "export const broken = ;\n");
    const tsconfig = JSON.parse(
      readFileSync(join(root, "tsconfig.json"), "utf8"),
    ) as { files: string[] };
    writeFileSync(
      join(root, "tsconfig.json"),
      JSON.stringify({
        ...tsconfig,
        files: [...tsconfig.files, "src/broken.ts"],
      }),
    );
    const main = plainCompile(root);
    expect(main.status).toBe(1);
    expect(main.output).toContain("TS1109");
    const expected = readFileSync(join(root, "types", "shape.d.ts"), "utf8");
    writeFileSync(join(root, "types", "shape.d.ts"), authored);
    rmSync(join(root, "tsconfig.tsbuildinfo"), { force: true });
    const result = await build(root, "schema-first", "dist", undefined, true);
    expect(result.exitCode, result.log).toBe(0);
    expect(readFileSync(join(root, "types", "shape.d.ts"), "utf8")).toBe(
      expected,
    );
  }, 120_000);

  it("refuses a directory where a declaration file goes, before promoting anything", async () => {
    const root = packageWith("schema-first");
    mkdirSync(join(root, "types", "index.d.ts"), { recursive: true });
    writeTsconfig(root, { declaration: true, declarationDir: "./types" });
    const result = await build(root, "schema-first");
    expect(result.exitCode).toBe(2);
    expect(result.log).toContain("TS5033");
    expect(existsSync(join(root, "dist"))).toBe(false);
  }, 120_000);

  it("refuses a declaration directory a file is in the way of, before promoting anything", async () => {
    const root = packageWith("schema-first");
    writeFileSync(join(root, "types"), "not a directory\n");
    writeTsconfig(root, { declaration: true, declarationDir: "./types" });
    const result = await build(root, "schema-first");
    expect(result.exitCode).toBe(2);
    expect(result.log).toContain("ENOTDIR");
    expect(existsSync(join(root, "dist"))).toBe(false);
  }, 120_000);

  it("refuses a declaration directory the build clears", async () => {
    const root = packageWith("schema-first");
    writeTsconfig(root, {
      declaration: true,
      declarationDir: "./.ph/build/published",
    });
    const result = await build(root, "schema-first");
    expect(result.exitCode).toBe(2);
    expect(result.log).toContain(
      `tsc would write to ${JSON.stringify(join(root, ".ph", "build", "published"))} inside .ph/build, which every build clears.`,
    );
  }, 120_000);

  itWithSymlinks(
    "keeps tsc declaration maps at the configured path through a symlink in the package",
    async () => {
      const root = packageWith("schema-first");
      mkdirSync(join(root, "generated", "deep", "types"), { recursive: true });
      symlinkSync(
        join(root, "generated", "deep", "types"),
        join(root, "types"),
      );
      writeTsconfig(root, {
        declaration: true,
        declarationMap: true,
        declarationDir: "./types",
      });
      const result = await build(root, "schema-first");
      expect(result.exitCode, result.log).toBe(0);
      expect(
        JSON.parse(
          readFileSync(join(root, "types", "src", "shape.d.ts.map"), "utf8"),
        ),
      ).toMatchObject({ sources: ["../../src/shape.ts"] });
    },
    120_000,
  );
});
