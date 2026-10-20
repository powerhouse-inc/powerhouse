import { createHash } from "node:crypto";
import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, sep } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createGenerationSteps } from "../src/services/definitions/build-steps.js";
import { GENERATION_DIRECTORY } from "../src/services/definitions/generation.js";
import { runBuild } from "../src/services/build.js";
import { runModelCheck } from "../src/services/model-check.js";
import {
  build,
  cleanUp,
  packageWith,
  writeTsconfig,
} from "./helpers/declarations.js";
import { recordTsc } from "./helpers/workspace.js";

afterEach(cleanUp);

function outputSnapshot(root: string): Record<string, string> {
  const output = join(root, "dist");
  return Object.fromEntries(
    readdirSync(output, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const path = join(entry.parentPath, entry.name);
        return [
          path
            .slice(output.length + 1)
            .split(sep)
            .join("/"),
          createHash("sha256").update(readFileSync(path)).digest("hex"),
        ];
      }),
  );
}

function builtPackage() {
  const root = packageWith("code-first");
  writeTsconfig(root, {
    declaration: true,
    declarationDir: "dist/types",
    incremental: true,
  });
  return root;
}

const addedExport = "export const added = 2;\n";
const indexDeclaration = (root: string) =>
  readFileSync(join(root, "dist", "types", "index.d.ts"), "utf8");

it("leaves dist unchanged when tsc reports type errors", async () => {
  const root = builtPackage();
  const first = await build(root, "code-first");
  expect(first.exitCode, first.log).toBe(0);
  const before = outputSnapshot(root);
  expect(before["types/index.d.ts"]).toBeDefined();
  appendFileSync(
    join(root, "index.ts"),
    `export const bad: number = "not a number";\n${addedExport}`,
  );
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const failed = await build(root, "code-first");
  expect(failed.exitCode, failed.log).toBe(2);
  expect(outputSnapshot(root)).toEqual(before);
}, 180_000);

it("leaves dist unchanged when the definition check fails, then writes current declarations", async () => {
  const root = builtPackage();
  const first = await build(root, "code-first");
  expect(first.exitCode, first.log).toBe(0);
  const before = outputSnapshot(root);
  appendFileSync(join(root, "index.ts"), addedExport);
  const invoice = join(root, "src", "invoice.ts");
  const valid = readFileSync(invoice, "utf8");
  writeFileSync(
    invoice,
    valid.replace(
      /id: "test\/invoice"(,[^]*?version: 2,)/,
      'id: "test/invoice-next"$1',
    ),
  );
  const failed = await build(root, "code-first");
  expect(failed.exitCode, failed.log).toBe(1);
  expect(failed.report?.diagnostics.map(({ code }) => code)).toContain(
    "PH-DM-DECLARATION-INVALID",
  );
  expect(outputSnapshot(root)).toEqual(before);
  writeFileSync(invoice, valid);
  const fixed = await build(root, "code-first");
  expect(fixed.exitCode, fixed.log).toBe(0);
  expect(indexDeclaration(root)).toContain("export declare const added = 2;");
}, 240_000);

it("leaves dist unchanged on model check --release, then the next build writes current declarations", async () => {
  const root = builtPackage();
  const first = await build(root, "code-first");
  expect(first.exitCode, first.log).toBe(0);
  const before = outputSnapshot(root);
  appendFileSync(join(root, "index.ts"), addedExport);
  const errors: string[] = [];
  const cwd = process.cwd();
  process.chdir(root);
  let code: number;
  try {
    code = await runModelCheck(
      {
        configFile: join(root, "powerhouse.config.json"),
        source: [],
        outDir: "dist",
        release: true,
        json: true,
        jsonLines: false,
        watch: false,
        warningsAsErrors: false,
        debug: undefined,
      },
      { streams: { out: () => undefined, err: (text) => errors.push(text) } },
    );
  } finally {
    process.chdir(cwd);
  }
  expect(code, errors.join("")).toBe(0);
  expect(outputSnapshot(root)).toEqual(before);
  const next = await build(root, "code-first");
  expect(next.exitCode, next.log).toBe(0);
  expect(indexDeclaration(root)).toContain("export declare const added = 2;");
}, 240_000);

it("leaves dist in place when another process clears the scratch directory during a failed build", async () => {
  const root = builtPackage();
  const first = await build(root, "code-first");
  expect(first.exitCode, first.log).toBe(0);
  const before = outputSnapshot(root);
  appendFileSync(
    join(root, "index.ts"),
    `export const bad: number = "not a number";\n${addedExport}`,
  );
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const steps = await createGenerationSteps();
  const failed = await build(root, "code-first", "dist", {
    ...steps,
    typecheck: async (request) => {
      const checked = await steps.typecheck(request);
      rmSync(join(root, GENERATION_DIRECTORY), { recursive: true });
      return checked;
    },
  });
  expect(failed.exitCode, failed.log).toBe(2);
  expect(outputSnapshot(root)).toEqual(before);
}, 180_000);

it("rebuilds incrementally after a failed build and writes the new declaration", async () => {
  const root = builtPackage();
  const compilerCalls = recordTsc(root);
  const builds = () =>
    compilerCalls().filter(([command]) => command === "--build");
  const first = await build(root, "code-first");
  expect(first.exitCode, first.log).toBe(0);
  expect(builds()).toEqual([["--build", "--force"]]);
  const index = readFileSync(join(root, "index.ts"), "utf8");
  appendFileSync(
    join(root, "index.ts"),
    `export const bad: number = "not a number";\n${addedExport}`,
  );
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const failed = await build(root, "code-first");
  expect(failed.exitCode, failed.log).toBe(2);
  writeFileSync(join(root, "index.ts"), `${index}${addedExport}`);
  const fixed = await build(root, "code-first");
  expect(fixed.exitCode, fixed.log).toBe(0);
  expect(builds()).toEqual([["--build", "--force"], ["--build"], ["--build"]]);
  expect(indexDeclaration(root)).toContain("export declare const added = 2;");
}, 240_000);

it("reports the original error when the output cannot be restored", async () => {
  const root = builtPackage();
  const first = await build(root, "code-first");
  expect(first.exitCode, first.log).toBe(0);
  appendFileSync(join(root, "index.ts"), addedExport);
  const declaration = join(root, "dist", "types", "index.d.ts");
  const steps = await createGenerationSteps();
  const messages: string[] = [];
  const cwd = process.cwd();
  process.chdir(root);
  try {
    await expect(
      runBuild(
        {
          configFile: join(root, "powerhouse.config.json"),
          outDir: "dist",
          source: [],
          warningsAsErrors: false,
          noSharedDeps: false,
          ignoreTypeErrors: false,
          debug: false,
        },
        {
          log: (text) => messages.push(text),
          steps: {
            ...steps,
            typecheck: async (request) => {
              await steps.typecheck(request);
              rmSync(declaration);
              mkdirSync(declaration);
              throw new Error("the compiler step failed");
            },
          },
        },
      ),
    ).rejects.toThrow("the compiler step failed");
  } finally {
    process.chdir(cwd);
  }
  expect(messages.join("")).toContain(
    "✘ The previous compiler output could not be restored: EISDIR",
  );
}, 180_000);
