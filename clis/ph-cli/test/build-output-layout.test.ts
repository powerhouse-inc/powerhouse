import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  build,
  cleanUp,
  packageWith,
  writeTsconfig,
} from "./helpers/declarations.js";
import { plainCompile } from "./helpers/workspace.js";
import { createGenerationSteps } from "../src/services/definitions/build-steps.js";

afterEach(cleanUp);

const layouts = [
  {
    name: "outDir",
    options: { outDir: "generated", declaration: true },
    inputs: ["index.ts", "src/shape.ts"],
    outputs: [
      "generated/index.d.ts",
      "generated/index.js",
      "generated/src/shape.d.ts",
      "generated/src/shape.js",
      "generated/tsconfig.tsbuildinfo",
    ],
  },
  {
    name: "declarationDir",
    options: {
      declaration: true,
      declarationDir: "types",
      emitDeclarationOnly: true,
    },
    inputs: ["index.ts", "src/shape.ts"],
    outputs: [
      "tsconfig.tsbuildinfo",
      "types/index.d.ts",
      "types/src/shape.d.ts",
    ],
  },
  {
    name: "beside sources",
    options: { declaration: true },
    inputs: ["index.ts", "src/shape.ts"],
    outputs: [
      "index.d.ts",
      "index.js",
      "src/shape.d.ts",
      "src/shape.js",
      "tsconfig.tsbuildinfo",
    ],
  },
  {
    name: "unset rootDir",
    options: { rootDir: undefined, outDir: "generated", declaration: true },
    inputs: ["index.ts", "src/shape.ts"],
    outputs: [
      "generated/index.d.ts",
      "generated/index.js",
      "generated/src/shape.d.ts",
      "generated/src/shape.js",
      "generated/tsconfig.tsbuildinfo",
    ],
  },
  {
    name: "nested unset rootDir",
    options: { rootDir: undefined, outDir: "generated", declaration: true },
    inputs: ["src/shape.ts"],
    outputs: [
      "generated/shape.d.ts",
      "generated/shape.js",
      "generated/tsconfig.tsbuildinfo",
    ],
  },
  {
    name: "set rootDir",
    options: { rootDir: "src", outDir: "generated", declaration: true },
    inputs: ["src/shape.ts"],
    outputs: [
      "generated/shape.d.ts",
      "generated/shape.js",
      "tsconfig.tsbuildinfo",
    ],
  },
  {
    name: "mts and cts maps",
    options: {
      outDir: "generated",
      declaration: true,
      declarationMap: true,
      sourceMap: true,
    },
    inputs: ["src/module.mts", "src/module.cts"],
    outputs: [
      "generated/src/module.cjs",
      "generated/src/module.cjs.map",
      "generated/src/module.d.cts",
      "generated/src/module.d.cts.map",
      "generated/src/module.d.mts",
      "generated/src/module.d.mts.map",
      "generated/src/module.mjs",
      "generated/src/module.mjs.map",
      "generated/tsconfig.tsbuildinfo",
    ],
  },
  {
    name: "jsx preserve",
    options: { outDir: "generated", declaration: true, jsx: "preserve" },
    inputs: ["src/view.tsx"],
    outputs: [
      "generated/src/view.d.ts",
      "generated/src/view.jsx",
      "generated/tsconfig.tsbuildinfo",
    ],
  },
  {
    name: "JSON output",
    options: { outDir: "generated", resolveJsonModule: true },
    inputs: ["src/data.json"],
    outputs: ["generated/src/data.json", "generated/tsconfig.tsbuildinfo"],
  },
  {
    name: "JSON beside source",
    options: { resolveJsonModule: true },
    inputs: ["src/data.json"],
    outputs: ["tsconfig.tsbuildinfo"],
  },
  {
    name: "composite build info",
    options: { rootDir: undefined, outDir: "generated", composite: true },
    inputs: ["src/shape.ts"],
    outputs: [
      "generated/src/shape.d.ts",
      "generated/src/shape.js",
      "generated/tsconfig.tsbuildinfo",
    ],
  },
  {
    name: "explicit build info",
    options: { noEmit: true, tsBuildInfoFile: "cache/state.info" },
    inputs: ["src/shape.ts"],
    outputs: ["cache/state.info"],
  },
];

describe.each(["5.9.3", "7.0.2"])(
  "TypeScript %s output inventory",
  (version) => {
    it.each(layouts)(
      "matches real tsc for $name",
      async ({ name, options, inputs, outputs }) => {
        const root = packageWith("schema-first");
        const typescript = join(root, "node_modules", "typescript");
        rmSync(typescript);
        symlinkSync(
          resolve(
            import.meta.dirname,
            `../../../node_modules/.pnpm/typescript@${version}/node_modules/typescript`,
          ),
          typescript,
          process.platform === "win32" ? "junction" : undefined,
        );
        rmSync(join(root, "node_modules", ".bin", "tsc"));
        symlinkSync(
          join(typescript, "bin", "tsc"),
          join(root, "node_modules", ".bin", "tsc"),
        );
        for (const file of ["module.mts", "module.cts", "view.tsx"])
          writeFileSync(join(root, "src", file), "export const value = 42;\n");
        writeFileSync(join(root, "src", "data.json"), '{"value":42}\n');
        mkdirSync(join(root, "cache"));
        writeTsconfig(root, { emitDeclarationOnly: false, ...options }, inputs);
        const expected =
          version === "7.0.2" && name === "nested unset rootDir"
            ? [
                "generated/src/shape.d.ts",
                "generated/src/shape.js",
                "generated/tsconfig.tsbuildinfo",
              ]
            : outputs;
        const steps = await createGenerationSteps({
          ignoreTypeErrors:
            name === "nested unset rootDir" && version === "7.0.2",
        });
        const built = await build(
          root,
          "schema-first",
          "dist",
          {
            ...steps,
            preflight: async (...request) => {
              const checked = await steps.preflight(...request);
              assert(checked.ok);
              expect(checked.plan.outputs.files).toEqual(expected);
              return checked;
            },
          },
          name === "nested unset rootDir" && version === "7.0.2",
        );
        expect(built.exitCode, built.log).toBe(0);
        for (const path of expected)
          expect(existsSync(join(root, path)), path).toBe(true);
        const main = plainCompile(root);
        expect(main.status, main.output).toBe(
          name === "nested unset rootDir" && version === "7.0.2" ? 2 : 0,
        );
        if (options.outDir === "generated") {
          const actual = readdirSync(join(root, "generated"), {
            recursive: true,
            withFileTypes: true,
          })
            .filter((entry) => entry.isFile())
            .map((entry) =>
              join(entry.parentPath, entry.name)
                .slice(root.length + 1)
                .replaceAll("\\", "/"),
            )
            .sort();
          expect(actual).toEqual(
            expected.filter((path) => path.startsWith("generated/")),
          );
        }
      },
      120_000,
    );
  },
);
