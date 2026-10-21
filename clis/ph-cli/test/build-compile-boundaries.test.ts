import fs, {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
  rmSync,
  realpathSync,
  readlinkSync,
} from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  build,
  cleanUp,
  itWithSymlinks,
  writeTsconfig,
  type Flow,
  packageWith,
} from "./helpers/declarations.js";
import { importRuntime } from "./helpers/loader-cases.js";
import {
  plainCompile,
  siblingPackage,
  noInputProbe,
  addReference,
  recordTsc,
} from "./helpers/workspace.js";
import { syncBuiltinESMExports } from "node:module";

afterEach(cleanUp);

describe.each<Flow>(["code-first", "schema-first"])(
  "%s compile boundaries",
  (flow) => {
    it("accepts noEmit with sibling sources and leaves the sibling untouched", async () => {
      const { root, shared } = siblingPackage(flow);
      writeTsconfig(
        root,
        { rootDir: undefined, noEmit: true, emitDeclarationOnly: false },
        ["index.ts", "src/**/*.ts", "../shared/*.ts"],
      );
      if (flow === "code-first") importRuntime(root, "../../shared/x.js");
      expect(plainCompile(root).status).toBe(0);
      const result = await build(root, flow);
      expect(result.exitCode, result.log).toBe(0);
      expect(readdirSync(shared)).toEqual(["x.ts"]);
      expect(readFileSync(join(shared, "x.ts"), "utf8")).toBe(
        "export const value = 42;\n",
      );
    }, 120_000);

    it.each([false, true])(
      "refuses an emitting sibling source before any write (ignore errors: %s)",
      async (ignore) => {
        const { root, shared } = siblingPackage(flow);
        writeTsconfig(
          root,
          {
            rootDir: undefined,
            declaration: true,
            emitDeclarationOnly: false,
          },
          ["index.ts", "src/**/*.ts", "../shared/*.ts"],
        );
        mkdirSync(join(root, ".ph", "build"), { recursive: true });
        writeFileSync(join(root, ".ph", "build", "sentinel.txt"), "keep\n");
        const result = await build(root, flow, "dist", undefined, ignore);
        expect(result.exitCode).toBe(2);
        expect(result.log).toContain("outside the package");
        expect(readdirSync(shared)).toEqual(["x.ts"]);
        expect(
          readFileSync(join(root, ".ph", "build", "sentinel.txt"), "utf8"),
        ).toBe("keep\n");
        expect(existsSync(join(root, "index.js"))).toBe(false);
        expect(existsSync(join(root, "dist"))).toBe(false);
      },
      120_000,
    );

    it("accepts a rootDir above the package with in-package outputs", async () => {
      const { root, shared } = siblingPackage(flow);
      writeTsconfig(
        root,
        {
          rootDir: "..",
          declaration: true,
          outDir: "generated",
          emitDeclarationOnly: false,
          tsBuildInfoFile: "build.tsbuildinfo",
        },
        ["index.ts", "src/**/*.ts", "../shared/*.ts"],
      );
      if (flow === "code-first") importRuntime(root, "../../shared/x.js");
      const result = await build(root, flow);
      expect(result.exitCode, result.log).toBe(0);
      expect(existsSync(join(root, "build.tsbuildinfo"))).toBe(true);
      expect(
        readFileSync(join(root, "generated", "shared", "x.js"), "utf8"),
      ).toBe(
        '"use strict";\nObject.defineProperty(exports, "__esModule", { value: true });\nexports.value = void 0;\nexports.value = 42;\n',
      );
      expect(readdirSync(shared)).toEqual(["x.ts"]);
    }, 120_000);

    itWithSymlinks(
      "accepts a workspace import through node_modules without emitting sibling sources",
      async () => {
        const { root, shared } = siblingPackage(flow);
        writeFileSync(
          join(shared, "package.json"),
          JSON.stringify({
            name: "@probe/shared",
            type: "module",
            exports: "./x.ts",
          }),
        );
        mkdirSync(join(root, "node_modules", "@probe"));
        symlinkSync(shared, join(root, "node_modules", "@probe", "shared"));
        writeFileSync(
          join(root, "src", "workspace.ts"),
          'import { value } from "@probe/shared";\nexport const runtime = value;\n',
        );
        writeTsconfig(root, { declaration: true, declarationDir: "types" });
        const result = await build(root, flow);
        expect(result.exitCode, result.log).toBe(0);
        expect(readdirSync(shared).sort()).toEqual(["package.json", "x.ts"]);
      },
      120_000,
    );
  },
);

