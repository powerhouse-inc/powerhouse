/** The builder's workspace: scaffold, pinned inputs, install, collected .d.ts. */
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pinnedPath, type Task } from "./catalog.js";
import { listFiles, symbolPattern } from "./docs.js";
import { run } from "./process.js";

export const DEFAULT_DEV_DEPENDENCIES: Record<string, string> = {
  "@types/node": "^24.0.0",
  tsx: "^4.21.0",
  typescript: "^5.9.3",
  vitest: "^4.1.0",
};

/** Verbatim from the recipes checkout's pnpm-workspace.yaml. */
const ALLOW_BUILDS_YAML = `allowBuilds:
  '@apollo/protobufjs': true
  '@datadog/pprof': false
  '@prisma/client': true
  '@prisma/engines': true
  esbuild: true
  msw: true
  onnxruntime-node: true
  prisma: true
  protobufjs: true
  sharp: true
  sqlite3: true
`;

const RELEASE_AGE_YAML = `minimumReleaseAgeExclude:
  - "@powerhousedao/*"
  - "@renown/*"
  - "document-model"
`;

const DOCUMENT_MODELS_DIR = "document-models";

/** Pinned codegen tests: not the builder's work, and not typecheckable here. */
const PINNED_MODEL_TEST_GLOBS = [
  `${DOCUMENT_MODELS_DIR}/**/tests/**`,
  `${DOCUMENT_MODELS_DIR}/**/*.test.ts`,
];

/** Never graded: the reference copy, verifier probes, pinned model tests. */
export const ACCEPTANCE_VITEST_EXCLUDES: readonly string[] = [
  "**/reference/**",
  "**/__verify__/**",
  ...PINNED_MODEL_TEST_GLOBS.map((g) => `**/${g}`),
];

const DEFAULT_VITEST_CONFIG = `import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
${ACCEPTANCE_VITEST_EXCLUDES.map((g) => `      "${g}",`).join("\n")}
    ],
  },
});
`;

const TSCONFIG_FILE = "tsconfig.json";
const VITEST_CONFIG_FILE = "vitest.config.ts";

function sortedRecord(entries: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)),
  );
}

export function pinsDocumentModels(task: Pick<Task, "pinnedInputs">): boolean {
  return task.pinnedInputs.some(
    (c) =>
      c.to === DOCUMENT_MODELS_DIR ||
      c.to.startsWith(`${DOCUMENT_MODELS_DIR}/`),
  );
}

export interface ScaffoldOptions {
  dir: string;
  task: Task;
  pin: string;
  /** Overrides for DEFAULT_DEV_DEPENDENCIES. */
  versions?: Record<string, string>;
}

export function workspacePackageJson(o: ScaffoldOptions): object {
  return {
    name: `doc-harness-ws-${o.task.id}`,
    private: true,
    type: "module",
    scripts: { tsc: "tsc --noEmit", test: "vitest run" },
    dependencies: sortedRecord({
      ...Object.fromEntries(o.task.packages.map((p) => [p, o.pin])),
      ...o.task.extraDeps,
    }),
    devDependencies: sortedRecord({
      ...DEFAULT_DEV_DEPENDENCIES,
      ...o.versions,
    }),
  };
}

export function workspaceTsconfig(task: Task): object {
  const withModels = pinsDocumentModels(task);
  return {
    compilerOptions: {
      strict: true,
      target: "es2022",
      module: "nodenext",
      moduleResolution: "nodenext",
      esModuleInterop: true,
      skipLibCheck: true,
      noEmit: true,
      types: ["node"],
      // Index-file targets, as the recipes do: a directory target is TS2307
      // under nodenext. No baseUrl: tsc 6 rejects it and paths work without it.
      ...(withModels
        ? {
            paths: {
              "document-models": ["./document-models/index.ts"],
              "document-models/*": ["./document-models/*/index.ts"],
            },
          }
        : {}),
    },
    // Recipes are flat or src/-rooted; include everything and exclude the usual.
    include: ["**/*.ts"],
    // reference/ is arm B's read-only copy; __verify__/ holds verifier probes.
    exclude: [
      "node_modules",
      "dist",
      "reference",
      "__verify__",
      ...(withModels ? PINNED_MODEL_TEST_GLOBS : []),
    ],
  };
}

