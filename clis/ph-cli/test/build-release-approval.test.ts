import {
  prepack,
  build,
  cleanUp,
  packageWith,
  writeTsconfig,
  itWithSymlinks,
  disposals,
} from "./helpers/declarations.js";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  realpathSync,
  chmodSync,
  existsSync,
  mkdtempSync,
  readlinkSync,
  symlinkSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { afterEach, expect, it, vi, describe } from "vitest";
import { z } from "zod";
import { recorder } from "./helpers/recorder.js";
import { createGenerationSteps } from "../src/services/definitions/build-steps.js";
import {
  runtimeApprovalCases,
  workspaceApproval,
  importRuntime,
} from "./helpers/loader-cases.js";
import {
  siblingPackage,
  addReference,
  plainCompile,
  duplicatePackages,
} from "./helpers/workspace.js";
import { tmpdir } from "node:os";

describe("published file changes", () => {
  afterEach(cleanUp);

  it.each(["changed", "deleted", "added"])(
    "invalidates approval when a published ignored stale beside-source declaration is %s",
    async (change) => {
      const root = packageWith("code-first");
      writeTsconfig(root, { declaration: true, declarationDir: "types" });
      mkdirSync(join(root, "lib"));
      const stale = join(root, "lib", "gone.d.ts");
      writeFileSync(stale, "export type Gone = true;\n");
      const file = join(root, "package.json");
      const pkg = z
        .record(z.string(), z.unknown())
        .parse(JSON.parse(readFileSync(file, "utf8")));
      pkg.exports = {
        ".": { import: "./dist/node/index.mjs" },
        "./gone": { types: "./lib/gone.d.ts" },
      };
      pkg.files = ["dist", "types", "lib"];
      writeFileSync(file, JSON.stringify(pkg));
      expect(spawnSync("git", ["init", "--quiet"], { cwd: root }).status).toBe(
        0,
      );
      writeFileSync(join(root, ".gitignore"), "lib/*.d.ts\ntypes/\ndist/\n");
      const built = await build(root, "code-first");
      expect(built.exitCode, built.log).toBe(0);
      if (change === "changed")
        writeFileSync(stale, "export type Gone = false;\n");
      else if (change === "deleted") rmSync(stale);
      else
        writeFileSync(
          join(root, "lib", "added.d.ts"),
          "export type Added = true;\n",
        );
      const result = await prepack(root);
      expect(result.exitCode, result.log).toBe(0);
      expect(result.log).toContain(
        "Running a release check: the published file set changed since that check",
      );
      expect(result.log).not.toContain("Reusing the completed release check");
    },
    120_000,
  );

  it("guards the same build snapshot before promoting a schema-first package", async () => {
    const root = packageWith("schema-first");
    writeTsconfig(root, { declaration: true, declarationDir: "types" });
    const recording = recorder();
    const result = await build(root, "schema-first", "dist", {
      ...recording.steps,
      emitCandidate: async (request) => {
        const emitted = await recording.steps.emitCandidate(request);
        writeFileSync(
          join(root, "src", "shape.ts"),
          "export type Shape = { a: number };\n",
        );
        return emitted;
      },
    });
    expect(result.exitCode, result.log).toBe(2);
    expect(recording.promotions).toBe(0);
    expect(result.log).toContain(
      "The package changed while it was being checked (the package changed since that check); nothing was promoted.",
    );
  }, 120_000);
});

