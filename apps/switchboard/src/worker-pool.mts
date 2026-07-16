import type {
  DbConfig,
  DocumentModelSpecInput,
  SignatureVerifierSpec,
} from "@powerhousedao/reactor";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import { existsSync, realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export type WorkerCountInput = number | "auto";

export type SwitchboardWorkerPoolOptions = {
  numWorkers: number;
  /** Whether numWorkers was given explicitly or sized from the core count. */
  mode: "explicit" | "auto";
  dbPoolSizePerWorker: number;
  acquireTimeoutMs: number;
};

export type SwitchboardWorkerPoolInput = {
  numWorkers?: WorkerCountInput;
  dbPoolSizePerWorker?: number;
  acquireTimeoutMs?: number;
};

const DEFAULT_DB_POOL_SIZE_PER_WORKER = 2;
const DEFAULT_ACQUIRE_TIMEOUT_MS = 5000;

// Auto-sizing: reserve cores for the host event loop (queue, read models,
// HTTP) and cap at the top of the bench sweep envelope, which also bounds
// the worker Postgres-connection budget.
const AUTO_RESERVED_CORES = 2;
const AUTO_WORKER_CAP = 8;

/** Worker count for "auto": always at least 1 — auto sizes the pool, it does not turn worker mode off. */
export function autoWorkerCount(availableCores: number): number {
  return Math.max(
    1,
    Math.min(AUTO_WORKER_CAP, availableCores - AUTO_RESERVED_CORES),
  );
}

/**
 * Effective worker-pool config from programmatic options (which win) and the
 * REACTOR_* env vars; null when disabled (numWorkers 0, the default).
 * `"auto"` sizes the pool from the machine's available cores.
 */
export function resolveWorkerPoolOptions(
  input: SwitchboardWorkerPoolInput | undefined,
  env: NodeJS.ProcessEnv,
  availableCores: number = os.availableParallelism(),
): SwitchboardWorkerPoolOptions | null {
  const requested =
    input?.numWorkers ?? parseWorkerCount(env.REACTOR_WORKERS) ?? 0;
  const mode = requested === "auto" ? "auto" : "explicit";
  const numWorkers =
    requested === "auto" ? autoWorkerCount(availableCores) : requested;
  if (!Number.isInteger(numWorkers) || numWorkers < 0) {
    throw new Error(
      `workerPool.numWorkers must be "auto" or a non-negative integer, got ${numWorkers}`,
    );
  }
  if (numWorkers === 0) {
    return null;
  }
  return {
    numWorkers,
    mode,
    dbPoolSizePerWorker:
      input?.dbPoolSizePerWorker ??
      parseNonNegativeInt(
        env.REACTOR_DB_POOL_SIZE_WORKER,
        "REACTOR_DB_POOL_SIZE_WORKER",
      ) ??
      DEFAULT_DB_POOL_SIZE_PER_WORKER,
    acquireTimeoutMs:
      input?.acquireTimeoutMs ??
      parseNonNegativeInt(
        env.REACTOR_DB_ACQUIRE_TIMEOUT_MS,
        "REACTOR_DB_ACQUIRE_TIMEOUT_MS",
      ) ??
      DEFAULT_ACQUIRE_TIMEOUT_MS,
  };
}

/**
 * DbConfig for each worker's own pool, parsed from a postgres:// URL.
 * Explicit host, database, and user are required — no pg-side defaults.
 */
export function buildWorkerDbConfig(
  postgresUrl: string,
  options: Pick<
    SwitchboardWorkerPoolOptions,
    "dbPoolSizePerWorker" | "acquireTimeoutMs"
  >,
): DbConfig {
  let parsed: URL;
  try {
    parsed = new URL(postgresUrl);
  } catch {
    throw new Error(
      `Worker pool requires a valid postgres:// URL for the reactor database, got "${postgresUrl}"`,
    );
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!parsed.hostname || !database) {
    throw new Error(
      `Worker pool requires a postgres URL with a host and database name, got "${postgresUrl}"`,
    );
  }
  if (!parsed.username) {
    throw new Error(
      `Worker pool requires explicit credentials in the postgres URL (workers open their own connections), got "${postgresUrl}"`,
    );
  }
  const sslmode = parsed.searchParams.get("sslmode");
  const ssl =
    parsed.searchParams.get("ssl") === "true" ||
    (sslmode !== null && sslmode !== "disable");
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    database,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    ssl,
    applicationName: "switchboard-worker",
    poolSize: options.dbPoolSizePerWorker,
    connectionTimeoutMillis: options.acquireTimeoutMs,
  };
}