function tsconfigText(task: Task): string {
  return `${JSON.stringify(workspaceTsconfig(task), null, 2)}\n`;
}

/** Returns the files written, relative to dir. */
export function scaffoldWorkspace(o: ScaffoldOptions): string[] {
  mkdirSync(o.dir, { recursive: true });
  const files: Record<string, string> = {
    "package.json": `${JSON.stringify(workspacePackageJson(o), null, 2)}\n`,
    "pnpm-workspace.yaml": `${ALLOW_BUILDS_YAML}\n${RELEASE_AGE_YAML}`,
    [TSCONFIG_FILE]: tsconfigText(o.task),
    ".gitignore": "node_modules\ndist\n",
    // Always present: without it vitest walks up and finds doc-harness's own
    // config, whose include matches nothing in the workspace.
    [VITEST_CONFIG_FILE]: DEFAULT_VITEST_CONFIG,
  };
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(o.dir, name), content);
  }
  return Object.keys(files);
}

export function pinsVitestConfig(
  task: Pick<Task, "pinnedInputs" | "acceptance">,
): boolean {
  return [...task.pinnedInputs, ...task.acceptance.files].some(
    (c) => c.to === VITEST_CONFIG_FILE,
  );
}

/** prepare.json is cached, so an old workspace would keep stale excludes. */
export function refreshGradingConfig(
  task: Task,
  workspaceDir: string,
): string[] {
  writeFileSync(path.join(workspaceDir, TSCONFIG_FILE), tsconfigText(task));
  const written = [TSCONFIG_FILE];
  if (!pinsVitestConfig(task)) {
    writeFileSync(
      path.join(workspaceDir, VITEST_CONFIG_FILE),
      DEFAULT_VITEST_CONFIG,
    );
    written.push(VITEST_CONFIG_FILE);
  }
  return written;
}

/* -------------------------------------------------------------- copies */

function copyInto(from: string, to: string): void {
  mkdirSync(path.dirname(to), { recursive: true });
  if (statSync(from).isDirectory()) {
    cpSync(from, to, { recursive: true });
  } else {
    copyFileSync(from, to);
  }
}

function copyPinned(
  taskId: string,
  copies: { from: string; to: string }[],
  workspaceDir: string,
  pinnedRoot?: string,
): string[] {
  return copies.map(({ from, to }) => {
    const dest = path.join(workspaceDir, to);
    const source = pinnedRoot
      ? path.join(pinnedRoot, taskId, from)
      : pinnedPath(taskId, from);
    copyInto(source, dest);
    return dest;
  });
}

/** Returns the destination paths. pinnedRoot overrides catalog/pinned. */
export function copyPinnedInputs(
  task: Task,
  workspaceDir: string,
  pinnedRoot?: string,
): string[] {
  return copyPinned(task.id, task.pinnedInputs, workspaceDir, pinnedRoot);
}

/** Acceptance files, plus a default vitest.config.ts when the task wants one. */
export function copyAcceptanceFiles(
  task: Task,
  workspaceDir: string,
  pinnedRoot?: string,
): string[] {
  const written = copyPinned(
    task.id,
    task.acceptance.files,
    workspaceDir,
    pinnedRoot,
  );
  const config = path.join(workspaceDir, "vitest.config.ts");
  if (task.acceptance.vitestConfig && !existsSync(config)) {
    writeFileSync(config, DEFAULT_VITEST_CONFIG);
    written.push(config);
  }
  return written;
}

const REFERENCE_EXCLUDES = new Set(["node_modules", "dist", ".tsbuild"]);

/** Arm B: the recipe source, without build output. Returns the file count. */
export function copyReference(
  recipesRoot: string,
  task: Task,
  referenceDir: string,
): number {
  if (task.recipeDir === null) {
    throw new Error(`${task.id} has no recipeDir to use as a reference`);
  }
  const source = path.join(recipesRoot, task.recipeDir);
  if (!existsSync(source)) {
    throw new Error(`recipe ${task.recipeDir} not found at ${source}`);
  }
  cpSync(source, referenceDir, {
    recursive: true,
    filter: (src) => {
      const name = path.basename(src);
      return !REFERENCE_EXCLUDES.has(name) && !name.endsWith(".tsbuildinfo");
    },
  });
  return listFiles(referenceDir).length;
}

