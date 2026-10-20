import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  readdirSync,
  symlinkSync,
  chmodSync,
  renameSync,
} from "node:fs";
import { join, relative, dirname, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createGenerationSteps } from "../src/services/definitions/build-steps.js";
import {
  build,
  cleanUp,
  packageWith,
  writeTsconfig,
  type Flow,
  itWithSymlinks,
} from "./helpers/declarations.js";
import {
  declarationSnapshot,
  plainCompile,
  siblingPackage,
  addReference,
} from "./helpers/workspace.js";
import {
  importRuntime,
  monorepoLoader,
  loaderCases,
  loaderPackage,
  workspaceCases,
  workspaceRuntime,
  typedRuntimeAlias,
} from "./helpers/loader-cases.js";
import { createRequire } from "node:module";

import { walkFiles } from "../src/services/definitions/file-walk.js";
import { BuildGraphTypeScriptSourceImportAdapter } from "../src/services/definitions/import-adapters.js";
import { canonicalPath } from "../src/services/definitions/paths.js";

afterEach(cleanUp);

describe.each<Flow>(["code-first", "schema-first"])(
  "%s publisher source maps",
  (flow) => {
    it.each([
      "relative mapRoot",
      "absolute mapRoot",
      "sourceRoot",
      "src rootDir",
    ])(
      "keeps %s declarations byte for byte as tsc --build writes them",
      async (layout) => {
        const root = packageWith(flow);
        const options = {
          declaration: true,
          declarationMap: true,
          declarationDir: "types",
          sourceMap: true,
          mapRoot:
            layout === "absolute mapRoot" ? join(root, "maps") : "./maps",
          ...(layout === "sourceRoot" && { sourceRoot: "./sources/" }),
          ...(layout === "src rootDir" && { rootDir: "src" }),
        };
        writeTsconfig(
          root,
          options,
          layout === "src rootDir" ? ["src/**/*.ts"] : undefined,
        );
        const main = plainCompile(root);
        expect(main.status, main.output).toBe(0);
        const expected = declarationSnapshot(root);
        rmSync(join(root, "types"), { recursive: true });
        rmSync(join(root, "tsconfig.tsbuildinfo"));
        const result = await build(root, flow);
        expect(result.exitCode, result.log).toBe(0);
        expect(declarationSnapshot(root)).toEqual(expected);
        expect(
          readFileSync(
            join(
              root,
              "types",
              layout === "src rootDir" ? "shape.d.ts" : "src/shape.d.ts",
            ),
            "utf8",
          ),
        ).toContain(
          layout === "src rootDir"
            ? "sourceMappingURL=../src/maps/shape.d.ts.map"
            : layout === "absolute mapRoot"
              ? `sourceMappingURL=${join(root, "maps", "src", "shape.d.ts.map")}`
              : "sourceMappingURL=../../maps/src/shape.d.ts.map",
        );
      },
      120_000,
    );
  },
);

it("loads a definition importing a referenced project's runtime module", async () => {
  const root = packageWith("code-first");
  mkdirSync(join(root, "lib"));
  writeFileSync(join(root, "lib", "index.ts"), "export const value = 42;\n");
  writeFileSync(
    join(root, "lib", "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        composite: true,
        rootDir: ".",
        outDir: "../dist/lib",
        module: "nodenext",
        target: "esnext",
      },
      files: ["index.ts"],
    }),
  );
  writeTsconfig(root, { declaration: true, declarationDir: "types" });
  const config = z
    .record(z.string(), z.unknown())
    .parse(JSON.parse(readFileSync(join(root, "tsconfig.json"), "utf8")));
  config.references = [{ path: "./lib" }];
  writeFileSync(join(root, "tsconfig.json"), JSON.stringify(config));
  importRuntime(root, "../lib/index.js");
  const result = await build(root, "code-first");
  expect(result.exitCode, result.log).toBe(0);
  expect(existsSync(join(root, "dist", "lib", "index.js"))).toBe(true);
}, 120_000);

