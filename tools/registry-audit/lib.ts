/**
 * Shared utilities for the registry-audit pipeline.
 *
 * The pipeline is a set of small, explicit, independently-runnable tools that
 * audit every published package in a Verdaccio/npm registry:
 *
 *   1. download.ts   - download the latest tarball of every package
 *   2. extract.ts    - unpack the tarballs
 *   3. analyze.ts    - run a configurable pattern scan over the unpacked files
 *   4. typecheck.ts  - (optional) typecheck packages against local workspace builds
 *
 * Nothing in here is specific to any particular audit (e.g. attachments) - the
 * search rules are supplied as data to analyze.ts.
 *
 * State is threaded between phases through a single manifest.json under CACHE_DIR.
 */
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline as streamPipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Repo root, derived from this file's location (tools/registry-audit/lib.ts). */
export const REPO_ROOT = resolve(__dirname, "..", "..");

/** Default registry. Override with --registry or PH_REGISTRY. */
export const DEFAULT_REGISTRY = "https://registry.dev.vetra.io";

/** All audit state lives here (gitignored via .cache/). */
export const CACHE_DIR = join(REPO_ROOT, ".cache", "registry-audit");
export const TARBALLS_DIR = join(CACHE_DIR, "tarballs");
export const EXTRACTED_DIR = join(CACHE_DIR, "extracted");
export const TYPECHECK_DIR = join(CACHE_DIR, "typecheck");
/** Install scaffolds for the in-process boot phases (load, create-query). Shared so a single install is reused across both. */
export const LOAD_DIR = join(CACHE_DIR, "load");
export const MANIFEST_PATH = join(CACHE_DIR, "manifest.json");
export const REPORT_PATH = join(CACHE_DIR, "report.json");
export const TYPECHECK_REPORT_PATH = join(CACHE_DIR, "typecheck-report.json");
export const LOAD_REPORT_PATH = join(CACHE_DIR, "load-report.json");
export const CREATE_QUERY_REPORT_PATH = join(
  CACHE_DIR,
  "create-query-report.json",
);

/** The local Switchboard server build the boot phases import by absolute path. */
export const SWITCHBOARD_SERVER = join(
  REPO_ROOT,
  "apps",
  "switchboard",
  "dist",
  "server.mjs",
);

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export type PackageEntry = {
  /** npm package name, e.g. "@test/issue-tracker". */
  name: string;
  /** Resolved dist-tags.latest version. */
  version: string;
  /** Tarball URL from the packument. */
  tarballUrl: string;
  /** Absolute path to the downloaded .tgz, once downloaded. */
  tarballPath?: string;
  /** ISO timestamp of the download. */
  downloadedAt?: string;
  /** Absolute path to the extracted package dir, once extracted. */
  extractedPath?: string;
  /** ISO timestamp of the extraction. */
  extractedAt?: string;
  /** Non-fatal error encountered while processing this package. */
  error?: string;
};

export type Manifest = {
  registry: string;
  /** ISO timestamp of the last download run. */
  generatedAt?: string;
  packages: Record<string, PackageEntry>;
};

export function emptyManifest(registry: string): Manifest {
  return { registry, packages: {} };
}