it.each([
  {
    name: "outDir",
    options: { outDir: "../shared/out", emitDeclarationOnly: false },
  },
  {
    name: "declarationDir",
    options: { declaration: true, declarationDir: "../shared/types" },
  },
  {
    name: "explicit build info",
    options: {
      noEmit: true,
      emitDeclarationOnly: false,
      tsBuildInfoFile: "../shared/info.tsbuildinfo",
    },
  },
  {
    name: "default build info",
    options: {
      rootDir: "src/deeper",
      outDir: "generated",
      emitDeclarationOnly: false,
      noEmit: true,
    },
  },
])(
  "refuses an outside $name before compiling any project",
  async ({ options }) => {
    const { root, shared } = siblingPackage("schema-first");
    mkdirSync(join(root, "src", "deeper"));
    writeFileSync(join(root, "src", "deeper", "x.ts"), "export const x = 1;\n");
    writeTsconfig(root, options, ["src/deeper/x.ts"]);
    const result = await build(root, "schema-first", "dist", undefined, true);
    expect(result.exitCode).toBe(2);
    expect(result.log).toContain("outside the package");
    expect(readdirSync(shared)).toEqual(["x.ts"]);
    expect(existsSync(join(root, "generated"))).toBe(false);
  },
  120_000,
);

it("preflights recursive in-package references before any reference writes", async () => {
  const { root, shared } = siblingPackage("schema-first");
  for (const dir of ["lib", "deep"]) {
    mkdirSync(join(root, dir));
    writeFileSync(join(root, dir, "x.ts"), "export const value = 42;\n");
    writeFileSync(
      join(root, dir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          composite: true,
          rootDir: ".",
          outDir: dir === "deep" ? "../../shared/out" : "../generated/lib",
        },
        files: ["x.ts"],
        ...(dir === "lib" && { references: [{ path: "../deep" }] }),
      }),
    );
  }
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({ files: [], references: [{ path: "./lib" }] }),
  );
  const result = await build(root, "schema-first", "dist", undefined, true);
  expect(result.exitCode).toBe(2);
  expect(result.log).toContain("outside the package");
  expect(readdirSync(shared)).toEqual(["x.ts"]);
  expect(existsSync(join(root, "generated"))).toBe(false);
}, 120_000);

it("builds outside references in place and reloads their runtime on each build", async () => {
  const { root, shared } = siblingPackage("code-first");
  writeFileSync(join(shared, "package.json"), '{"type":"module"}');
  writeFileSync(
    join(shared, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        composite: true,
        rootDir: ".",
        module: "nodenext",
        target: "esnext",
      },
      files: ["x.ts"],
    }),
  );
  writeFileSync(join(shared, "x.ts"), "export const value: number = 42;\n");
  writeTsconfig(root, {
    declaration: true,
    outDir: "generated",
    emitDeclarationOnly: false,
  });
  const config = JSON.parse(
    readFileSync(join(root, "tsconfig.json"), "utf8"),
  ) as { compilerOptions: Record<string, unknown>; include: string[] };
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({ ...config, references: [{ path: "../shared" }] }),
  );
  importRuntime(root, "../../shared/x.js");
  const first = await build(root, "code-first");
  expect(first.exitCode, first.log).toBe(0);
  const approval = z
    .object({
      sources: z.array(z.string()),
      compilerOutputs: z.object({
        files: z.array(z.string()),
        directories: z.array(z.string()),
      }),
    })
    .parse(
      JSON.parse(
        readFileSync(
          join(root, ".ph", "build", "release-approval.json"),
          "utf8",
        ),
      ),
    );
  expect(
    [
      ...approval.sources,
      ...approval.compilerOutputs.files,
      ...approval.compilerOutputs.directories,
    ].filter((path) => path.startsWith("../")),
  ).toEqual([]);
  expect(readFileSync(join(shared, "x.js"), "utf8")).toBe(
    "export const value = 42;\n",
  );
  expect(readFileSync(join(shared, "x.d.ts"), "utf8")).toBe(
    "export declare const value: number;\n",
  );
  writeFileSync(join(shared, "x.ts"), "export const value: number = 41;\n");
  const second = await build(root, "code-first");
  expect(second.exitCode, second.log).toBe(2);
  expect(readFileSync(join(shared, "x.js"), "utf8")).toBe(
    "export const value = 41;\n",
  );
}, 120_000);