describe("loaded runtime evidence", () => {
  afterEach(cleanUp);

  itWithSymlinks.each(runtimeApprovalCases)(
    "invalidates approval when only %s changes",
    async (kind) => {
      const { root, runtime, helper, edit } = workspaceApproval(kind);
      const runtimePath = realpathSync(runtime);
      const helperPath = realpathSync(helper);
      const built = await build(root, "code-first");
      expect(built.exitCode, built.log).toBe(0);
      const retained = await prepack(root);
      expect(retained.exitCode, retained.log).toBe(0);
      expect(retained.log).toContain("Reusing the completed release check");
      const approval = z
        .object({ loadedRuntimeFiles: z.array(z.string()) })
        .parse(
          JSON.parse(
            readFileSync(join(root, ".ph/build/release-approval.json"), "utf8"),
          ),
        );
      edit();
      const changed = await prepack(root);
      expect(changed.exitCode, changed.log).toBe(1);
      expect(changed.log).toContain("Running a release check");
      expect(changed.report?.diagnostics.map(({ code }) => code)).toContain(
        "PH-DM-DECLARATION-INVALID",
      );
      expect(
        approval.loadedRuntimeFiles.filter(
          (file) => file === runtimePath || file === helperPath,
        ),
      ).toEqual(
        kind === "workspace JavaScript"
          ? [runtimePath]
          : [runtimePath, helperPath].sort(),
      );
    },
    120_000,
  );

  itWithSymlinks(
    "invalidates approval when a loaded workspace runtime disappears",
    async () => {
      const { root, changed } = workspaceApproval("transitive JavaScript");
      expect((await build(root, "code-first")).exitCode).toBe(0);
      rmSync(changed);
      const result = await prepack(root);
      expect(result.exitCode, result.log).toBe(2);
      expect(result.log).toContain("Running a release check");
      expect(result.report?.diagnostics.map(({ code }) => code)).toContain(
        "PH-IMPORT-FAILED",
      );
    },
    120_000,
  );

  itWithSymlinks(
    "refuses promotion when a loaded workspace runtime changes during packed verification",
    async () => {
      const { root, edit } = workspaceApproval("transitive CommonJS");
      const steps = await createGenerationSteps();
      const result = await build(root, "code-first", "dist", {
        ...steps,
        verifyPackedConsumers: async (request) => {
          const packed = await steps.verifyPackedConsumers(request);
          edit();
          return packed;
        },
      });
      expect(result.exitCode, result.log).toBe(2);
      expect(result.log).toContain(
        "The package changed while it was being checked (a loaded runtime file changed since that check); nothing was promoted.",
      );
      expect(result.phases).toEqual([
        "typecheck",
        "definitions",
        "candidate",
        "packed",
      ]);
    },
    120_000,
  );
});

describe("program inputs", () => {
  afterEach(cleanUp);

  it.each(["root", "in-package reference"])(
    "binds the %s's external config chain in release approval",
    async (kind) => {
      const { root } = siblingPackage("code-first");
      writeTsconfig(root, { noEmit: true, emitDeclarationOnly: false });
      const directory = kind === "root" ? root : join(root, "lib");
      if (kind !== "root") addReference(root, directory);
      const base = join(dirname(root), "base.json");
      writeFileSync(base, '{"compilerOptions":{"noImplicitAny":false}}');
      const config = join(directory, "tsconfig.json");
      writeFileSync(
        config,
        readFileSync(config, "utf8").replace(
          '{"compilerOptions"',
          `{"extends":${JSON.stringify(base)},"compilerOptions"`,
        ),
      );
      writeFileSync(
        join(directory, kind === "root" ? "src/unchecked.ts" : "unchecked.ts"),
        "export function identity(value) { return value; }\n",
      );
      const result = await build(root, "code-first");
      expect(result.exitCode, result.log).toBe(0);
      writeFileSync(base, '{"compilerOptions":{"noImplicitAny":true}}');
      const retained = await prepack(root);
      expect(retained.exitCode, retained.log).toBe(2);
      expect(retained.log).toContain("TS7006");
      expect(retained.log).not.toContain("Reusing the completed release check");
    },
    120_000,
  );

  it.each(["changed", "added"])(
    "binds %s out-of-package root declaration inputs",
    async (change) => {
      const { root, shared } = siblingPackage("code-first");
      writeTsconfig(root, { noEmit: true, emitDeclarationOnly: false }, [
        "index.ts",
        "src/**/*.ts",
        "../shared/*.d.ts",
      ]);
      const external = join(shared, "external.d.ts");
      writeFileSync(external, "interface OutsideShape {}\n");
      writeFileSync(
        join(root, "src", "unchecked.ts"),
        "export const external: OutsideShape = {};\n",
      );
      const result = await build(root, "code-first");
      expect(result.exitCode, result.log).toBe(0);
      writeFileSync(
        change === "changed" ? external : join(shared, "added.d.ts"),
        "interface OutsideShape { required: string }\n",
      );
      const retained = await prepack(root);
      expect(retained.exitCode, retained.log).toBe(2);
      expect(retained.log).toContain("TS2741");
    },
    120_000,
  );

  it("binds node_modules typings used by an in-package root", async () => {
    const { root } = siblingPackage("code-first");
    writeTsconfig(root, { noEmit: true, emitDeclarationOnly: false });
    const dependency = join(root, "node_modules", "typing-dep");
    mkdirSync(dependency);
    writeFileSync(
      join(dependency, "package.json"),
      '{"name":"typing-dep","type":"module","types":"index.d.ts"}',
    );
    const types = join(dependency, "index.d.ts");
    writeFileSync(types, "export type Value = number;\n");
    writeFileSync(
      join(root, "src", "unchecked.ts"),
      'import type { Value } from "typing-dep";\nexport const value: Value = 42;\n',
    );
    expect((await build(root, "code-first")).exitCode).toBe(0);
    writeFileSync(types, "export type Value = string;\n");
    const retained = await prepack(root);
    expect(retained.exitCode, retained.log).toBe(2);
    expect(retained.log).toContain("TS2322");
  }, 120_000);

  it.each([0, 1])(
    "reuses retained approval with %s references",
    async (count) => {
      const { root } = siblingPackage("code-first");
      writeTsconfig(root, { noEmit: true, emitDeclarationOnly: false });
      if (count) addReference(root, join(root, "lib"));
      expect((await build(root, "code-first")).exitCode).toBe(0);

      const retained = await prepack(root);
      expect(retained.exitCode, retained.log).toBe(0);
      expect(retained.log).toContain("Reusing the completed release check");
    },
    120_000,
  );
});