it("neutralizes inherited compiler output options in the private loader config", async () => {
  const root = packageWith("code-first");
  mkdirSync(join(root, "config"));
  mkdirSync(join(root, "custom-types"));
  writeFileSync(
    join(root, "custom-types", "index.d.ts"),
    "declare const customValue: number;\n",
  );
  writeFileSync(join(root, "src", "runtime.ts"), "export const value = 42;\n");
  writeFileSync(
    join(root, "config", "base.json"),
    JSON.stringify({
      compilerOptions: {
        module: "nodenext",
        target: "esnext",
        rootDir: "..",
        paths: { "#runtime": ["../src/runtime.ts"] },
        rootDirs: ["../src"],
        typeRoots: ["../custom-types"],
        types: ["../custom-types/index.d.ts"],
        noEmit: true,
        skipLibCheck: true,
      },
    }),
  );
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({
      extends: "./config/base.json",
      include: ["index.ts", "src/**/*.ts"],
    }),
  );
  const manifest = z
    .record(z.string(), z.unknown())
    .parse(JSON.parse(readFileSync(join(root, "package.json"), "utf8")));
  manifest.imports = { "#runtime": "./src/runtime.ts" };
  writeFileSync(join(root, "package.json"), JSON.stringify(manifest));
  importRuntime(root, "#runtime");
  const main = plainCompile(root);
  expect(main.status, main.output).toBe(0);
  const steps = await createGenerationSteps();
  const result = await build(root, "code-first", "dist", {
    ...steps,
    typecheck: async (request) => {
      const checked = await steps.typecheck(request);
      const inherited = z
        .object({
          extends: z.string(),
          compilerOptions: z.record(z.string(), z.unknown()),
        })
        .parse(
          JSON.parse(
            readFileSync(
              join(request.emittedRoot, "..", "loader-0.tsconfig.json"),
              "utf8",
            ),
          ),
        );
      expect(inherited.extends).toBe(join(root, "tsconfig.json"));
      expect(inherited.compilerOptions.declarationDir).toBe(null);
      expect(inherited.compilerOptions.mapRoot).toBe(null);
      expect(inherited.compilerOptions.sourceRoot).toBe(null);
      expect(inherited.compilerOptions.tsBuildInfoFile).toBe(null);
      return checked;
    },
  });
  expect(result.exitCode, result.log).toBe(0);
}, 120_000);