it("loads a noEmit definition's sibling JSON without writing to the sibling", async () => {
  const { root, shared } = siblingPackage("code-first");
  writeFileSync(join(shared, "data.json"), '{"value":42}\n');
  const invoice = join(root, "src", "invoice.ts");
  writeFileSync(
    invoice,
    `import data from "../../shared/data.json" with { type: "json" };\nif (data.value !== 42) throw new Error("wrong JSON value");\n${readFileSync(invoice, "utf8")}`,
  );
  writeTsconfig(root, {
    rootDir: undefined,
    noEmit: true,
    emitDeclarationOnly: false,
    resolveJsonModule: true,
  });
  const main = plainCompile(root);
  expect(main.status, main.output).toBe(0);
  const result = await build(root, "code-first");
  expect(result.exitCode, result.log).toBe(0);
  expect(readdirSync(shared).sort()).toEqual(["data.json", "x.ts"]);
  expect(readFileSync(join(shared, "data.json"), "utf8")).toBe(
    '{"value":42}\n',
  );
}, 120_000);

describe("unreadable configs", () => {
  afterEach(cleanUp);

  it.each(
    ["missing config", "missing reference", "no inputs"].flatMap((kind) =>
      [false, true].map((ignore) => ({ kind, ignore })),
    ),
  )(
    "reports tsc diagnostics for $kind with ignore-type-errors=$ignore",
    async ({ kind, ignore }) => {
      const root = packageWith("schema-first");
      writeTsconfig(root, { noEmit: true, emitDeclarationOnly: false });
      const config = join(root, "tsconfig.json");
      if (kind === "missing config") rmSync(config);
      if (kind === "missing reference")
        writeFileSync(
          config,
          '{"compilerOptions":{"noEmit":true},"files":["index.ts"],"references":[{"path":"./missing"}]}',
        );
      if (kind === "no inputs")
        writeFileSync(config, '{"include":["missing/*.ts"]}');
      const main = plainCompile(root);
      expect(main.status, main.output).not.toBe(0);
      const result = await build(
        root,
        "schema-first",
        "dist",
        undefined,
        ignore,
      );
      expect(result.exitCode, result.log).toBe(
        ignore && kind !== "missing reference" ? 0 : 2,
      );
      expect(result.log).toMatch(
        kind === "no inputs" ? /TS18003/ : /TS6053|TS5083|TS5058/,
      );
      expect(result.log).not.toMatch(/ENOENT|tsc listed no program files/);
      if (kind === "missing reference") {
        expect(result.log).toContain("--ignore-type-errors cannot bypass");
        expect(existsSync(join(root, "index.js"))).toBe(false);
      }
    },
    120_000,
  );
});

