import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { LEDGER_SOURCE } from "./model-project.js";

const FIXTURES = join(import.meta.dirname, "fixtures");
const PH_CLI = join(import.meta.dirname, "..", "dist", "cli.mjs");

const REAL_TSC = join(
  dirname(
    createRequire(
      join(import.meta.dirname, "..", "..", "..", "package.json"),
    ).resolve("typescript/package.json"),
  ),
  "bin",
  "tsc",
);

/** Lines a stub `tsc` appends: its arguments, then what it saw before running. */
const TSC_LOG = "tsc-calls.jsonl";

// Records each call and what the declarations held when it began, then runs
// the real tsc. PH_TEST_TSC_HANG makes `--build` run tsc and then hang, as a
// tsc killed after it wrote is left.
const TSC_STUB = `import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const args = process.argv.slice(2);
const declarations = "dist/types/index.d.ts";
appendFileSync(${JSON.stringify(TSC_LOG)}, JSON.stringify({
  args,
  cwd: process.cwd(),
  declarations: existsSync(declarations) ? readFileSync(declarations, "utf8") : null,
}) + "\\n");
const result = spawnSync(process.execPath, [${JSON.stringify(REAL_TSC)}, ...args], { stdio: "inherit" });
if (process.env.PH_TEST_TSC_HANG && args[0] === "--build") {
  writeFileSync("tsc-wrote", "");
  setInterval(() => {}, 1000);
} else {
  process.exit(result.status ?? 1);
}
`;

/** Where the stub tailwindcss keeps the entry it was given. */
export const TAILWIND_INPUT = "tailwind-input.css";

// Prints the entry it is given minus its @source lines, which real Tailwind
// reads and does not print, and keeps the whole entry for a test to read.
const TAILWIND_STUB = `import { readFileSync, writeFileSync } from "node:fs";
const entry = readFileSync(0, "utf8");
writeFileSync(${JSON.stringify(TAILWIND_INPUT)}, entry);
process.stdout.write(entry.split("\\n").filter((line) => !line.startsWith("@source")).join("\\n"));
`;

function installBin(root: string, name: string, script: string): void {
  const bin = join(root, "node_modules", ".bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, `${name}.mjs`), script);
  const posix = join(bin, name);
  writeFileSync(
    posix,
    `#!/bin/sh\nexec node "$(dirname "$0")/${name}.mjs" "$@"\n`,
  );
  chmodSync(posix, 0o755);
  writeFileSync(
    join(bin, `${name}.cmd`),
    `@echo off\r\nnode "%~dp0${name}.mjs" %*\r\n`,
  );
}

export type StagedProject = {
  /** The package root; its path has spaces in it. */
  readonly root: string;
  readonly dist: string;
  readonly write: (path: string, text: string) => void;
  readonly read: (path: string) => string;
  /** The stub tsc's calls, oldest first. */
  readonly tscCalls: () => {
    readonly args: string[];
    readonly cwd: string;
    readonly declarations: string | null;
  }[];
  readonly dispose: () => void;
};

/**
 * A copy of the classic-package fixture in a temp directory whose path has
 * spaces, with a recording `tsc` and an echoing `tailwindcss` in its
 * node_modules/.bin, where npx finds them.
 */
export function createStagedProject(): StagedProject {
  // macOS reaches every temp directory through a symlink.
  const parent = realpathSync.native(
    mkdtempSync(join(tmpdir(), "ph staged build ")),
  );
  const root = join(parent, "my package");
  cpSync(join(FIXTURES, "classic-package"), root, { recursive: true });
  // What a build in the fixture itself left (build-integration builds there).
  rmSync(join(root, "dist"), { recursive: true, force: true });
  rmSync(join(root, ".ph"), { recursive: true, force: true });
  for (const entry of readdirSync(root)) {
    if (entry.endsWith(".tsbuildinfo")) rmSync(join(root, entry));
  }
  installBin(root, "tsc", TSC_STUB);
  installBin(root, "tailwindcss", TAILWIND_STUB);
  return {
    root,
    dist: join(root, "dist"),
    write: (path, text) => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    },
    read: (path) => readFileSync(join(root, path), "utf8"),
    tscCalls: () => {
      const log = join(root, TSC_LOG);
      if (!existsSync(log)) return [];
      return readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map(
          (line) =>
            JSON.parse(line) as ReturnType<StagedProject["tscCalls"]>[number],
        );
    },
    dispose: () =>
      rmSync(parent, { recursive: true, force: true, maxRetries: 10 }),
  };
}

/**
 * Every file and link under each path, with a digest of its bytes, keyed by
 * its path relative to `root`: equal digests mean byte-identical trees.
 */
export function treeDigest(
  root: string,
  paths: readonly string[],
): Record<string, string> {
  const digest: Record<string, string> = {};
  const visit = (path: string) => {
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (stat === undefined) return;
    const key = relative(root, path).split(sep).join("/");
    if (stat.isSymbolicLink()) {
      digest[key] = `link ${readlinkSync(path)}`;
    } else if (stat.isDirectory()) {
      const entries = readdirSync(path).sort();
      if (entries.length === 0) digest[`${key}/`] = "empty directory";
      for (const entry of entries) visit(join(path, entry));
    } else {
      digest[key] = createHash("sha256")
        .update(readFileSync(path))
        .digest("hex");
    }
  };
  for (const path of paths) visit(join(root, path));
  return digest;
}

/** The output and compiler state a failed build must leave as it found. */
export const previousOutput = (project: StagedProject) =>
  treeDigest(project.root, ["dist", "tsconfig.tsbuildinfo"]);

/** What a build left beside the output and under .ph/build. */
export function scratchLeft(project: StagedProject): string[] {
  const beside = readdirSync(project.root).filter((entry) =>
    /\.ph-(stage|old)-/.test(entry),
  );
  let runs: string[] = [];
  try {
    runs = readdirSync(join(project.root, ".ph", "build", "runs"));
  } catch {
    // No run ever started.
  }
  const locked = existsSync(join(project.root, ".ph", "build", "lock"));
  return [
    ...beside,
    ...runs.map((run) => `runs/${run}`),
    ...(locked ? ["lock"] : []),
  ];
}

export { PH_CLI };

const DOCUMENT_MODEL = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "packages",
  "document-model",
);

/**
 * Adds the model fixture's code-first ledger to a classic package, with
 * document-model and zod linked as an install would. tsc checks only what
 * the classic package always had; the ledger is the definition loader's.
 */
export function addCodeFirstLedger(
  project: StagedProject,
  ledger = LEDGER_SOURCE,
): void {
  project.write("powerhouse.config.json", "{}");
  project.write("document-models/ledger/index.ts", ledger);
  cpSync(
    join(FIXTURES, "model-project", "scalars"),
    join(project.root, "scalars"),
    { recursive: true },
  );
  symlinkSync(
    DOCUMENT_MODEL,
    join(project.root, "node_modules", "document-model"),
  );
  const zod = dirname(
    createRequire(join(DOCUMENT_MODEL, "package.json")).resolve(
      "zod/package.json",
    ),
  );
  symlinkSync(
    realpathSync.native(zod),
    join(project.root, "node_modules", "zod"),
  );
  project.write(
    "tsconfig.json",
    project
      .read("tsconfig.json")
      .replace(
        '"document-models/**/*"',
        '"document-models/thing/**/*", "document-models/index.ts"',
      ),
  );
}