describe("module scope and resolution", () => {
  afterEach(cleanUp);

  it("refreshes a CommonJS reference and its private relative imports in one process", async () => {
    const root = packageWith("code-first");
    writeTsconfig(root, { noEmit: true, emitDeclarationOnly: false });
    const lib = join(root, "lib");
    addReference(root, lib);
    writeFileSync(join(lib, "package.json"), '{"type":"commonjs"}\n');
    writeFileSync(
      join(lib, "index.ts"),
      'export { value } from "./helper.js";\n',
    );
    const helper = join(lib, "helper.ts");
    writeFileSync(helper, "export const value = 42;\n");
    importRuntime(root, "../lib/index.js");
    const compiled = plainCompile(root);
    expect(compiled.status, compiled.output).toBe(0);
    const require = createRequire(join(lib, "package.json"));
    const previous: unknown = require("./out/index.js");
    const initial = await build(root, "code-first");
    expect(
      initial.exitCode,
      initial.log + JSON.stringify(initial.report?.diagnostics),
    ).toBe(0);
    writeFileSync(helper, "export const value = 7;\n");
    const invoice = join(root, "src", "invoice.ts");
    writeFileSync(
      invoice,
      readFileSync(invoice, "utf8").replace("value !== 42", "value !== 7"),
    );
    const changed = await build(root, "code-first");
    expect(
      changed.exitCode,
      changed.log + JSON.stringify(changed.report?.diagnostics),
    ).toBe(0);
    expect(require("./out/index.js")).toBe(previous);
  }, 120_000);

  it("loads an ESM reference under its real monorepo package scope", async () => {
    const { root } = monorepoLoader();
    const result = await build(root, "code-first");
    expect(
      result.exitCode,
      result.log + JSON.stringify(result.report?.diagnostics),
    ).toBe(0);
  }, 120_000);

  it.each([false, true])(
    "loads a reference's own node_modules dependency (root duplicate: %s)",
    async (duplicate) => {
      const root = packageWith("code-first");
      writeTsconfig(root, { noEmit: true, emitDeclarationOnly: false });
      const lib = join(root, "lib");
      addReference(root, lib);
      const dep = (directory: string, value: number) => {
        const target = join(directory, "node_modules", "dep");
        mkdirSync(target, { recursive: true });
        writeFileSync(
          join(target, "package.json"),
          '{"name":"dep","type":"module","main":"index.js","types":"index.d.ts"}',
        );
        writeFileSync(
          join(target, "index.js"),
          `export const value = ${value};\n`,
        );
        writeFileSync(
          join(target, "index.d.ts"),
          "export const value: number;\n",
        );
      };
      dep(lib, 42);
      if (duplicate) dep(root, 7);
      writeFileSync(join(lib, "index.ts"), 'export { value } from "dep";\n');
      importRuntime(root, "../lib/index.js");
      const result = await build(root, "code-first");
      expect(
        result.exitCode,
        result.log + JSON.stringify(result.report?.diagnostics),
      ).toBe(0);
    },
    120_000,
  );

  it("resolves configDir paths before loader const-enum elision", async () => {
    const root = packageWith("code-first");
    mkdirSync(join(root, "config"));
    writeFileSync(
      join(root, "config", "base.json"),
      JSON.stringify({
        compilerOptions: {
          paths: { "#runtime": ["${configDir}/src/runtime.ts"] },
        },
      }),
    );
    writeTsconfig(root, { noEmit: true, emitDeclarationOnly: false });
    const config = join(root, "tsconfig.json");
    writeFileSync(
      config,
      readFileSync(config, "utf8").replace(
        '{"compilerOptions"',
        '{"extends":"./config/base.json","compilerOptions"',
      ),
    );
    writeFileSync(
      join(root, "src", "runtime.ts"),
      "export const enum Values { Ready = 42 }\n",
    );
    const invoice = join(root, "src", "invoice.ts");
    writeFileSync(
      invoice,
      'import { Values } from "#runtime";\nif (Values.Ready !== 42) throw new Error("wrong enum");\n' +
        readFileSync(invoice, "utf8"),
    );
    const result = await build(root, "code-first");
    expect(
      result.exitCode,
      result.log + JSON.stringify(result.report?.diagnostics),
    ).toBe(0);
  }, 120_000);

  itWithSymlinks(
    "confines loader emission when include uses a sibling symlink spelling",
    async () => {
      const { root, shared } = siblingPackage("code-first");
      symlinkSync(shared, join(root, "linked"));
      writeTsconfig(
        root,
        { noEmit: true, emitDeclarationOnly: false, rootDir: undefined },
        ["index.ts", "src/**/*.ts", "linked/*.ts"],
      );
      importRuntime(root, "../linked/x.js");
      const result = await build(root, "code-first");
      expect(
        result.exitCode,
        result.log + JSON.stringify(result.report?.diagnostics),
      ).toBe(0);
      expect(readdirSync(shared)).toEqual(["x.ts"]);
    },
    120_000,
  );

  it("refreshes changed definition modules across builds in one process", async () => {
    const root = packageWith("code-first");
    writeTsconfig(root, { noEmit: true, emitDeclarationOnly: false });
    expect((await build(root, "code-first")).exitCode).toBe(0);
    const source = join(root, "src", "invoice.ts");
    writeFileSync(
      source,
      readFileSync(source, "utf8").replaceAll(
        '"test/invoice"',
        '"test/invoice-next"',
      ),
    );
    const result = await build(root, "code-first");
    expect(
      result.exitCode,
      result.log + JSON.stringify(result.report?.diagnostics),
    ).toBe(0);
    expect(
      result.report?.definitions.map((definition) => definition.key),
    ).toEqual(["test/invoice-next", "test/invoice-next"]);
  }, 120_000);
});

describe("runtime formats and imports", () => {
  afterEach(cleanUp);

  it.each(loaderCases)(
    "loads %s through real Node",
    async (kind) => {
      const result = await build(loaderPackage(kind), "code-first");
      expect(
        result.exitCode,
        result.log + JSON.stringify(result.report?.diagnostics),
      ).toBe(0);
      expect(result.report?.status).toBe("ok");
    },
    120_000,
  );
});

