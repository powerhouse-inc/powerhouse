import { readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";
import { it, vi } from "vitest";
import { materializeFixturePackage } from "../../../../packages/document-model/test/tooling/loader-contract.js";
import { runBuild } from "../../src/services/build.js";
export { caseInsensitive } from "../../src/services/definitions/declarations.js";
import type { BuildArgs } from "../../src/types.js";
import type { GenerationSteps } from "../../src/services/definitions/generation.js";

export type Flow = "code-first" | "schema-first";

// Relative directory symlinks need elevated rights on Windows.
export const itWithSymlinks: typeof it.skip =
  process.platform === "win32" ? it.skip : it;

export const disposals: (() => void)[] = [];

export function cleanUp(): void {
  vi.restoreAllMocks();
  for (const dispose of disposals.splice(0)) dispose();
}

export function packageWith(flow: Flow): string {
  const fixture = materializeFixturePackage("control");
  disposals.push(fixture.dispose);
  const root = fixture.root;
  if (flow === "schema-first") {
    rmSync(join(root, "powerhouse.config.json"));
    for (const file of ["invoice.ts", "catalog.ts", "decoy.ts"]) {
      rmSync(join(root, "src", file));
    }
  }
  writeFileSync(
    join(root, "index.ts"),
    flow === "code-first"
      ? `export { invoiceFamily } from "./src/invoice.js";\nexport type { Shape } from "./src/shape.js";\n`
      : `export type { Shape } from "./src/shape.js";\nexport const ready = true;\n`,
  );
  writeShape(root, "string");
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name: "ph-fixture-declarations",
      version: "0.0.0",
      type: "module",
      files: ["dist", "types"],
      exports: {
        ".": {
          types: "./types/index.d.ts",
          browser: "./dist/browser/index.js",
          import: "./dist/node/index.mjs",
        },
      },
    }),
  );
  return root;
}

export function writeShape(root: string, field: string): void {
  writeFileSync(
    join(root, "src", "shape.ts"),
    `export type Shape = { a: ${field} };\n`,
  );
}

export function writeTsconfig(
  root: string,
  options: Record<string, unknown>,
  include = ["index.ts", "src/**/*.ts"],
): void {
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        rootDir: ".",
        module: "nodenext",
        moduleResolution: "nodenext",
        target: "esnext",
        emitDeclarationOnly: true,
        skipLibCheck: true,
        ...options,
      },
      include,
    }),
  );
}

export async function build(
  root: string,
  flow: Flow,
  outDir = "dist",
  steps?: GenerationSteps,
  ignoreTypeErrors = false,
): Promise<{ exitCode: number; log: string }> {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const messages: string[] = [];
  const args: BuildArgs = {
    configFile:
      flow === "code-first" ? join(root, "powerhouse.config.json") : undefined,
    outDir,
    source: [],
    warningsAsErrors: false,
    noSharedDeps: false,
    ignoreTypeErrors,
    debug: false,
  };
  const cwd = process.cwd();
  process.chdir(root);
  try {
    const result = await runBuild(args, {
      log: (text) => messages.push(text),
      ...(steps !== undefined && { steps }),
    });
    return { exitCode: result.exitCode, log: messages.join("") };
  } finally {
    process.chdir(cwd);
  }
}

export function declarationFiles(root: string): string[] {
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter(
      (file) =>
        !file.startsWith("node_modules") &&
        !file.startsWith(".ph") &&
        /\.d\.[cm]?ts(?:\.map)?$/.test(file),
    )
    .map((file) => file.split(sep).join("/"))
    .sort();
}

export const shapeDeclaration = (field: string): string =>
  `export type Shape = {\n    a: ${field};\n};\n//# sourceMappingURL=shape.d.ts.map`;