/**
 * The signature-verifier factory workers import at boot. Lives in
 * worker-support.mjs, a sibling dist entry of this module's bundle.
 */
export function resolveWorkerSignatureVerifierSpec(): SignatureVerifierSpec {
  const sibling = fileURLToPath(
    new URL("./worker-support.mjs", import.meta.url),
  );
  if (!existsSync(sibling)) {
    throw new Error(
      `Worker support module not found at ${sibling}; build @powerhousedao/switchboard before enabling REACTOR_WORKERS`,
    );
  }
  return {
    module: { filePath: sibling, exportName: "createWorkerSignatureVerifier" },
  };
}

/** Sources the worker model specs always include, ahead of package models. */
const BASE_MODEL_SPECIFIERS = [
  "document-model",
  "@powerhousedao/shared/document-drive",
  "@powerhousedao/reactor-drive",
];

export type ResolveWorkerModelSpecsArgs = {
  /** Configured package identifiers: npm names and/or built project paths. */
  packages: string[];
  /**
   * `id@version` keys of every live model. A key without a resolved spec
   * fails the boot — a worker missing a model fails every job for that type.
   */
  requiredModelKeys: string[];
  logger: ILogger;
};

/**
 * Resolves every document model to a `{ filePath, exportName }` spec a worker
 * thread can import directly. Resolution happens host-side because workers
 * resolve bare specifiers from the reactor package's own dependency context,
 * which cannot see switchboard or project packages.
 */
export async function resolveWorkerModelSpecs(
  args: ResolveWorkerModelSpecsArgs,
): Promise<DocumentModelSpecInput[]> {
  const { packages, requiredModelKeys, logger } = args;
  const specs: DocumentModelSpecInput[] = [];
  const covered = new Set<string>();

  const sources: string[] = [...BASE_MODEL_SPECIFIERS];
  for (const identifier of packages) {
    sources.push(identifier);
  }

  for (const source of sources) {
    const filePath = await resolveModelModuleFile(source);
    if (!filePath) {
      logger.warn(
        `Worker specs: no importable document-models entry for "${source}", skipping`,
      );
      continue;
    }

    let moduleNs: Record<string, unknown>;
    try {
      moduleNs = (await import(pathToFileURL(filePath).href)) as Record<
        string,
        unknown
      >;
    } catch (error) {
      logger.warn(
        `Worker specs: failed to import ${filePath} for "${source}": @error`,
        error,
      );
      continue;
    }

    for (const [exportName, value] of Object.entries(moduleNs)) {
      if (!isDocumentModelModule(value)) {
        continue;
      }
      const key = modelKey(value);
      if (covered.has(key)) {
        continue;
      }
      covered.add(key);
      specs.push({ filePath, exportName });
    }
  }

  const missing = requiredModelKeys.filter((key) => !covered.has(key));
  if (missing.length > 0) {
    throw new Error(
      `Worker pool cannot resolve importable modules for document models: ${missing.join(", ")}. ` +
        `Workers import models by file path, so every model must come from a built package ` +
        `with a document-models entry (searched: ${sources.join(", ")}).`,
    );
  }

  return specs;
}

/** `id@version` identity used for spec dedupe and coverage checks. */
export function modelKey(module: DocumentModelModule): string {
  return `${module.documentModel.global.id}@${module.version ?? 1}`;
}

function isDocumentModelModule(value: unknown): value is DocumentModelModule {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as {
    documentModel?: { global?: { id?: unknown } };
    reducer?: unknown;
  };
  return (
    typeof candidate.reducer === "function" &&
    typeof candidate.documentModel?.global?.id === "string"
  );
}

/**
 * Absolute file path of a source's models barrel. Mirrors reactor-api's
 * import-resolver: import.meta.resolve, then the project's node_modules via
 * the package.json exports map / dist layout.
 */