describe("inherited compiler inputs", () => {
  afterEach(cleanUp);

  it.each(["tsconfig field", "exports subpath", "array extends"])(
    "binds TypeScript's %s resolution and consulted manifest",
    async (kind) => {
      const root = packageWith("code-first");
      writeTsconfig(root, { noEmit: true, emitDeclarationOnly: false });
      writeFileSync(
        join(root, "src/unchecked.ts"),
        "export function identity(value) { return value; }\n",
      );
      const pkg = join(root, "node_modules/config-pkg");
      mkdirSync(pkg);
      const manifest = {
        name: "config-pkg",
        main: "unused.json",
        tsconfig: "base.json",
        exports: {
          "./base": {
            types: "./base.json",
            require: "./unused.json",
            default: "./unused.json",
          },
        },
      };
      if (kind !== "exports subpath")
        Reflect.deleteProperty(manifest, "exports");
      writeFileSync(join(pkg, "package.json"), JSON.stringify(manifest));
      for (const file of ["base.json", "unused.json"])
        writeFileSync(
          join(pkg, file),
          '{"compilerOptions":{"noImplicitAny":false}}',
        );
      writeFileSync(
        join(pkg, "strict.json"),
        '{"compilerOptions":{"noImplicitAny":true}}',
      );
      writeFileSync(
        join(root, "first.json"),
        '{"compilerOptions":{"noImplicitAny":true}}',
      );
      const config = join(root, "tsconfig.json");
      const bases =
        kind === "array extends"
          ? ["./first.json", "config-pkg"]
          : kind === "exports subpath"
            ? "config-pkg/base"
            : "config-pkg";
      writeFileSync(
        config,
        readFileSync(config, "utf8").replace(
          '{"compilerOptions"',
          `{"extends":${JSON.stringify(bases)},"compilerOptions"`,
        ),
      );
      const initial = await build(root, "code-first");
      expect(initial.exitCode, initial.log).toBe(0);
      expect((await prepack(root)).phases).toEqual([]);
      if (kind === "array extends") {
        manifest.tsconfig = "strict.json";
        writeFileSync(join(pkg, "package.json"), JSON.stringify(manifest));
      } else
        writeFileSync(
          join(pkg, "base.json"),
          '{"compilerOptions":{"noImplicitAny":true}}',
        );
      const changed = await prepack(root);
      const plain = plainCompile(root);
      expect(plain.status, plain.output).not.toBe(0);
      expect(plain.output).toContain("TS7006");
      expect(changed.exitCode, changed.log).toBe(2);
      expect(changed.log).toContain("TS7006");
      expect(changed.log).not.toContain("Reusing the completed release check");
    },
    120_000,
  );
});

describe("duplicate compiler inputs", () => {
  afterEach(cleanUp);

  it("reuses release approval with redirected duplicate package inputs", async () => {
    const root = duplicatePackages();
    const built = await build(root, "code-first");
    expect(built.exitCode, built.log).toBe(0);
    const retained = await prepack(root);
    expect(retained.exitCode, retained.log).toBe(0);
    expect(retained.log).toContain("Reusing the completed release check");
  }, 120_000);
});