describe("write-free config probes", () => {
  afterEach(cleanUp);

  itWithSymlinks.each(["relative", "configDir"] as const)(
    "keeps TS18003 preflight write-free with inherited %s paths",
    async (kind) => {
      const { root, sentinel } = noInputProbe(kind);
      const canonicalRoot = realpathSync(root) + sep;
      const writes: string[] = [];
      const probes: string[] = [];
      const originalWrite = fs.writeFileSync;
      const writeSpy = vi
        .spyOn(fs, "writeFileSync")
        .mockImplementation((...args: Parameters<typeof fs.writeFileSync>) => {
          if (String(args[0]).includes(".ph-preflight-"))
            probes.push(String(args[0]));
          if (
            String(args[0]).startsWith(canonicalRoot) &&
            String(args[0]).includes(".ph-preflight-")
          )
            writes.push(String(args[0]));
          return originalWrite(...args);
        });
      syncBuiltinESMExports();
      try {
        const result = await build(
          root,
          "schema-first",
          "dist",
          undefined,
          true,
        );
        expect(result.exitCode, result.log).toBe(2);
        expect(result.log).toContain("outside the package");
        expect(result.log).toContain(realpathSync(sentinel));
        expect(readFileSync(sentinel, "utf8")).toBe("protected\n");
        expect(writes).toEqual([]);
        expect(probes.map((probe) => existsSync(dirname(probe)))).toEqual([
          false,
        ]);
      } finally {
        writeSpy.mockRestore();
        syncBuiltinESMExports();
      }
    },
    120_000,
  );

  itWithSymlinks.each(["configDir", "later base", "root"])(
    "preserves %s build-info paths on an accepted TS18003 build",
    async (kind) => {
      const { root } = noInputProbe("configDir");
      if (kind === "configDir")
        writeFileSync(
          join(dirname(root), "base.json"),
          JSON.stringify({
            compilerOptions: {
              composite: true,
              noEmit: true,
              tsBuildInfoFile: "${configDir}/cache/x.tsbuildinfo",
            },
          }),
        );
      if (kind !== "configDir") {
        writeFileSync(
          join(dirname(root), "last.json"),
          JSON.stringify({
            compilerOptions: {
              tsBuildInfoFile:
                kind === "root"
                  ? "./shared/x.tsbuildinfo"
                  : "./package/cache/x.tsbuildinfo",
            },
          }),
        );
        writeFileSync(
          join(root, "tsconfig.json"),
          JSON.stringify({
            extends: ["../base.json", "../last.json"],
            ...(kind === "root" && {
              compilerOptions: { tsBuildInfoFile: "./cache/x.tsbuildinfo" },
            }),
            include: ["missing/*.ts"],
          }),
        );
      }
      const result = await build(root, "schema-first", "dist", undefined, true);
      expect(result.exitCode, result.log).toBe(0);
      expect(result.log).toContain("TS18003");
      expect(result.compilerOutputs?.files).toEqual(["cache/x.tsbuildinfo"]);
      expect(existsSync(join(root, "cache/x.tsbuildinfo"))).toBe(false);
    },
    120_000,
  );
});

