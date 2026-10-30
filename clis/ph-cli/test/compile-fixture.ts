import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { z } from "zod";
import { canonicalPath } from "../src/services/definitions/paths.js";

const workspaceModules = resolve(import.meta.dirname, "../../../node_modules");
// 7.0.2 is the workspace's own TypeScript; 5.9.3 reaches the pnpm store only
// as another package's dependency.
const compilers = {
  "7.0.2": join(workspaceModules, "typescript"),
  "5.9.3": join(
    workspaceModules,
    ".pnpm/typescript@5.9.3/node_modules/typescript",
  ),
} as const;

function installedCompiler(version: keyof typeof compilers): string {
  const directory = compilers[version];
  const manifest = join(directory, "package.json");
  const installed = existsSync(manifest)
    ? z
        .object({ version: z.string() })
        .safeParse(JSON.parse(readFileSync(manifest, "utf8")))
    : undefined;
  if (!installed?.success || installed.data.version !== version) {
    throw new Error(
      `The compile fixture expects TypeScript ${version} at ${directory}. Update its compilers table and the tests that name ${version}.`,
    );
  }
  return directory;
}

/**
 * Whether the fixture works here. It links the compiler with POSIX symlinks
 * and runs its extensionless bin script, which Windows cannot.
 */
export const fixtureRuns = process.platform !== "win32";

const disposals: (() => void)[] = [];

export function cleanUp(): void {
  for (const dispose of disposals.splice(0)) dispose();
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value));
}

/**
 * A package at `<parent>/package` with a sibling `<parent>/shared/x.ts`, so
 * a test can point the compiler outside the package.
 */
export function compileFixture(
  options: {
    readonly typescript?: keyof typeof compilers;
    readonly name?: string;
  } = {},
): { readonly root: string; readonly parent: string; readonly shared: string } {
  if (!fixtureRuns) {
    throw new Error(
      "The compile fixture cannot run on this platform; gate the test on fixtureRuns.",
    );
  }
  const parent = canonicalPath(mkdtempSync(join(tmpdir(), "ph-compile-plan-")));
  disposals.push(() => rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, options.name ?? "package");
  const shared = join(parent, "shared");
  mkdirSync(join(root, "node_modules", ".bin"), { recursive: true });
  mkdirSync(join(root, "src"));
  mkdirSync(shared);
  const compiler = installedCompiler(options.typescript ?? "7.0.2");
  symlinkSync(compiler, join(root, "node_modules", "typescript"), "dir");
  symlinkSync(
    join(compiler, "bin", "tsc"),
    join(root, "node_modules", ".bin", "tsc"),
  );
  writeJson(join(root, "package.json"), {
    name: "ph-compile-plan-fixture",
    version: "0.0.0",
    type: "module",
  });
  writeFileSync(
    join(root, "index.ts"),
    'export type { Shape } from "./src/shape.js";\nexport const ready = true;\n',
  );
  writeFileSync(
    join(root, "src", "shape.ts"),
    "export type Shape = { a: string };\n",
  );
  writeFileSync(join(shared, "x.ts"), "export const value = 42;\n");
  return { root, parent, shared };
}

export function writeTsconfig(
  root: string,
  options: Record<string, unknown>,
  include = ["index.ts", "src/**/*.ts"],
  extra: Record<string, unknown> = {},
): void {
  writeJson(join(root, "tsconfig.json"), {
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
    ...extra,
  });
}

export function addReference(
  root: string,
  directory: string,
  compilerOptions: Record<string, unknown> = {},
): void {
  const target = resolve(root, directory);
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, "index.ts"), "export const value = 42;\n");
  writeJson(join(target, "tsconfig.json"), {
    compilerOptions: {
      composite: true,
      rootDir: ".",
      outDir: "out",
      module: "nodenext",
      target: "esnext",
      ...compilerOptions,
    },
    files: ["index.ts"],
  });
  const file = join(root, "tsconfig.json");
  const config = z
    .looseObject({
      references: z.array(z.object({ path: z.string() })).optional(),
    })
    .parse(JSON.parse(readFileSync(file, "utf8")));
  config.references = [...(config.references ?? []), { path: directory }];
  writeJson(file, config);
}

/** Replaces the package's tsc with a node script; `body` sees `args`. */
export function replaceTsc(root: string, body: string): void {
  const bin = join(root, "node_modules", ".bin", "tsc");
  rmSync(bin);
  writeFileSync(
    bin,
    [
      "#!/usr/bin/env node",
      "const args = process.argv.slice(2);",
      `const realTsc = () => process.exit(require("node:child_process").spawnSync(process.execPath, [${JSON.stringify(join(root, "node_modules", "typescript", "bin", "tsc"))}, ...args], { stdio: "inherit" }).status ?? 1);`,
      body,
      "",
    ].join("\n"),
  );
  chmodSync(bin, 0o755);
}

export function recordTsc(root: string): () => string[][] {
  const log = join(root, "node_modules", "commands.jsonl");
  writeFileSync(log, "");
  replaceTsc(
    root,
    `require("node:fs").appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + "\\n");\nrealTsc();`,
  );
  return () =>
    readFileSync(log, "utf8")
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => z.array(z.string()).parse(JSON.parse(line)));
}

export function relativeTo(root: string, paths: readonly string[]): string[] {
  return paths.map((path) => relative(root, path).replaceAll("\\", "/"));
}