describe("workspace runtime sources", () => {
  afterEach(cleanUp);

  itWithSymlinks.each(workspaceCases)(
    "loads workspace %s through real Node without writing to the dependency",
    async (kind) => {
      const { root, shared } = workspaceRuntime(kind);
      const before = Object.fromEntries(
        readdirSync(shared).map((file) => [
          file,
          readFileSync(join(shared, file), "utf8"),
        ]),
      );
      const compiled = plainCompile(root);
      expect(compiled.status, compiled.output).toBe(0);
      const result = await build(root, "code-first");
      expect(
        result.exitCode,
        result.log + JSON.stringify(result.report?.diagnostics),
      ).toBe(0);
      expect(result.report?.status).toBe("ok");
      expect(
        Object.fromEntries(
          readdirSync(shared).map((file) => [
            file,
            readFileSync(join(shared, file), "utf8"),
          ]),
        ),
      ).toEqual(before);
    },
    120_000,
  );

  itWithSymlinks(
    "keeps package-resolved TypeScript out of the compiler output overlay",
    async () => {
      const { root } = workspaceRuntime("enum");
      writeTsconfig(root, {
        noEmit: true,
        emitDeclarationOnly: false,
        outDir: "out",
      });
      const dependency = join(root, "node_modules/@review/shared");
      const manifest = readFileSync(join(dependency, "package.json"), "utf8");
      const source = readFileSync(join(dependency, "index.ts"), "utf8");
      rmSync(dependency);
      mkdirSync(dependency);
      writeFileSync(join(dependency, "package.json"), manifest);
      writeFileSync(join(dependency, "index.ts"), source);
      const output = join(root, "out/node_modules/@review/shared");
      mkdirSync(output, { recursive: true });
      writeFileSync(join(output, "index.js"), "export const value = 7;\n");
      writeFileSync(
        join(output, "index.d.ts"),
        "export declare const value: number;\n",
      );
      const invoice = join(root, "src/invoice.ts");
      writeFileSync(
        invoice,
        'import { value as disk } from "../out/node_modules/@review/shared/index.js";\nif (disk !== 7) throw new Error("wrong disk runtime");\n' +
          readFileSync(invoice, "utf8"),
      );
      const result = await build(root, "code-first");
      expect(
        result.exitCode,
        result.log + JSON.stringify(result.report?.diagnostics),
      ).toBe(0);
      expect(result.report?.status).toBe("ok");
    },
    120_000,
  );
});

describe("typed JavaScript aliases", () => {
  afterEach(cleanUp);

  it("loads a paths alias to JavaScript typed by an adjacent declaration", async () => {
    const result = await build(typedRuntimeAlias(), "code-first");
    expect(
      result.exitCode,
      result.log + JSON.stringify(result.report?.diagnostics),
    ).toBe(0);
    expect(result.report?.status).toBe("ok");
  }, 120_000);
});