describe("publication evidence", () => {
  afterEach(cleanUp);

  function recordNpm(): () => string[][] {
    const probe = mkdtempSync(join(tmpdir(), "ph-pack-commands-"));
    disposals.push(() => rmSync(probe, { recursive: true, force: true }));
    const log = join(probe, "commands.jsonl");
    writeFileSync(log, "");
    const executable = join(probe, "npm");
    const target = spawnSync("which", ["npm"], {
      encoding: "utf8",
    }).stdout.trim();
    writeFileSync(
      executable,
      [
        "#!/usr/bin/env node",
        `require("node:fs").appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + "\\n");`,
        `const result = require("node:child_process").spawnSync(${JSON.stringify(target)}, [...process.argv.slice(2)], { stdio: "inherit" });`,
        "process.exit(result.status ?? 1);",
        "",
      ].join("\n"),
    );
    chmodSync(executable, 0o755);
    vi.stubEnv("PATH", `${probe}:${process.env.PATH}`);
    disposals.push(() => vi.unstubAllEnvs());
    return () =>
      readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => z.array(z.string()).parse(JSON.parse(line)));
  }

  it("invalidates approval when an external reference's source or runtime output changes", async () => {
    const { root } = siblingPackage("code-first");
    writeTsconfig(root, { declaration: true, declarationDir: "types" });
    addReference(root, "../lib", {
      compilerOptions: { rootDir: undefined, outDir: undefined },
      files: ["index.ts"],
    });
    importRuntime(root, "../../lib/index.js");
    const built = await build(root, "code-first");
    expect(
      built.exitCode,
      built.log + JSON.stringify(built.report?.diagnostics),
    ).toBe(0);
    expect((await prepack(root)).phases).toEqual([]);
    writeFileSync(join(root, "../lib/index.js"), "export const value = 7;\n");
    const outputChange = await prepack(root);
    expect(outputChange.log).toContain("Running a release check");
    expect(outputChange.phases[0]).toBe("typecheck");
    expect(outputChange.exitCode).toBe(1);
    writeFileSync(
      join(root, "../lib/index.ts"),
      "export const value: number = 7;\n",
    );
    const sourceChange = await prepack(root);
    expect(sourceChange.log).toContain("Running a release check");
    expect(sourceChange.exitCode).toBe(2);
    expect(
      sourceChange.report?.diagnostics.map((diagnostic) => diagnostic.code),
    ).toContain("PH-IMPORT-FAILED");
  }, 180_000);

  itWithSymlinks(
    "preserves a linked output directory through promotion and approval reuse",
    async () => {
      const root = packageWith("code-first");
      mkdirSync(join(root, "out"));
      writeFileSync(join(root, "out", "keep.txt"), "retained\n");
      symlinkSync("out", join(root, "dist"));
      writeTsconfig(root, { declaration: true, declarationDir: "dist/types" });
      const manifest = join(root, "package.json");
      const pkg = z
        .record(z.string(), z.unknown())
        .parse(JSON.parse(readFileSync(manifest, "utf8")));
      pkg.files = ["out"];
      pkg.exports = {
        ".": {
          types: "./out/types/index.d.ts",
          browser: "./out/browser/index.js",
          import: "./out/node/index.mjs",
        },
      };
      writeFileSync(manifest, JSON.stringify(pkg));
      const result = await build(root, "code-first");
      expect(result.exitCode, result.log).toBe(0);
      expect(readlinkSync(join(root, "dist"))).toBe("out");
      expect(readFileSync(join(root, "out", "keep.txt"), "utf8")).toBe(
        "retained\n",
      );
      expect(existsSync(join(root, "out", "node", "index.mjs"))).toBe(true);
      expect(existsSync(join(root, "out", "types", "index.d.ts"))).toBe(true);
      expect((await prepack(root)).phases).toEqual([]);
    },
    120_000,
  );

  it("lists the published set once during build and reuses approval without installed-tree listing", async () => {
    const root = packageWith("code-first");
    writeTsconfig(root, { declaration: true, declarationDir: "types" });
    const commands = recordNpm();

    const result = await build(root, "code-first");

    expect(result.exitCode, result.log).toBe(0);
    const packs = commands().filter((args) => args[0] === "pack");

    const retained = await prepack(root);
    expect(retained.phases).toEqual([]);
    expect(packs).toHaveLength(1);
    expect(packs[0]).toContain("--json");
  }, 120_000);
});