/* ------------------------------------------------------------- install */

export interface InstallOptions {
  dir: string;
  task: Pick<Task, "id" | "packages">;
  /** Lockfiles live at <cacheDir>/<taskId>/pnpm-lock.yaml. */
  cacheDir: string;
  logPath: string;
  timeoutMs: number;
}

export interface InstallResult {
  ok: boolean;
  ms: number;
  installedVersion: string | null;
  fromCache: boolean;
}

const LOCKFILE = "pnpm-lock.yaml";
const PNPM_FLAGS = ["--config.confirmModulesPurge=false"];

export async function installWorkspace(
  o: InstallOptions,
): Promise<InstallResult> {
  const startedAt = Date.now();
  const cachedLock = path.join(o.cacheDir, o.task.id, LOCKFILE);
  const localLock = path.join(o.dir, LOCKFILE);
  const env = { ...process.env, CI: "true" };
  const log: string[] = [];

  const install = async (args: string[]): Promise<boolean> => {
    const cmd = ["pnpm", "install", ...args, ...PNPM_FLAGS];
    const result = await run(cmd[0], cmd.slice(1), {
      cwd: o.dir,
      timeoutMs: o.timeoutMs,
      verbose: false,
      env,
    });
    log.push(
      `$ ${cmd.join(" ")}\n${result.output}\n[${result.status} code=${result.code} ${result.durationMs}ms]\n`,
    );
    return result.status === "pass";
  };

  let ok = false;
  let fromCache = false;
  if (existsSync(cachedLock)) {
    copyFileSync(cachedLock, localLock);
    ok = await install(["--offline", "--frozen-lockfile"]);
    fromCache = ok;
  }
  if (!ok) {
    ok = await install(["--no-frozen-lockfile"]);
    if (ok && existsSync(localLock)) {
      mkdirSync(path.dirname(cachedLock), { recursive: true });
      copyFileSync(localLock, cachedLock);
    }
  }

  mkdirSync(path.dirname(o.logPath), { recursive: true });
  writeFileSync(o.logPath, log.join("\n"));
  return {
    ok,
    ms: Date.now() - startedAt,
    installedVersion: installedVersion(o.dir, o.task.packages),
    fromCache,
  };
}

/** Version of @powerhousedao/reactor, else the first listed package present. */
export function installedVersion(
  workspaceDir: string,
  packages: readonly string[],
): string | null {
  const order = [
    "@powerhousedao/reactor",
    ...packages.filter((p) => p !== "@powerhousedao/reactor"),
  ];
  for (const pkg of order) {
    const file = path.join(workspaceDir, "node_modules", pkg, "package.json");
    if (!existsSync(file)) continue;
    const parsed = JSON.parse(readFileSync(file, "utf8")) as {
      version?: string;
    };
    if (typeof parsed.version === "string") return parsed.version;
  }
  return null;
}

/* ----------------------------------------------------------------- dts */

const DTS_RE = /\.d\.(ts|mts|cts)$/;

/** Copies each package's .d.ts files to outDir/<pkg>/…; returns the count. */
export function collectDts(
  workspaceDir: string,
  packages: readonly string[],
  outDir: string,
): number {
  let count = 0;
  for (const pkg of packages) {
    const link = path.join(workspaceDir, "node_modules", pkg);
    if (!existsSync(link)) continue;
    const root = realpathSync(link);
    for (const rel of listFiles(root)) {
      if (!DTS_RE.test(rel) || rel.split("/").includes("node_modules"))
        continue;
      const dest = path.join(outDir, pkg, rel);
      mkdirSync(path.dirname(dest), { recursive: true });
      copyFileSync(path.join(root, rel), dest);
      count += 1;
    }
  }
  return count;
}

export function dtsHasSymbol(outDir: string, symbol: string): boolean {
  if (!existsSync(outDir)) return false;
  const re = symbolPattern(symbol);
  return listFiles(outDir).some((rel) =>
    re.test(readFileSync(path.join(outDir, rel), "utf8")),
  );
}