describe("runtime loading", () => {
  afterEach(cleanUp);

  function snapshot(root: string): Record<string, string> {
    return Object.fromEntries(
      walkFiles(root, {
        excludedDirectoryNames: ["node_modules", ".ph", "dist"],
      }).map((file) => [relative(root, file), readFileSync(file, "utf8")]),
    );
  }

  it.each(["reference outside rootDir", "root outside rootDir"])(
    "confines loader emission for %s to scratch",
    async (variant) => {
      const root = packageWith("code-first");
      writeTsconfig(root, {
        declaration: true,
        declarationDir: "types",
        rootDir: variant === "root outside rootDir" ? "src" : ".",
      });
      if (variant === "reference outside rootDir") {
        mkdirSync(join(root, "shared"));
        writeFileSync(
          join(root, "shared", "x.ts"),
          "export const value = 42;\n",
        );
        addReference(root, "lib", {
          compilerOptions: { rootDir: undefined, outDir: undefined },
          files: ["../shared/x.ts"],
        });
      }
      const main = plainCompile(root);
      if (variant === "root outside rootDir")
        expect(main.output).toContain("TS6059");
      else expect(main.status, main.output).toBe(0);
      const expected = snapshot(root);
      const result = await build(root, "code-first", "dist", undefined, true);
      expect(
        result.exitCode,
        result.log + JSON.stringify(result.report?.diagnostics),
      ).toBe(0);
      expect(snapshot(root)).toEqual(expected);
      expect(
        existsSync(
          join(
            root,
            variant === "root outside rootDir"
              ? "index.js.map"
              : "shared/x.js.map",
          ),
        ),
      ).toBe(false);
    },
    120_000,
  );

  it("confines a reference's out-of-root loader source outside the package", async () => {
    const { root, shared } = siblingPackage("code-first");
    writeTsconfig(root, { declaration: true, declarationDir: "types" });
    addReference(root, "../lib", {
      compilerOptions: { rootDir: undefined, outDir: undefined },
      files: ["../shared/x.ts"],
    });
    expect(plainCompile(root).status).toBe(0);
    const expected = snapshot(shared);
    expect((await build(root, "code-first")).exitCode).toBe(0);
    expect(snapshot(shared)).toEqual(expected);
    expect(existsSync(join(shared, "x.js.map"))).toBe(false);
  }, 120_000);

  it.each([
    "exact match",
    "longest prefix",
    "substitution order",
    "extensionless index",
  ])(
    "uses tsc's paths resolution for %s",
    async (variant) => {
      const root = packageWith("code-first");
      writeFileSync(join(root, "src", "wrong.ts"), "export const value = 7;\n");
      writeFileSync(
        join(root, "src", "runtime.ts"),
        "export const value = 42;\n",
      );
      mkdirSync(join(root, "src", "runtime"));
      writeFileSync(
        join(root, "src", "runtime", "index.ts"),
        "export const value = 42;\n",
      );
      const paths =
        variant === "exact match"
          ? { "#*": ["./src/wrong.ts"], "#runtime": ["./src/runtime.ts"] }
          : variant === "longest prefix"
            ? { "#*": ["./src/wrong.ts"], "#run*": ["./src/runtime.ts"] }
            : variant === "substitution order"
              ? {
                  "#runtime": [
                    "./src/missing.ts",
                    "./src/runtime.ts",
                    "./src/wrong.ts",
                  ],
                }
              : { "#runtime": ["./src/runtime/index"] };
      writeTsconfig(root, {
        noEmit: true,
        emitDeclarationOnly: false,
        paths,
        ...(variant === "extensionless index" && {
          module: "esnext",
          moduleResolution: "bundler",
        }),
      });
      importRuntime(root, "#runtime");
      const main = plainCompile(root);
      expect(main.status, main.output).toBe(0);
      const result = await build(root, "code-first");
      expect(
        result.exitCode,
        result.log + JSON.stringify(result.report?.diagnostics),
      ).toBe(0);
    },
    120_000,
  );
});