async function resolveModelModuleFile(source: string): Promise<string | null> {
  if (isFsPath(source)) {
    return resolveFromPackageDir(source, "./document-models");
  }

  const specifier = BASE_MODEL_SPECIFIERS.includes(source)
    ? source
    : `${source}/document-models`;

  try {
    const resolved = import.meta.resolve(specifier);
    if (resolved.startsWith("file:")) {
      return fileURLToPath(resolved);
    }
  } catch {
    // fall through to node_modules resolution from the project dir
  }

  const { packageName, subpath } = splitSpecifier(specifier);
  const packageDir = path.join(process.cwd(), "node_modules", packageName);
  if (!existsSync(packageDir)) {
    return null;
  }
  let realDir: string;
  try {
    realDir = realpathSync(packageDir);
  } catch {
    return null;
  }
  return resolveFromPackageDir(realDir, subpath);
}

function splitSpecifier(specifier: string): {
  packageName: string;
  subpath: string;
} {
  const parts = specifier.split("/");
  const packageSegments = specifier.startsWith("@") ? 2 : 1;
  const packageName = parts.slice(0, packageSegments).join("/");
  const rest = parts.slice(packageSegments).join("/");
  return { packageName, subpath: rest ? `./${rest}` : "." };
}

/** Exports-map lookup (import condition), then conventional dist paths. */
async function resolveFromPackageDir(
  packageDir: string,
  subpath: string,
): Promise<string | null> {
  const fromManifest = await resolveViaManifest(packageDir, subpath);
  if (fromManifest) {
    return fromManifest;
  }
  const candidates =
    subpath === "."
      ? [path.join(packageDir, "dist", "index.js")]
      : [
          path.join(packageDir, "dist", subpath.slice(2), "index.js"),
          path.join(packageDir, "dist", `${subpath.slice(2)}.js`),
          path.join(packageDir, subpath.slice(2), "index.js"),
        ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function resolveViaManifest(
  packageDir: string,
  subpath: string,
): Promise<string | null> {
  let raw: string;
  try {
    raw = await readFile(path.join(packageDir, "package.json"), "utf8");
  } catch {
    return null;
  }
  let manifest: { exports?: unknown; main?: unknown };
  try {
    manifest = JSON.parse(raw) as { exports?: unknown; main?: unknown };
  } catch {
    return null;
  }

  let entry: unknown;
  const exportsField = manifest.exports;
  if (
    exportsField !== null &&
    typeof exportsField === "object" &&
    !Array.isArray(exportsField)
  ) {
    const map = exportsField as Record<string, unknown>;
    const hasSubpathKeys = Object.keys(map).some((key) => key.startsWith("."));
    entry = hasSubpathKeys ? map[subpath] : subpath === "." ? map : undefined;
  } else if (typeof exportsField === "string" && subpath === ".") {
    entry = exportsField;
  }

  let target = pickImportTarget(entry);
  if (!target && subpath === "." && typeof manifest.main === "string") {
    target = manifest.main;
  }
  if (!target) {
    return null;
  }
  const resolved = path.join(packageDir, target);
  return existsSync(resolved) ? resolved : null;
}

function pickImportTarget(entry: unknown): string | null {
  if (typeof entry === "string") {
    return entry;
  }
  if (typeof entry !== "object" || entry === null) {
    return null;
  }
  const conditions = entry as Record<string, unknown>;
  for (const condition of ["import", "node", "default"]) {
    const value = conditions[condition];
    if (typeof value === "string") {
      return value;
    }
  }
  return null;
}

function isFsPath(identifier: string): boolean {
  return (
    path.isAbsolute(identifier) ||
    identifier.startsWith("./") ||
    identifier.startsWith("../")
  );
}

function parseWorkerCount(
  raw: string | undefined,
): WorkerCountInput | undefined {
  if (raw === undefined || raw.trim() === "") {
    return undefined;
  }
  if (raw.trim().toLowerCase() === "auto") {
    return "auto";
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 0 || String(value) !== raw.trim()) {
    throw new Error(
      `REACTOR_WORKERS must be "auto" or a non-negative integer, got "${raw}"`,
    );
  }
  return value;
}

function parseNonNegativeInt(
  raw: string | undefined,
  name: string,
): number | undefined {
  if (raw === undefined || raw.trim() === "") {
    return undefined;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 0 || String(value) !== raw.trim()) {
    throw new Error(`${name} must be a non-negative integer, got "${raw}"`);
  }
  return value;
}
