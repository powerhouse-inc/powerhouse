import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  commonSourceDirectory,
  prepareCompile,
} from "../src/services/definitions/compiler.js";
import {
  cleanUp,
  compileFixture,
  fixtureRuns,
  relativeTo,
  writeTsconfig,
} from "./compile-fixture.js";

const itWithFixture = it.skipIf(!fixtureRuns);

afterEach(cleanUp);

const TIMEOUT = 60_000;

async function planFor(root: string) {
  const preflight = await prepareCompile(root, "pnpm");
  assert(preflight.ok, preflight.ok ? "" : preflight.summary);
  return preflight.plan;
}

itWithFixture(
  "predicts declaration outputs and build info for a declarationDir",
  async () => {
    const { root } = compileFixture();
    writeTsconfig(root, { declaration: true, declarationDir: "types" });
    const plan = await planFor(root);
    const [project] = plan.projects;
    expect(project.configFile).toBe(join(root, "tsconfig.json"));
    expect(project.emitRoot).toBe(root);
    expect(relativeTo(root, project.sources)).toEqual([
      "src/shape.ts",
      "index.ts",
    ]);
    expect(plan.outputs).toEqual({
      directories: ["types"],
      files: [
        "tsconfig.tsbuildinfo",
        "types/index.d.ts",
        "types/src/shape.d.ts",
      ],
    });
    expect(plan.preflightTypeError).toBeUndefined();
  },
  TIMEOUT,
);

itWithFixture(
  "keeps the outDir and declarationDir out of a catch-all allowJs include",
  async () => {
    const { root } = compileFixture();
    mkdirSync(join(root, "dist", "node"), { recursive: true });
    writeFileSync(
      join(root, "dist", "node", "index.mjs"),
      "export const stale = true;\n",
    );
    writeTsconfig(
      root,
      {
        declaration: true,
        declarationDir: "types",
        outDir: "dist",
        allowJs: true,
      },
      ["**/*"],
    );
    const plan = await planFor(root);
    expect(relativeTo(root, plan.projects[0].sources)).toEqual([
      "src/shape.ts",
      "index.ts",
    ]);
    expect(plan.outputs).toEqual({
      directories: ["dist", "types"],
      files: [
        "dist/tsconfig.tsbuildinfo",
        "types/index.d.ts",
        "types/src/shape.d.ts",
      ],
    });
  },
  TIMEOUT,
);

itWithFixture(
  "plans the default-include sources of a config without an include property",
  async () => {
    const { root } = compileFixture();
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
    const plan = await planFor(root);
    expect(relativeTo(root, plan.projects[0].sources).sort()).toEqual([
      "index.ts",
      "src/shape.ts",
    ]);
    expect(plan.outputs).toEqual({
      directories: [],
      files: ["tsconfig.tsbuildinfo"],
    });
  },
  TIMEOUT,
);

itWithFixture(
  "keeps noEmit with overlapping JSX destinations",
  async () => {
    const { root } = compileFixture();
    writeFileSync(join(root, "index.tsx"), "export const unused = 1;\n");
    writeTsconfig(
      root,
      { noEmit: true, emitDeclarationOnly: false, jsx: "react" },
      ["index.ts", "index.tsx", "src/**/*.ts"],
    );
    const plan = await planFor(root);
    expect(plan.outputs).toEqual({
      directories: [],
      files: ["tsconfig.tsbuildinfo"],
    });
  },
  TIMEOUT,
);

itWithFixture.each([
  { typescript: "5.9.3", emitRoot: "src", declaration: "types/shape.d.ts" },
  { typescript: "7.0.2", emitRoot: "", declaration: "types/src/shape.d.ts" },
] as const)(
  "infers the emit root as tsc $typescript does when rootDir is unset",
  async ({ typescript, emitRoot, declaration }) => {
    const { root } = compileFixture({ typescript });
    writeTsconfig(
      root,
      { rootDir: undefined, declaration: true, declarationDir: "types" },
      ["src/**/*"],
    );
    const plan = await planFor(root);
    expect(plan.projects[0].emitRoot).toBe(join(root, emitRoot));
    expect(plan.outputs.files).toEqual(["tsconfig.tsbuildinfo", declaration]);
  },
  TIMEOUT,
);

itWithFixture(
  "keeps a workspace import through a node_modules link out of the sources",
  async () => {
    const { root, shared } = compileFixture();
    writeFileSync(
      join(shared, "package.json"),
      JSON.stringify({
        name: "@probe/shared",
        type: "module",
        exports: "./x.ts",
      }),
    );
    mkdirSync(join(root, "node_modules", "@probe"));
    symlinkSync(shared, join(root, "node_modules", "@probe", "shared"), "dir");
    writeFileSync(
      join(root, "src", "workspace.ts"),
      'import { value } from "@probe/shared";\nexport const runtime = value;\n',
    );
    writeTsconfig(root, { declaration: true, declarationDir: "types" });
    expect(
      execFileSync(
        join(root, "node_modules", ".bin", "tsc"),
        ["-p", root, "--listFilesOnly"],
        { encoding: "utf8" },
      ).split("\n"),
    ).toContain(join(shared, "x.ts"));
    const plan = await planFor(root);
    const [project] = plan.projects;
    expect(relativeTo(root, project.sources)).toEqual([
      "src/shape.ts",
      "index.ts",
      "src/workspace.ts",
    ]);
    expect(plan.outputs.files).toEqual([
      "tsconfig.tsbuildinfo",
      "types/index.d.ts",
      "types/src/shape.d.ts",
      "types/src/workspace.d.ts",
    ]);
  },
  TIMEOUT,
);

itWithFixture(
  "accepts a rootDir above the package with in-package outputs",
  async () => {
    const { root } = compileFixture();
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
    const plan = await planFor(root);
    expect(plan.outputs).toEqual({
      directories: ["generated"],
      files: [
        "build.tsbuildinfo",
        "generated/package/index.d.ts",
        "generated/package/index.js",
        "generated/package/src/shape.d.ts",
        "generated/package/src/shape.js",
        "generated/shared/x.d.ts",
        "generated/shared/x.js",
      ],
    });
  },
  TIMEOUT,
);

itWithFixture(
  "keeps a sibling JSON input of a noEmit project among its sources",
  async () => {
    const { root, shared } = compileFixture();
    writeFileSync(join(shared, "data.json"), '{"value":42}\n');
    writeFileSync(
      join(root, "src", "data.ts"),
      'import data from "../../shared/data.json" with { type: "json" };\nexport const value = data.value;\n',
    );
    writeTsconfig(root, {
      rootDir: undefined,
      noEmit: true,
      emitDeclarationOnly: false,
      resolveJsonModule: true,
    });
    const plan = await planFor(root);
    const [project] = plan.projects;
    expect(relativeTo(root, project.sources)).toEqual([
      "src/shape.ts",
      "index.ts",
      "../shared/data.json",
      "src/data.ts",
    ]);
    expect(plan.outputs.files).toEqual(["tsconfig.tsbuildinfo"]);
  },
  TIMEOUT,
);

it("finds the common directory of TypeScript sources", () => {
  expect(
    commonSourceDirectory(["/pkg/src/a/x.ts", "/pkg/src/b/y.ts"], "/pkg"),
  ).toBe("/pkg/src");
  expect(commonSourceDirectory(["/pkg/src/a/x.ts"], "/pkg")).toBe("/pkg/src/a");
  expect(commonSourceDirectory([], "/pkg")).toBe("/pkg");
});