describe("publication evidence", () => {
  afterEach(cleanUp);

  itWithSymlinks(
    "rejects a linked output layout whose real npm tarball omits the bundles",
    async () => {
      const root = packageWith("code-first");
      mkdirSync(join(root, "out"));
      symlinkSync("out", join(root, "dist"));
      writeTsconfig(root, { declaration: true, declarationDir: "dist/types" });
      const result = await build(root, "code-first");
      expect(
        result.exitCode,
        result.log + JSON.stringify(result.report?.diagnostics),
      ).toBe(1);
      expect(
        result.report?.diagnostics.map((diagnostic) => diagnostic.code),
      ).toContain("PH-PKG-PACKED-CONSUMER-FAILED");
      expect(result.phases).toEqual([
        "typecheck",
        "definitions",
        "candidate",
        "packed",
      ]);
      const steps = await createGenerationSteps();
      expect(
        await steps.emitCandidate({
          packageRoot: root,
          candidateRoot: join(root, "dist"),
        }),
      ).toEqual({ ok: true });
      expect(existsSync(join(root, "out", "node", "index.mjs"))).toBe(true);
      const tarball = join(root, ".ph", "build", "main-like-pack");
      mkdirSync(tarball);
      const packed = spawnSync(
        "npm",
        ["pack", "--json", "--ignore-scripts", "--pack-destination", tarball],
        { cwd: root, encoding: "utf8" },
      );
      expect(packed.status, packed.stderr).toBe(0);
      const listing = z
        .array(z.object({ files: z.array(z.object({ path: z.string() })) }))
        .parse(JSON.parse(packed.stdout));
      expect(
        listing
          .flatMap((pack) => pack.files.map((file) => file.path))
          .filter((path) => path.startsWith("dist/")),
      ).toEqual([]);
    },
    120_000,
  );

  it.each([".vite", ".turbo", ".ph"])(
    "includes published nested %s files in packed evidence",
    async (directory) => {
      const root = packageWith("code-first");
      writeTsconfig(root, { noEmit: true, emitDeclarationOnly: false });
      const asset = join(root, "assets", directory);
      mkdirSync(asset, { recursive: true });
      writeFileSync(join(asset, "value.txt"), "published\n");
      const manifest = join(root, "package.json");
      const pkg = z
        .record(z.string(), z.unknown())
        .parse(JSON.parse(readFileSync(manifest, "utf8")));
      pkg.files = ["dist", "assets"];
      writeFileSync(manifest, JSON.stringify(pkg));
      const steps = await createGenerationSteps();
      let published: readonly string[] = [];
      const result = await build(root, "code-first", "dist", {
        ...steps,
        verifyPackedConsumers: (request) =>
          steps.verifyPackedConsumers({
            ...request,
            recordPublishedFiles: (evidence) => {
              published = evidence.files;
              request.recordPublishedFiles?.(evidence);
            },
          }),
      });
      expect(
        result.exitCode,
        result.log + JSON.stringify(result.report?.diagnostics),
      ).toBe(0);
      expect(published).toContain(`assets/${directory}/value.txt`);
      writeFileSync(join(asset, "value.txt"), "changed\n");
      const retained = await prepack(root);
      expect(retained.exitCode, retained.log).toBe(0);
      expect(retained.log).toContain(
        "the published file set changed since that check",
      );
      expect(retained.phases[0]).toBe("typecheck");
    },
    120_000,
  );
});

describe("publication evidence", () => {
  afterEach(cleanUp);

  it.each(["membership", "inherited config"])(
    "invalidates an external reference approval after a change to %s",
    async (change) => {
      const { root } = siblingPackage("code-first");
      const lib = join(root, "../lib");
      mkdirSync(lib);
      writeFileSync(
        join(lib, "index.ts"),
        "export const value = 42; export function identity(input) { return input }\n",
      );
      writeFileSync(
        join(lib, "base.json"),
        JSON.stringify({
          compilerOptions: {
            composite: true,
            rootDir: ".",
            module: "nodenext",
            target: "esnext",
            noImplicitAny: false,
          },
        }),
      );
      writeFileSync(
        join(lib, "tsconfig.json"),
        JSON.stringify({ extends: "./base.json", include: ["*.ts"] }),
      );
      writeTsconfig(root, { declaration: true, declarationDir: "types" });
      const file = join(root, "tsconfig.json");
      const config = z
        .record(z.string(), z.unknown())
        .parse(JSON.parse(readFileSync(file, "utf8")));
      config.references = [{ path: "../lib" }];
      writeFileSync(file, JSON.stringify(config));
      importRuntime(root, "../../lib/index.js");
      const built = await build(root, "code-first");
      expect(built.exitCode, built.log).toBe(0);

      expect((await prepack(root)).phases).toEqual([]);
      if (change === "membership")
        writeFileSync(
          join(lib, "added.ts"),
          "const invalid: string = 42; export {};\n",
        );
      else
        writeFileSync(
          join(lib, "base.json"),
          readFileSync(join(lib, "base.json"), "utf8").replace(
            '"noImplicitAny":false',
            '"noImplicitAny":true',
          ),
        );
      const result = await prepack(root);
      expect(plainCompile(root).status).toBe(2);
      expect(result.exitCode, result.log).toBe(2);
      expect(result.phases).toEqual(["typecheck"]);
      expect(result.log).not.toContain("Reusing the completed release check");
    },
    120_000,
  );
});