describe("generated reference inputs", () => {
  afterEach(cleanUp);

  itWithSymlinks.each(["ordered", "reversed"])(
    "refreshes a sibling include before every writing compile (%s references)",
    async (order) => {
      const { root, shared } = siblingPackage("schema-first");
      writeTsconfig(root, { noEmit: true, emitDeclarationOnly: false });
      for (const directory of ["a", "b", "btypes/generated"])
        mkdirSync(join(root, directory), { recursive: true });
      writeFileSync(join(root, "a", "index.ts"), "export const value = 42;\n");
      writeFileSync(
        join(root, "a", "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            composite: true,
            rootDir: ".",
            outDir: "../generated",
            declarationDir: "../atypes",
            module: "nodenext",
          },
          files: ["index.ts"],
        }),
      );
      writeFileSync(join(root, "b", "index.ts"), "export const other = 7;\n");
      writeFileSync(
        join(root, "b", "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            composite: true,
            rootDir: "..",
            allowJs: true,
            emitDeclarationOnly: true,
            declarationDir: "../btypes",
            module: "nodenext",
          },
          include: ["index.ts", "../generated/*.js"],
        }),
      );
      const config = join(root, "tsconfig.json");
      writeFileSync(
        config,
        readFileSync(config, "utf8").replace(
          /}$/,
          order === "ordered"
            ? ',"references":[{"path":"./a"},{"path":"./b"}]}'
            : ',"references":[{"path":"./b"},{"path":"./a"}]}',
        ),
      );
      const protectedFile = join(shared, "protected.d.ts");
      writeFileSync(protectedFile, "protected\n");
      symlinkSync(
        protectedFile,
        join(root, "btypes", "generated", "index.d.ts"),
      );
      const compilerCalls = recordTsc(root);
      const result = await build(root, "schema-first");
      expect(result.exitCode, result.log).toBe(2);
      expect(result.log).toContain("outside the package");
      expect(readFileSync(protectedFile, "utf8")).toBe("protected\n");
      expect(
        compilerCalls()
          .filter(([command]) => command === "--build")
          .map(([, project]) => relative(realpathSync(root), project)),
      ).toEqual(
        order === "reversed"
          ? [join("b", "tsconfig.json"), join("a", "tsconfig.json")]
          : [join("a", "tsconfig.json")],
      );
      expect(existsSync(join(root, "btypes", "b"))).toBe(false);
    },
    120_000,
  );
});

describe("compiler graph changes", () => {
  afterEach(cleanUp);

  it.each(["inputs", "empty solution"])(
    "refreshes options after a reference copies a sibling tsconfig (%s root)",
    async (kind) => {
      const { root, shared } = siblingPackage("schema-first");
      writeTsconfig(
        root,
        { noEmit: true, emitDeclarationOnly: false },
        kind === "inputs" ? ["index.ts", "src/**/*.ts"] : ["missing/*.ts"],
      );
      for (const directory of ["a/src", "b"])
        mkdirSync(join(root, directory), { recursive: true });
      writeFileSync(
        join(root, "a/src/index.ts"),
        'import config from "./tsconfig.json" with { type: "json" }; export { config };\n',
      );
      writeFileSync(
        join(root, "a/src/tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            composite: true,
            rootDir: ".",
            outDir: "../../shared",
            module: "nodenext",
          },
          files: ["index.ts"],
        }),
      );
      writeFileSync(
        join(root, "a/tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            composite: true,
            rootDir: "src",
            outDir: "../b",
            tsBuildInfoFile: "a.tsbuildinfo",
            resolveJsonModule: true,
            module: "nodenext",
          },
          files: ["src/index.ts", "src/tsconfig.json"],
        }),
      );
      writeFileSync(join(root, "b/index.ts"), "export const value = 42;\n");
      writeFileSync(
        join(root, "b/tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            composite: true,
            rootDir: ".",
            outDir: "out",
            module: "nodenext",
          },
          files: ["index.ts"],
        }),
      );
      const config = join(root, "tsconfig.json");
      writeFileSync(
        config,
        readFileSync(config, "utf8").replace(
          /}$/,
          ',"references":[{"path":"./a"},{"path":"./b"}]}',
        ),
      );
      const sentinel = join(shared, "index.js");
      writeFileSync(sentinel, "protected\n");
      const result = await build(
        root,
        "schema-first",
        "dist",
        undefined,
        kind === "empty solution",
      );
      expect(result.exitCode, result.log).toBe(2);
      expect(result.log).toContain("outside the package");
      expect(readFileSync(sentinel, "utf8")).toBe("protected\n");
    },
    120_000,
  );

  it.each([false, true])(
    "validates TS18003 build-info writes with ignore-type-errors=%s",
    async (ignore) => {
      const { root, shared } = siblingPackage("schema-first");
      const sentinel = join(shared, "x.tsbuildinfo");
      writeFileSync(sentinel, "protected\n");
      writeTsconfig(
        root,
        {
          composite: true,
          incremental: true,
          noEmit: true,
          emitDeclarationOnly: false,
          tsBuildInfoFile: "../shared/x.tsbuildinfo",
        },
        ["missing/*.ts"],
      );
      const result = await build(
        root,
        "schema-first",
        "dist",
        undefined,
        ignore,
      );
      expect(result.exitCode, result.log).toBe(2);
      expect(result.log).toContain("outside the package");
      expect(readFileSync(sentinel, "utf8")).toBe("protected\n");
    },
    120_000,
  );
});