export async function readManifest(): Promise<Manifest | null> {
  try {
    const raw = await readFile(MANIFEST_PATH, "utf8");
    return JSON.parse(raw) as Manifest;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** Reads the manifest or exits with a helpful message if it's missing. */
export async function requireManifest(prevTool: string): Promise<Manifest> {
  const manifest = await readManifest();
  if (!manifest) {
    console.error(
      `No manifest found at ${MANIFEST_PATH}.\nRun \`${prevTool}\` first.`,
    );
    process.exit(1);
  }
  return manifest;
}

/** Atomic write: write to a temp file then rename into place. */
export async function writeManifest(manifest: Manifest): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  const tmp = `${MANIFEST_PATH}.tmp`;
  await writeFile(tmp, JSON.stringify(manifest, null, 2));
  await rename(tmp, MANIFEST_PATH);
}

// ---------------------------------------------------------------------------
// Registry client (standard npm/Verdaccio API)
// ---------------------------------------------------------------------------

type VerdaccioPackageSummary = { name: string };

type Packument = {
  name: string;
  "dist-tags"?: Record<string, string>;
  versions?: Record<string, { dist?: { tarball?: string } }>;
};

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

/** Lists every package name known to the registry. */
export async function listPackageNames(registry: string): Promise<string[]> {
  const url = `${registry.replace(/\/$/, "")}/-/verdaccio/data/packages`;
  const summaries = await fetchJson<VerdaccioPackageSummary[]>(url);
  return summaries.map((p) => p.name).sort();
}

/** URL-encodes a (possibly scoped) package name for the packument path. */
export function encodePackageName(name: string): string {
  return name.replace("/", "%2F");
}

export async function getPackument(
  registry: string,
  name: string,
): Promise<Packument> {
  const url = `${registry.replace(/\/$/, "")}/${encodePackageName(name)}`;
  return fetchJson<Packument>(url);
}

export type ResolvedLatest = { version: string; tarballUrl: string };

/** Resolves dist-tags.latest -> { version, tarballUrl }. */
export function resolveLatest(packument: Packument): ResolvedLatest {
  const version = packument["dist-tags"]?.latest;
  if (!version) {
    throw new Error(`no dist-tags.latest for ${packument.name}`);
  }
  const tarballUrl = packument.versions?.[version]?.dist?.tarball;
  if (!tarballUrl) {
    throw new Error(`no tarball for ${packument.name}@${version}`);
  }
  return { version, tarballUrl };
}

/** Streams a URL to a destination file. */
export async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  }
  await mkdir(dirname(dest), { recursive: true });
  await streamPipeline(
    Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]),
    createWriteStream(dest),
  );
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

/** Filesystem-safe id for a package name: "@test/issue-tracker" -> "@test__issue-tracker". */
export function sanitize(name: string): string {
  return name.replace(/\//g, "__");
}

/**
 * Runs N async tasks with bounded concurrency, preserving input order in the
 * returned results. Never rejects on individual task failure - callers decide.
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Promisified spawn that inherits stdio and resolves with the exit code. */
export function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; quiet?: boolean } = {},
): Promise<number> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      stdio: opts.quiet ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => resolvePromise(code ?? 0));
  });
}

/** Captures stdout/stderr of a command instead of inheriting. */
export function runCapture(
  cmd: string,
  args: string[],
  opts: { cwd?: string } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, args, { cwd: opts.cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", rejectPromise);
    child.on("close", (code) =>
      resolvePromise({ code: code ?? 0, stdout, stderr }),
    );
  });
}

// ---------------------------------------------------------------------------
// Switchboard boot harness (shared by load.ts and create-query.ts)
// ---------------------------------------------------------------------------

/** True if `path` exists. */
export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** True if the extracted package declares a `./document-models` export. */
export async function hasDocumentModelsExport(
  extractedPath: string,
): Promise<boolean> {
  try {
    const pkg = JSON.parse(
      await readFile(join(extractedPath, "package.json"), "utf8"),
    ) as { exports?: Record<string, unknown> };
    return Boolean(pkg.exports?.["./document-models"]);
  } catch {
    return false;
  }
}

/** Exits with a build hint if the local Switchboard server build is missing. */
export async function requireSwitchboardBuild(): Promise<void> {
  if (!(await exists(SWITCHBOARD_SERVER))) {
    console.error(
      `Switchboard build not found at ${SWITCHBOARD_SERVER}.\n` +
        `Build it first:  pnpm --filter=@powerhousedao/switchboard build`,
    );
    process.exit(1);
  }
}

/**
 * Installs a published tarball into a clean scaffold under `baseDir/<sanitized>`
 * so its full dependency graph resolves the way it would in a real deployment.
 * Returns the scaffold dir, or an error string. When `skipInstall` is set and the
 * package is already installed there, the existing install is reused (the
 * published tarball is immutable for a given version, so reuse is always safe).
 */
export async function installScaffold(opts: {
  name: string;
  tarballPath: string;
  baseDir: string;
  /** package.json name prefix, e.g. "audit-load" / "audit-cq". */
  namePrefix: string;
  skipInstall: boolean;
}): Promise<{ dir: string } | { error: string }> {
  const dir = join(opts.baseDir, sanitize(opts.name));
  await mkdir(dir, { recursive: true });
  // Deliberately no tsconfig.json here: a tsconfig with `paths` would make tsx
  // mis-resolve the Switchboard's own deps when running with cwd=scaffold.
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify(
      {
        name: `${opts.namePrefix}-${sanitize(opts.name).replace(/[@/]/g, "")}`,
        private: true,
        type: "module",
        dependencies: { [opts.name]: `file:${opts.tarballPath}` },
      },
      null,
      2,
    ),
  );
  if (opts.skipInstall && (await exists(join(dir, "node_modules", opts.name)))) {
    return { dir };
  }
  const install = await runCapture(
    "pnpm",
    ["install", "--ignore-workspace", "--no-frozen-lockfile", "--ignore-scripts"],
    { cwd: dir },
  );
  if (install.code !== 0) {
    await writeFile(
      join(dir, "install-error.txt"),
      install.stdout + install.stderr,
    );
    return {
      error:
        (install.stderr || install.stdout).trim().split("\n").pop() ??
        `pnpm install exited ${install.code}`,
    };
  }
  return { dir };
}

