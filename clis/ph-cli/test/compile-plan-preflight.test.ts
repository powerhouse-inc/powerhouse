import { mkdirSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { prepareCompile } from "../src/services/definitions/compiler.js";
import {
  addReference,
  cleanUp,
  compileFixture,
  fixtureRuns,
  recordTsc,
  replaceTsc,
  writeJson,
  writeTsconfig,
} from "./compile-fixture.js";

const itWithFixture = it.skipIf(!fixtureRuns);

afterEach(cleanUp);

const TIMEOUT = 60_000;

const outside = (path: string) =>
  `tsc would write to ${JSON.stringify(path)} outside the package.`;

const noInputs = (root: string) =>
  `error TS18003: No inputs were found in config file '${join(root, "tsconfig.json")}'. Specified 'include' paths were '["missing/*.ts"]' and 'exclude' paths were '[]'.`;

function listTree(root: string): string[] {
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((path) => !path.startsWith("node_modules"))
    .sort();
}

itWithFixture.each([
  {
    name: "outDir",
    options: { outDir: "../shared/out", emitDeclarationOnly: false },
    path: "shared/out",
  },
  {
    name: "declarationDir",
    options: { declaration: true, declarationDir: "../shared/types" },
    path: "shared/types",
  },
  {
    name: "explicit build info",
    options: {
      noEmit: true,
      emitDeclarationOnly: false,
      tsBuildInfoFile: "../shared/info.tsbuildinfo",
    },
    path: "shared/info.tsbuildinfo",
  },
  {
    name: "default build info",
    options: {
      rootDir: "src/deeper",
      outDir: "generated",
      emitDeclarationOnly: false,
      noEmit: true,
    },
    path: "tsconfig.tsbuildinfo",
  },
])(
  "refuses an outside $name before compiling",
  async ({ options, path }) => {
    const { root, parent } = compileFixture();
    mkdirSync(join(root, "src", "deeper"));
    writeFileSync(join(root, "src", "deeper", "x.ts"), "export const x = 1;\n");
    writeTsconfig(root, options, ["src/deeper/x.ts"]);
    const before = listTree(parent);
    expect(await prepareCompile(root, "pnpm")).toEqual({
      ok: false,
      summary: outside(join(parent, path)),
    });
    expect(listTree(parent)).toEqual(before);
  },
  TIMEOUT,
);

itWithFixture(
  "refuses an emitting sibling source",
  async () => {
    const { root, shared } = compileFixture();
    writeTsconfig(
      root,
      { rootDir: undefined, declaration: true, emitDeclarationOnly: false },
      ["index.ts", "src/**/*.ts", "../shared/*.ts"],
    );
    expect(await prepareCompile(root, "pnpm")).toEqual({
      ok: false,
      summary: outside(join(shared, "x.js")),
    });
  },
  TIMEOUT,
);

itWithFixture(
  "accepts noEmit with sibling sources",
  async () => {
    const { root, shared } = compileFixture();
    writeTsconfig(
      root,
      { rootDir: undefined, noEmit: true, emitDeclarationOnly: false },
      ["index.ts", "src/**/*.ts", "../shared/*.ts"],
    );
    const preflight = await prepareCompile(root, "pnpm");
    expect(preflight.ok && preflight.plan.outputs).toEqual({
      directories: [],
      files: ["tsconfig.tsbuildinfo"],
    });
    expect(preflight.ok && preflight.plan.projects[0].sources).toEqual([
      join(root, "src", "shape.ts"),
      join(root, "index.ts"),
      join(shared, "x.ts"),
    ]);
  },
  TIMEOUT,
);

itWithFixture(
  "refuses an explicitly listed node_modules source whose output links outside",
  async () => {
    const { root, shared } = compileFixture();
    writeFileSync(
      join(root, "node_modules", "raw.ts"),
      "export const value = 42;\n",
    );
    writeJson(join(root, "tsconfig.json"), {
      compilerOptions: {
        rootDir: ".",
        module: "nodenext",
        outDir: "generated",
        skipLibCheck: true,
      },
      files: ["index.ts", "node_modules/raw.ts"],
    });
    mkdirSync(join(root, "generated", "node_modules"), { recursive: true });
    symlinkSync(
      join(shared, "protected.js"),
      join(root, "generated", "node_modules", "raw.js"),
    );
    expect(await prepareCompile(root, "pnpm")).toEqual({
      ok: false,
      summary: outside(join(root, "generated", "node_modules", "raw.js")),
    });
  },
  TIMEOUT,
);

itWithFixture(
  "preflights recursive in-package references before any reference writes",
  async () => {
    const { root, parent } = compileFixture();
    for (const directory of ["lib", "deep"]) {
      mkdirSync(join(root, directory));
      writeFileSync(
        join(root, directory, "x.ts"),
        "export const value = 42;\n",
      );
      writeJson(join(root, directory, "tsconfig.json"), {
        compilerOptions: {
          composite: true,
          rootDir: ".",
          outDir:
            directory === "deep" ? "../../shared/out" : "../generated/lib",
        },
        files: ["x.ts"],
        ...(directory === "lib" && { references: [{ path: "../deep" }] }),
      });
    }
    writeJson(join(root, "tsconfig.json"), {
      files: [],
      references: [{ path: "./lib" }],
    });
    expect(await prepareCompile(root, "pnpm")).toEqual({
      ok: false,
      summary: outside(join(parent, "shared", "out")),
    });
  },
  TIMEOUT,
);

itWithFixture(
  "leaves an outside reference to build in place",
  async () => {
    const { root, shared } = compileFixture();
    writeJson(join(shared, "tsconfig.json"), {
      compilerOptions: {
        composite: true,
        rootDir: ".",
        module: "nodenext",
        target: "esnext",
      },
      files: ["x.ts"],
    });
    writeTsconfig(
      root,
      { declaration: true, outDir: "generated", emitDeclarationOnly: false },
      undefined,
      { references: [{ path: "../shared" }] },
    );
    const preflight = await prepareCompile(root, "pnpm");
    if (!preflight.ok) throw new Error(preflight.summary);
    expect(
      preflight.plan.projects.map(({ configFile, external }) => [
        configFile,
        external,
      ]),
    ).toEqual([
      [join(root, "tsconfig.json"), false],
      [join(shared, "tsconfig.json"), true],
    ]);
    expect(preflight.plan.outputs).toEqual({
      directories: ["generated"],
      files: [
        "generated/index.d.ts",
        "generated/index.js",
        "generated/src/shape.d.ts",
        "generated/src/shape.js",
        "generated/tsconfig.tsbuildinfo",
      ],
    });
  },
  TIMEOUT,
);

itWithFixture(
  "reads each project of a reference cycle once",
  async () => {
    const { root } = compileFixture();
    writeTsconfig(root, { declaration: true, declarationDir: "types" });
    for (const directory of ["a", "b", "c"]) {
      mkdirSync(join(root, directory));
      writeFileSync(
        join(root, directory, "index.ts"),
        "export const ready = true;\n",
      );
      writeJson(join(root, directory, "tsconfig.json"), {
        compilerOptions: { composite: true },
        files: ["index.ts"],
        ...(directory !== "a" && {
          references: [{ path: directory === "b" ? "../c" : "../b" }],
        }),
      });
    }
    writeTsconfig(
      root,
      { declaration: true, declarationDir: "types" },
      undefined,
      { references: [{ path: "./a" }, { path: "./b" }] },
    );
    const commands = recordTsc(root);
    const preflight = await prepareCompile(root, "pnpm");
    if (!preflight.ok) throw new Error(preflight.summary);
    expect(preflight.plan.projects.map(({ configFile }) => configFile)).toEqual(
      ["", "a", "b", "c"].map((directory) =>
        join(root, directory, "tsconfig.json"),
      ),
    );
    expect(
      commands().map((args) =>
        args.includes("--version")
          ? "--version"
          : args[2] === "--showConfig"
            ? `show ${args[1]}`
            : `list ${args[1]}`,
      ),
    ).toEqual([
      "--version",
      ...["", "a", "b", "c"].flatMap((directory) => [
        `show ${join(root, directory, "tsconfig.json")}`,
        `list ${join(root, directory, "tsconfig.json")}`,
      ]),
    ]);
  },
  TIMEOUT,
);

itWithFixture(
  "keeps resolution tracing off for a package with a non-ASCII path",
  async () => {
    const { root } = compileFixture({ name: "café-🧪" });
    writeTsconfig(root, { noEmit: true, emitDeclarationOnly: false });
    const commands = recordTsc(root);
    const preflight = await prepareCompile(root, "pnpm");
    if (!preflight.ok) throw new Error(preflight.summary);
    expect(preflight.plan.projects[0].sources).toEqual([
      join(root, "src", "shape.ts"),
      join(root, "index.ts"),
    ]);
    const config = join(root, "tsconfig.json");
    expect(commands()).toEqual([
      ["--version"],
      ["-p", config, "--showConfig"],
      ["-p", config, "--listFilesOnly", "--explainFiles", "--pretty", "false"],
    ]);
  },
  TIMEOUT,
);

itWithFixture.each([
  {
    version: "5.5.4",
    name: "declarations",
    options: {},
    outputs: {
      directories: ["types"],
      files: ["types/index.d.ts", "types/src/shape.d.ts"],
    },
  },
  {
    version: "5.6.3",
    name: "noEmit and allowImportingTsExtensions",
    options: { allowImportingTsExtensions: true, noEmit: true },
    outputs: { directories: [], files: ["tsconfig.tsbuildinfo"] },
  },
])(
  "plans a TypeScript $version project with $name",
  async ({ version, options, outputs }) => {
    const { root } = compileFixture();
    writeTsconfig(root, {
      declaration: true,
      declarationDir: "types",
      emitDeclarationOnly: !options.noEmit,
      ...options,
    });
    replaceTsc(
      root,
      `if (args.includes("--version")) console.log("Version ${version}"); else realTsc();`,
    );
    const before = listTree(root);
    const preflight = await prepareCompile(root, "pnpm");
    if (!preflight.ok) throw new Error(preflight.summary);
    expect(listTree(root)).toEqual(before);
    expect(preflight.plan.preflightTypeError).toBeUndefined();
    expect(preflight.plan.outputs).toEqual(outputs);
  },
  TIMEOUT,
);

itWithFixture(
  "reports a compiler failure written only to stderr",
  async () => {
    const { root } = compileFixture();
    writeTsconfig(root, { noEmit: true, emitDeclarationOnly: false });
    replaceTsc(
      root,
      'if (args.includes("--version")) console.log("Version 7.0.2"); else { process.stderr.write("compiler stderr diagnostic\\n"); process.exit(1); }',
    );
    expect(await prepareCompile(root, "pnpm")).toEqual({
      ok: false,
      summary: "compiler stderr diagnostic",
    });
  },
  TIMEOUT,
);

itWithFixture(
  "carries a missing root config as a preflight type error",
  async () => {
    const { root } = compileFixture();
    const preflight = await prepareCompile(root, "pnpm");
    if (!preflight.ok) throw new Error(preflight.summary);
    expect(preflight.plan.preflightTypeError).toBe(
      `error TS5058: The specified path does not exist: '${join(root, "tsconfig.json")}'.`,
    );
    expect(preflight.plan.projects[0].options).toEqual({ noEmit: true });
    expect(preflight.plan.outputs).toEqual({ directories: [], files: [] });
  },
  TIMEOUT,
);

itWithFixture(
  "refuses a missing reference",
  async () => {
    const { root } = compileFixture();
    writeJson(join(root, "tsconfig.json"), {
      compilerOptions: { noEmit: true },
      files: ["index.ts"],
      references: [{ path: "./missing" }],
    });
    const preflight = await prepareCompile(root, "pnpm");
    if (preflight.ok) throw new Error("preflight accepted a missing reference");
    expect(preflight.summary).toBe(
      `error TS5058: The specified path does not exist: '${join(root, "missing", "tsconfig.json")}'.`,
    );
  },
  TIMEOUT,
);

itWithFixture(
  "carries TS18003 for a project with no inputs",
  async () => {
    const { root } = compileFixture();
    writeJson(join(root, "tsconfig.json"), { include: ["missing/*.ts"] });
    const preflight = await prepareCompile(root, "pnpm");
    if (!preflight.ok) throw new Error(preflight.summary);
    expect(preflight.plan.preflightTypeError).toBe(noInputs(root));
    expect(preflight.plan.projects[0].sources).toEqual([]);
    expect(preflight.plan.outputs).toEqual({
      directories: [],
      files: ["tsconfig.tsbuildinfo"],
    });
  },
  TIMEOUT,
);

function noInputPackage(tsBuildInfoFile: string) {
  const fixture = compileFixture({ typescript: "5.9.3" });
  writeJson(join(fixture.parent, "base.json"), {
    compilerOptions: { composite: true, noEmit: true, tsBuildInfoFile },
  });
  writeJson(join(fixture.root, "tsconfig.json"), {
    extends: "../base.json",
    include: ["missing/*.ts"],
  });
  return fixture;
}

const probes = () =>
  readdirSync(tmpdir()).filter((name) => name.startsWith(".ph-preflight-"));

itWithFixture.each([
  "./shared/x.tsbuildinfo",
  "${configDir}/../shared/x.tsbuildinfo",
])(
  "refuses inherited TS18003 build info at %s without leaving a probe",
  async (tsBuildInfoFile) => {
    const { root, shared } = noInputPackage(tsBuildInfoFile);
    const before = probes();
    expect(await prepareCompile(root, "pnpm")).toEqual({
      ok: false,
      summary: outside(join(shared, "x.tsbuildinfo")),
    });
    expect(probes()).toEqual(before);
    expect(readdirSync(root).sort()).toEqual([
      "index.ts",
      "node_modules",
      "package.json",
      "src",
      "tsconfig.json",
    ]);
  },
  TIMEOUT,
);

itWithFixture.each(["configDir", "later base", "root"])(
  "keeps %s build-info paths on an accepted TS18003 project",
  async (kind) => {
    const { root, parent } = noInputPackage("${configDir}/cache/x.tsbuildinfo");
    if (kind !== "configDir") {
      writeJson(join(parent, "last.json"), {
        compilerOptions: {
          tsBuildInfoFile:
            kind === "root"
              ? "./shared/x.tsbuildinfo"
              : "./package/cache/x.tsbuildinfo",
        },
      });
      writeJson(join(root, "tsconfig.json"), {
        extends: ["../base.json", "../last.json"],
        ...(kind === "root" && {
          compilerOptions: { tsBuildInfoFile: "./cache/x.tsbuildinfo" },
        }),
        include: ["missing/*.ts"],
      });
    }
    const preflight = await prepareCompile(root, "pnpm");
    if (!preflight.ok) throw new Error(preflight.summary);
    expect(preflight.plan.preflightTypeError).toBe(noInputs(root));
    expect(preflight.plan.outputs).toEqual({
      directories: [],
      files: ["cache/x.tsbuildinfo"],
    });
  },
  TIMEOUT,
);

itWithFixture.each(["inputs", "no inputs"])(
  "refuses TS18003-style build info outside the package (%s)",
  async (kind) => {
    const { root, shared } = compileFixture();
    writeTsconfig(
      root,
      {
        composite: true,
        incremental: true,
        noEmit: true,
        emitDeclarationOnly: false,
        tsBuildInfoFile: "../shared/x.tsbuildinfo",
      },
      kind === "inputs" ? undefined : ["missing/*.ts"],
    );
    expect(await prepareCompile(root, "pnpm")).toEqual({
      ok: false,
      summary: outside(join(shared, "x.tsbuildinfo")),
    });
  },
  TIMEOUT,
);

itWithFixture(
  "counts the compiler calls a plan needs per reference",
  async () => {
    const { root } = compileFixture();
    writeTsconfig(root, { declaration: true, declarationDir: "types" });
    for (let index = 0; index < 3; index++)
      addReference(root, `lib${index}`, { outDir: `../generated${index}` });
    const commands = recordTsc(root);
    const preflight = await prepareCompile(root, "pnpm");
    if (!preflight.ok) throw new Error(preflight.summary);
    expect(preflight.plan.outputs).toEqual({
      directories: ["generated0", "generated1", "generated2", "types"],
      files: [
        "generated0/index.d.ts",
        "generated0/index.js",
        "generated0/tsconfig.tsbuildinfo",
        "generated1/index.d.ts",
        "generated1/index.js",
        "generated1/tsconfig.tsbuildinfo",
        "generated2/index.d.ts",
        "generated2/index.js",
        "generated2/tsconfig.tsbuildinfo",
        "tsconfig.tsbuildinfo",
        "types/index.d.ts",
        "types/src/shape.d.ts",
      ],
    });
    const list = ["--listFilesOnly", "--explainFiles", "--pretty", "false"];
    expect(commands()).toEqual([
      ["--version"],
      ...["", "lib0", "lib1", "lib2"].flatMap((directory) => {
        const config = join(root, directory, "tsconfig.json");
        return [
          ["-p", config, "--showConfig"],
          ["-p", config, ...list],
        ];
      }),
    ]);
  },
  TIMEOUT,
);