describe("compiler write boundaries", () => {
  afterEach(cleanUp);

  itWithSymlinks(
    "checks an explicitly listed node_modules source's output before writing",
    async () => {
      const { root, shared } = siblingPackage("schema-first");
      writeFileSync(
        join(root, "node_modules", "raw.ts"),
        "export const value = 42;\n",
      );
      writeFileSync(
        join(root, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            rootDir: ".",
            module: "nodenext",
            outDir: "generated",
            skipLibCheck: true,
          },
          files: ["index.ts", "node_modules/raw.ts"],
        }),
      );
      mkdirSync(join(root, "generated", "node_modules"), { recursive: true });
      const protectedFile = join(shared, "protected.js");
      writeFileSync(protectedFile, "protected\n");
      symlinkSync(
        protectedFile,
        join(root, "generated", "node_modules", "raw.js"),
      );
      const result = await build(root, "schema-first", "dist", undefined, true);
      expect(result.exitCode, result.log).toBe(2);
      expect(result.log).toContain("outside the package");
      expect(readFileSync(protectedFile, "utf8")).toBe("protected\n");
      expect(existsSync(join(root, "generated", "index.js"))).toBe(false);
    },
    120_000,
  );
});

describe("compiler write boundaries", () => {
  afterEach(cleanUp);

  itWithSymlinks.each(["external", "scratch"])(
    "refuses a newly discovered reference-fed output linked into %s",
    async (destination) => {
      const { root, shared } = siblingPackage("schema-first");
      writeTsconfig(root, {
        declaration: true,
        declarationDir: "roottypes",
        allowJs: true,
      });
      addReference(root, "lib", {
        compilerOptions: {
          outDir: "../inputs",
          declarationDir: "../libtypes",
        },
        files: ["index.ts"],
        source: "export const value: number = 42;\n",
      });
      writeFileSync(
        join(root, "index.ts"),
        'export { value } from "./inputs/index.js";\n',
      );
      mkdirSync(join(root, "roottypes", "inputs"), { recursive: true });
      const external = join(shared, "protected.d.ts");
      writeFileSync(external, "protected\n");
      symlinkSync(
        destination === "external"
          ? external
          : join(root, ".ph", "build", "protected.d.ts"),
        join(root, "roottypes", "inputs", "index.d.ts"),
      );
      const result = await build(root, "schema-first", "dist", undefined, true);
      expect(result.exitCode, result.log).toBe(2);
      expect(result.log).toContain(
        destination === "external" ? "outside the package" : "inside .ph/build",
      );
      expect(readFileSync(external, "utf8")).toBe("protected\n");
      expect(existsSync(join(root, "roottypes", "index.d.ts"))).toBe(false);
    },
    120_000,
  );

  itWithSymlinks(
    "walks dangling, cyclic and scratch aliases in compiler output trees",
    async () => {
      const root = packageWith("code-first");
      writeTsconfig(root, { declaration: true, declarationDir: "types" });
      mkdirSync(join(root, "types"));
      mkdirSync(join(root, ".ph", "build"), { recursive: true });
      symlinkSync("missing", join(root, "types", "dangling"));
      symlinkSync(".", join(root, "types", "loop"));
      symlinkSync("../.ph/build", join(root, "types", "scratch"));
      const result = await build(root, "code-first");
      expect(result.exitCode, result.log).toBe(0);
      expect(readlinkSync(join(root, "types", "scratch"))).toBe("../.ph/build");
    },
    120_000,
  );
});