export type WorkerOutcome<T> = {
  exitCode: number | null;
  /** Parsed sentinel-line payload, or null if absent/unparseable. */
  result: T | null;
  /** Last 25 lines of combined stdout+stderr (for diagnosing failures). */
  rawTail: string;
  timedOut: boolean;
};

/**
 * Spawns a worker (`tsx <runner> <arg>`) with cwd set to its scaffold, in-memory
 * PGlite forced on, and a SIGKILL timeout. The worker prints exactly one machine
 * line `"<sentinel> <json>"`; that JSON is parsed into `result`.
 */
export function spawnWorker<T>(opts: {
  runner: string;
  /** Worker argv[2]: a package name, or "none" for the baseline. */
  arg: string;
  cwd: string;
  timeoutMs: number;
  sentinel: string;
  env?: NodeJS.ProcessEnv;
}): Promise<WorkerOutcome<T>> {
  const tsx = join(REPO_ROOT, "node_modules", ".bin", "tsx");
  const prefix = `${opts.sentinel} `;
  return new Promise((resolvePromise) => {
    const child = spawn(tsx, [opts.runner, opts.arg], {
      cwd: opts.cwd,
      env: { ...process.env, PH_PGLITE_IN_MEMORY: "1", ...opts.env },
    });
    let out = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs);

    const collect = (d: Buffer) => (out += d.toString());
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      const line = out.split("\n").find((l) => l.startsWith(prefix));
      let result: T | null = null;
      if (line) {
        try {
          result = JSON.parse(line.slice(prefix.length)) as T;
        } catch {
          /* leave null */
        }
      }
      resolvePromise({
        exitCode,
        result,
        rawTail: out.split("\n").slice(-25).join("\n"),
        timedOut,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Tiny arg parser
// ---------------------------------------------------------------------------

export type ParsedArgs = {
  /** Boolean flags, e.g. { force: true }. */
  flags: Record<string, boolean>;
  /** Repeatable string options, e.g. { pattern: ["a", "b"] }. */
  options: Record<string, string[]>;
  /** Positional args. */
  positionals: string[];
};

/**
 * Minimal parser supporting:
 *   --flag                 -> flags.flag = true
 *   --key value            -> options.key = [..., "value"]
 *   --key=value            -> options.key = [..., "value"]
 * `booleanFlags` lists keys that take no value.
 */
export function parseArgs(
  argv: string[],
  booleanFlags: string[] = [],
): ParsedArgs {
  const flags: Record<string, boolean> = {};
  const options: Record<string, string[]> = {};
  const positionals: string[] = [];
  const boolSet = new Set(booleanFlags);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const body = arg.slice(2);
      const eq = body.indexOf("=");
      if (eq !== -1) {
        const key = body.slice(0, eq);
        (options[key] ??= []).push(body.slice(eq + 1));
      } else if (boolSet.has(body)) {
        flags[body] = true;
      } else {
        const nextArg = argv[i + 1];
        if (nextArg !== undefined && !nextArg.startsWith("--")) {
          (options[body] ??= []).push(nextArg);
          i++;
        } else {
          flags[body] = true;
        }
      }
    } else {
      positionals.push(arg);
    }
  }
  return { flags, options, positionals };
}

/** First value of a repeatable option, with a fallback. */
export function opt(
  parsed: ParsedArgs,
  key: string,
  fallback?: string,
): string | undefined {
  return parsed.options[key]?.[0] ?? fallback;
}

/** Resolves the registry from --registry, PH_REGISTRY, or the default. */
export function resolveRegistry(parsed: ParsedArgs): string {
  return opt(parsed, "registry") ?? process.env.PH_REGISTRY ?? DEFAULT_REGISTRY;
}