describe("runtime loading", () => {
  afterEach(cleanUp);

  itWithSymlinks(
    "confines private emission of a symlinked JavaScript source to scratch",
    async () => {
      const fixture = siblingPackage("code-first");
      const nested = join(dirname(fixture.root), "nested", "deeper");
      mkdirSync(nested, { recursive: true });
      const root = join(nested, "package");
      renameSync(fixture.root, root);
      const protectedFile = join(fixture.shared, "protected.js");
      writeFileSync(protectedFile, "export const value = 42;\n");
      symlinkSync(protectedFile, join(root, "src", "value.js"));
      writeTsconfig(
        root,
        { noEmit: true, emitDeclarationOnly: false, allowJs: true },
        ["index.ts", "src/**/*"],
      );
      importRuntime(root, "./value.js");
      const steps = await createGenerationSteps();
      const result = await build(root, "code-first", "dist", {
        ...steps,
        typecheck: async (request) => {
          const checked = await steps.typecheck(request);
          assert(checked.ok);
          expect(
            [...checked.emittedModules.values()].every((file) =>
              new URL(file).searchParams.has("ph-loader"),
            ),
          ).toBe(true);
          return checked;
        },
      });
      expect(
        result.exitCode,
        result.log + JSON.stringify(result.report?.diagnostics),
      ).toBe(0);
      expect(readFileSync(protectedFile, "utf8")).toBe(
        "export const value = 42;\n",
      );
    },
    120_000,
  );

  it("resolves reference imports after TypeScript rewrites their extensions", async () => {
    const root = packageWith("code-first");
    writeTsconfig(root, { declaration: true, declarationDir: "types" });
    addReference(root, "lib", {
      compilerOptions: { outDir: "../dist/lib" },
      files: ["index.ts"],
    });
    const file = join(root, "tsconfig.json");
    const config = z
      .looseObject({ compilerOptions: z.record(z.string(), z.unknown()) })
      .parse(JSON.parse(readFileSync(file, "utf8")));
    config.compilerOptions.allowImportingTsExtensions = true;
    config.compilerOptions.noEmit = true;
    config.compilerOptions.emitDeclarationOnly = false;
    writeFileSync(file, JSON.stringify(config));
    importRuntime(root, "../lib/index.ts");
    const result = await build(root, "code-first");
    expect(
      result.exitCode,
      result.log + JSON.stringify(result.report?.diagnostics),
    ).toBe(0);
  }, 120_000);

  it.each(["reference", "package"])(
    "elides an implicit type-only re-export from a %s",
    async (kind) => {
      const root = packageWith("code-first");
      let specifier: string;
      if (kind === "reference") {
        writeTsconfig(root, { declaration: true, declarationDir: "types" });
        addReference(root, "lib", {
          compilerOptions: { outDir: "../dist/lib" },
          files: ["index.ts"],
          source: "export interface Shape { a: string }\n",
        });
        specifier = "../lib/index.js";
      } else {
        writeTsconfig(root, { noEmit: true, emitDeclarationOnly: false });
        const dep = join(root, "node_modules", "dep");
        mkdirSync(dep);
        writeFileSync(
          join(dep, "package.json"),
          '{"name":"dep","type":"module","types":"./index.d.ts","main":"./index.js"}',
        );
        writeFileSync(
          join(dep, "index.d.ts"),
          "export interface Shape { a: string }\n",
        );
        writeFileSync(join(dep, "index.js"), "export {};\n");
        specifier = "dep";
      }
      const invoice = join(root, "src", "invoice.ts");
      writeFileSync(
        invoice,
        `export { Shape } from ${JSON.stringify(specifier)};\n${readFileSync(invoice, "utf8")}`,
      );
      writeFileSync(join(root, "index.ts"), "export const ready = true;\n");
      const steps = await createGenerationSteps();
      const result = await build(root, "code-first", "dist", {
        ...steps,
        typecheck: async (request) => {
          const checked = await steps.typecheck(request);
          assert(checked.ok);

          const emitted = checked.emittedModules.get(invoice);
          expect(emitted).toBeDefined();
          expect(
            walkFiles(request.emittedRoot)
              .filter((file) => /\.[cm]?js$/.test(file))
              .map((file) => readFileSync(file, "utf8"))
              .join("\n"),
          ).not.toContain("Shape");

          return checked;
        },
      });
      expect(
        result.exitCode,
        result.log + JSON.stringify(result.report?.diagnostics),
      ).toBe(0);
    },
    120_000,
  );
});

describe("runtime loading", () => {
  afterEach(cleanUp);

  itWithSymlinks(
    "loads a noEmit sibling with the default CommonJS scope in real Node",
    async () => {
      const { root } = siblingPackage("code-first");
      writeTsconfig(
        root,
        { rootDir: undefined, noEmit: true, emitDeclarationOnly: false },
        ["index.ts", "src/**/*.ts", "../shared/*.ts"],
      );
      importRuntime(root, "../../shared/x.js");
      const steps = await createGenerationSteps();
      const result = await build(root, "code-first", "dist", {
        ...steps,
        typecheck: async (request) => {
          const checked = await steps.typecheck(request);
          if (!checked.ok) return checked;
          const module = checked.emittedModules.get(
            canonicalPath(join(root, "src", "invoice.ts")),
          );
          expect(module).toBeDefined();
          await new BuildGraphTypeScriptSourceImportAdapter({
            packageRoot: root,
            emittedModules: checked.emittedModules,
          }).importModule({ specifier: "./src/invoice.ts" });
          return checked;
        },
      });
      expect(result.exitCode, result.log).toBe(0);
    },
    120_000,
  );

  it.each(["output path", "CommonJS scope"])(
    "loads a reference through its %s",
    async (variant) => {
      const root = packageWith("code-first");
      writeTsconfig(root, { declaration: true, declarationDir: "types" });
      addReference(root, "lib", {
        compilerOptions: {
          outDir: undefined,
          ...(variant === "output path" ? { outDir: "../out/lib" } : {}),
        },
        files: ["index.ts"],
        source: "export const value: number = 42;\n",
      });
      if (variant === "CommonJS scope") {
        writeFileSync(
          join(root, "lib", "package.json"),
          '{"type":"commonjs"}\n',
        );
        const typescript = join(root, "node_modules", "typescript");
        rmSync(typescript);
        symlinkSync(
          resolve(
            import.meta.dirname,
            "../../../node_modules/.pnpm/typescript@5.9.3/node_modules/typescript",
          ),
          typescript,
        );
      }
      if (variant === "CommonJS scope") {
        rmSync(join(root, "node_modules", ".bin", "tsc"));
        symlinkSync(
          join(root, "node_modules", "typescript", "bin", "tsc"),
          join(root, "node_modules", ".bin", "tsc"),
        );
      }
      importRuntime(
        root,
        variant === "output path" ? "../out/lib/index.js" : "../lib/index.js",
      );
      const steps = await createGenerationSteps();
      const result = await build(root, "code-first", "dist", {
        ...steps,
        typecheck: async (request) => {
          const checked = await steps.typecheck(request);
          if (!checked.ok) return checked;
          const module = checked.emittedModules.get(
            join(root, "src", "invoice.ts"),
          );
          if (module === undefined)
            return { ok: false, summary: "missing loader module" };
          await new BuildGraphTypeScriptSourceImportAdapter({
            packageRoot: root,
            emittedModules: checked.emittedModules,
          }).importModule({ specifier: "./src/invoice.ts" });
          return checked;
        },
      });
      expect(result.exitCode, result.log).toBe(0);
    },
    120_000,
  );

  itWithSymlinks.each(["missing", "unloadable"])(
    "reports loader compiler diagnostics for a %s module",
    async (variant) => {
      const root = packageWith("code-first");
      writeTsconfig(root, { declaration: true, declarationDir: "types" });
      const bin = join(root, "node_modules", ".bin", "tsc");
      rmSync(bin);
      writeFileSync(
        bin,
        [
          "#!/usr/bin/env node",
          'const fs = require("node:fs");',
          'const path = require("node:path");',
          "const args = process.argv.slice(2);",
          'const project = args[args.indexOf("-p") + 1];',
          'const loader = project && path.isAbsolute(project) && fs.readFileSync(project, "utf8").includes("\\"noCheck\\":true");',
          ...(variant === "missing"
            ? [
                'if (loader) { console.log("TS9999: private loader probe"); process.exit(2); }',
              ]
            : []),
          'const result = require("node:child_process").spawnSync(process.execPath, [path.join(process.cwd(), "node_modules", "typescript", "bin", "tsc"), ...args], { stdio: "inherit" });',
          ...(variant === "unloadable"
            ? [
                'if (loader) { const config = JSON.parse(fs.readFileSync(project, "utf8")); const find = (dir) => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) find(file); else if (entry.name === "invoice.js") fs.writeFileSync(file, "throw new Error(\\"unloadable probe\\");\\n"); } }; find(config.compilerOptions.outDir); console.log("TS9999: private loader probe"); process.exit(2); }',
              ]
            : []),
          "process.exit(result.status ?? 1);",
          "",
        ].join("\n"),
      );
      chmodSync(bin, 0o755);
      const result = await build(root, "code-first");
      expect(result.exitCode).toBe(2);
      expect(
        result.report?.diagnostics
          .map((diagnostic) => diagnostic.received)
          .join("\n"),
      ).toContain("TS9999: private loader probe");
      expect(existsSync(join(root, "types"))).toBe(false);
    },
    120_000,
  );
});

it.each(["paths", "rootDirs", "typeRoots", "relative types"] as const)(
  "uses inherited %s when evaluating loader runtime values",
  async (option) => {
    const root = packageWith("code-first");
    writeFileSync(join(root, "index.ts"), "export const ready = true;\n");
    mkdirSync(join(root, "config"));
    const compilerOptions: Record<string, unknown> = {
      module: "esnext",
      moduleResolution: "bundler",
      target: "esnext",
      rootDir: "..",
      noEmit: true,
      skipLibCheck: true,
    };
    let expression: string;
    let imported = "";
    let expected: number;
    if (option === "paths" || option === "rootDirs") {
      const directory = option === "paths" ? "src" : "generated";
      mkdirSync(join(root, directory), { recursive: true });
      expected = option === "paths" ? 42 : 53;
      writeFileSync(
        join(root, directory, "runtime.ts"),
        `export const enum Values { Ready = ${expected} }\n`,
      );
      if (option === "paths")
        compilerOptions.paths = { "inherited-runtime": ["../src/runtime.ts"] };
      else compilerOptions.rootDirs = ["../src", "../generated"];
      imported = `import { Values } from ${JSON.stringify(option === "paths" ? "inherited-runtime" : "./runtime.js")};\n`;
      expression = "Values.Ready";
    } else {
      expected = option === "typeRoots" ? 67 : 79;
      const directory = join(root, "custom-types", "values");
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        join(directory, "index.d.ts"),
        `declare const enum InheritedValue { Ready = ${expected} }\n`,
      );
      if (option === "typeRoots") {
        compilerOptions.typeRoots = ["../custom-types"];
        compilerOptions.types = ["values"];
      } else compilerOptions.types = ["./custom-types/values/index.d.ts"];
      expression = "InheritedValue.Ready";
    }
    writeFileSync(
      join(root, "config/base.json"),
      JSON.stringify({ compilerOptions }),
    );
    writeFileSync(
      join(root, "tsconfig.json"),
      JSON.stringify({
        extends: "./config/base.json",
        include: ["index.ts", "src/**/*.ts", "generated/**/*.ts"],
      }),
    );
    const invoice = join(root, "src/invoice.ts");
    writeFileSync(
      invoice,
      `${imported}if (${expression} !== ${expected}) throw new Error("wrong inherited value");\n${readFileSync(invoice, "utf8")}`,
    );
    const main = plainCompile(root);
    expect(main.status, main.output).toBe(0);
    const result = await build(root, "code-first");
    expect(
      result.exitCode,
      result.log + JSON.stringify(result.report?.diagnostics),
    ).toBe(0);
    expect(result.report?.definitions.map(({ key }) => key)).toEqual([
      "test/invoice",
      "test/invoice",
    ]);
  },
  120_000,
);

it("refreshes a typed JavaScript alias across loader generations", async () => {
  const root = typedRuntimeAlias();
  const initial = await build(root, "code-first");
  expect(initial.exitCode, initial.log).toBe(0);
  writeFileSync(join(root, "src/runtime.js"), "export const value = 7;\n");
  const changed = await build(root, "code-first");
  expect(changed.exitCode).toBe(2);
  expect(
    changed.report?.diagnostics.map(({ received }) => received).join("\n"),
  ).toContain("wrong runtime value");
}, 120_000);

itWithSymlinks(
  "loads the exported workspace runtime when a declaration has a different adjacent runtime",
  async () => {
    const { root, shared } = workspaceRuntime("built JavaScript");
    const manifest = join(shared, "package.json");
    const pkg = z
      .record(z.string(), z.unknown())
      .parse(JSON.parse(readFileSync(manifest, "utf8")));
    pkg.exports = { types: "./index.d.ts", default: "./runtime.js" };
    writeFileSync(manifest, JSON.stringify(pkg));
    writeFileSync(join(shared, "index.js"), "export const value = 7;\n");
    writeFileSync(join(shared, "runtime.js"), "export const value = 42;\n");
    const result = await build(root, "code-first");
    expect(
      result.exitCode,
      result.log + JSON.stringify(result.report?.diagnostics),
    ).toBe(0);
  },
  120_000,
);
