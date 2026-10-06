/**
 * Prebuild Connect's reactor SharedWorker into a browser-loadable bundle.
 *
 * The published `@powerhousedao/connect` dist ships `reactor.worker.js` as a
 * library artifact: its dependencies are externalized onto bare specifiers
 * (`@powerhousedao/reactor`, `kysely`, ...). The page resolves those through
 * its `<script type="importmap">`, but import maps are a document feature —
 * a worker never inherits one and no Worker/SharedWorker constructor option
 * can supply one. A bare specifier inside a worker is unresolvable by the
 * platform, so the shipped file can never run as a worker script.
 *
 * This module builds the worker's module graph into a self-contained bundle
 * (one `vite build` in a throwaway subprocess, same pattern as the vendor
 * prebuild). Two modes:
 *
 * - With `vendorImports` (production builds that also ship the `__vendor__/`
 *   bundle): specifiers present in the vendor import map are externalized and
 *   rewritten to `../__vendor__/<entry>.js`. The worker bundle is served as a
 *   sibling of `__vendor__/`, so those relative imports hit the exact URLs
 *   the page's import map uses — one fetch and one HTTP-cache entry per
 *   shared dep for the page and the worker together.
 * - Without (dev servers, `PH_CONNECT_VENDOR=0` builds): everything is
 *   bundled; the worker is self-contained.
 *
 * The build uses Vite's relative base (`"./"`), so emitted chunk and asset
 * URLs resolve against the worker script's own URL. That sidesteps the
 * dynamic-base machinery entirely: the bundle works under any deploy base,
 * concrete or proxy-substituted, as long as it is served under
 * `<app-base>/__reactor_worker__/`.
 */
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname as pathDirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  acquireLock,
  LOCK_STALE_MS,
  releaseLock,
} from "./externalize-vendor.js";

/** URL prefix the worker bundle is served under, next to `__vendor__/`. */
export const REACTOR_WORKER_URL_PREFIX = "/__reactor_worker__/";

/** Entry filename of the bundle; the tab constructs its SharedWorker from it. */
export const REACTOR_WORKER_ENTRY = "reactor.worker.js";

/** Metadata file the cache check reads; lives inside the bundle dir. */
const META_FILE = "worker-meta.json";

/** Content-Type for the extensions the worker build emits; JS is the default. */
export const REACTOR_WORKER_MIME: Record<string, string> = {
  ".map": "application/json",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".data": "application/octet-stream",
};

export interface ReactorWorkerVendorOptions {
  /** The vendor's import map (`spec -> /__vendor__/<entry>.js`). */
  imports: Record<string, string>;
  /** The built vendor dir, needed to verify which entries are worker-safe. */
  dir: string;
}

export interface ReactorWorkerBuildOptions {
  /** Project root the worker's dependencies resolve from. */
  dirname: string;
  /** Directory to hold the bundle (e.g. `<dist>/__reactor_worker__`). */
  outDir: string;
  /**
   * The prebuilt vendor to share dependencies with. Only the worker-safe
   * subset of its entries is externalized (see
   * {@link workerSafeVendorImports}); omit to bundle everything.
   */
  vendor?: ReactorWorkerVendorOptions;
  /**
   * Worker entry to build. Defaults to the installed Connect dist's
   * `reactor.worker.js`; tests inject a fixture entry here.
   */
  entryPath?: string;
  /** NODE_ENV define for the build (default "development"). */
  nodeEnv?: "development" | "production";
  /** Filled with the failure cause when the prebuild returns null. */
  errorRef?: { message?: string };
}

export interface PrebuiltReactorWorker {
  outDir: string;
  /** Entry filename inside outDir ({@link REACTOR_WORKER_ENTRY}). */
  entry: string;
  /**
   * Digest of everything that shaped this bundle's output (see
   * {@link computeSourceDigest}); identical for a cache hit and a fresh
   * build. The dev plugin serves it in `worker-meta.json` next to the
   * bundle; `apps/connect/src/utils/reactor-worker-url.ts` fetches it to
   * fold the actual built worker code into the tab's version fingerprint
   * (W0.6 — see docs/bugs/2026-10-03-pglite-aborted-transaction-bricks-worker-reactor.md).
   */
  sourceDigest: string;
}

/**
 * The installed Connect dist's worker entry, or null when the installed
 * version predates the worker (the feature is then unavailable, not broken).
 */
export function resolveReactorWorkerSource(dirname: string): string | null {
  try {
    const candidate = join(
      realpathSync(join(dirname, "node_modules", "@powerhousedao/connect")),
      "dist",
      REACTOR_WORKER_ENTRY,
    );
    return existsSync(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

/** `/__vendor__/<entry>.js` -> `../__vendor__/<entry>.js` (sibling dirs). */
export function vendorRelativePath(vendorUrl: string): string {
  const file = vendorUrl.slice(vendorUrl.lastIndexOf("/") + 1);
  return `../__vendor__/${file}`;
}

// Import/export specifier positions in emitted ES output, minified included:
// static imports/re-exports, side-effect imports, and dynamic import(). The
// lookbehind keeps member calls like `map.import("x")` out.
const SPECIFIER_PATTERNS = [
  /(?<![.\w$])import\s*\(\s*["']([^"']+)["']/g,
  /(?<![.\w$])import\s*[^"'()]*?from\s*["']([^"']+)["']/g,
  /(?<![.\w$])export\s*[^"'()]*?from\s*["']([^"']+)["']/g,
  /(?<![.\w$])import\s*["']([^"']+)["']/g,
];

/**
 * Module specifiers a worker cannot resolve: anything that is not relative,
 * root-relative, or an http(s)/data/blob URL. Used as a post-build guard so a
 * leftover bare (or `node:`) import fails the build with a name instead of
 * shipping a worker that dies on its first import statement.
 *
 * Expects minified (comment-free) output: a raw-text scan cannot tell a real
 * import from a JSDoc code sample, and unminified kysely/viem are full of the
 * latter. The build below always minifies for exactly this reason.
 */
export function findDisallowedSpecifiers(code: string): string[] {
  const found = new Set<string>();
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of code.matchAll(pattern)) {
      const spec = match[1];
      if (
        !spec.startsWith("./") &&
        !spec.startsWith("../") &&
        !spec.startsWith("/") &&
        !/^(https?:|data:|blob:)/.test(spec)
      ) {
        found.add(spec);
      }
    }
  }
  return [...found].sort();
}

interface WorkerBundleMeta {
  sourceDigest?: string;
  vendorKey?: string;
  nodeEnv?: string;
}

/**
 * Fallback list of packages whose BUILT dist shapes the worker bundle's output,
 * used only when the installed Connect's package.json cannot be read (see
 * {@link upstreamWorkerPackages}).
 */
const FALLBACK_UPSTREAM_WORKER_PACKAGES = [
  "@powerhousedao/reactor",
  "@powerhousedao/reactor-browser",
];

/** Dependency scopes whose installed dist can change the bundle's output. */
const UPSTREAM_SCOPES = ["@powerhousedao/", "@renown/"];

/**
 * Packages whose BUILT dist shapes the worker bundle's output even when
 * connect's own dist/reactor.worker.js entry file did not change.
 *
 * That entry is a library artifact whose bare imports this build resolves
 * through node_modules at BUILD time, so a rebuilt dist anywhere in its
 * closure changes the bundle output without touching the entry file's own
 * size/mtime. The list is DERIVED from the installed Connect's own
 * dependencies rather than hardcoded: the bundle pulls `@renown/sdk`,
 * `@powerhousedao/powerhouse-vetra-packages` and `@powerhousedao/shared` out
 * of node_modules too, and a hardcoded pair left every one of those able to be
 * rebuilt behind a cache hit. Connect's dependency list is the cheap stand-in
 * for the resolved bundle graph: every workspace package the worker can reach
 * is reachable through it, and a package not in the bundle only costs a readdir.
 */
export function upstreamWorkerPackages(dirname: string): string[] {
  const connectDir = resolveWorkspacePackageDir(
    dirname,
    "@powerhousedao/connect",
  );
  if (!connectDir) return [...FALLBACK_UPSTREAM_WORKER_PACKAGES];
  let meta: { dependencies?: Record<string, string> };
  try {
    meta = JSON.parse(
      readFileSync(join(connectDir, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
  } catch {
    return [...FALLBACK_UPSTREAM_WORKER_PACKAGES];
  }
  const names = Object.keys(meta.dependencies ?? {}).filter((name) =>
    UPSTREAM_SCOPES.some((scope) => name.startsWith(scope)),
  );
  for (const name of FALLBACK_UPSTREAM_WORKER_PACKAGES) {
    if (!names.includes(name)) names.push(name);
  }
  return names.sort();
}

/**
 * This module's own installed version, read by walking up from its file to
 * the nearest `package.json` named "@powerhousedao/builder-tools" (same
 * technique as `build-hash.ts`'s `readConnectVersion`: builder-tools'
 * `exports` map has no `./package.json` subpath, so node resolution can't
 * get there). Works whether this runs from source (tests, this monorepo) or
 * the built dist.
 */
export function resolveOwnPackageVersion(): string {
  try {
    let dir = pathDirname(fileURLToPath(import.meta.url));
    for (;;) {
      try {
        const pkg = JSON.parse(
          readFileSync(join(dir, "package.json"), "utf8"),
        ) as { name?: string; version?: string };
        if (pkg.name === "@powerhousedao/builder-tools") {
          return pkg.version ?? "unknown";
        }
      } catch {
        // no readable package.json at this level; keep walking up
      }
      const parent = pathDirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // fall through to "unknown" below
  }
  return "unknown";
}

/**
 * This package's own version, computed once. Folded into the worker bundle
 * cache key so a builder-tools release — which can change how the bundle is
 * built (anything in this module beyond {@link WORKER_BUILD_WORKER} itself,
 * e.g. `workerSafeVendorImports`, the resolve plugin) — invalidates bundles
 * a prior builder-tools version cached.
 */
export const BUILDER_TOOLS_VERSION = resolveOwnPackageVersion();

/**
 * A workspace package's real directory, resolved the way Node's resolver
 * would (through `node_modules`), or null when it is not installed (e.g. a
 * non-monorepo consumer project — graceful, not an error). pnpm's
 * node_modules symlinks resolve to the real package directory, so this
 * reflects the monorepo's actual dist state, not a stale symlink target.
 */
export function resolveWorkspacePackageDir(
  dirname: string,
  pkgName: string,
): string | null {
  try {
    return realpathSync(join(dirname, "node_modules", ...pkgName.split("/")));
  } catch {
    return null;
  }
}

/**
 * Cheap content fingerprint of a directory's immediate files: no file bytes
 * are read, just each entry's name/size/mtime, so it stays fast even for a
 * large dist. Sensitive to a rebuild in the common cases: Vite's
 * content-hashed chunk filenames change the name itself; a stable-named file
 * (an entry point) changes size or mtime. Bounded (`maxFiles`) so a
 * pathological directory cannot make this slow — deliberately not a
 * full-tree hash.
 *
 * The names are sorted BEFORE the bound is applied, so the subset the bound
 * keeps is the same subset on every run: readdir order is unspecified, and
 * truncating it first made the fingerprint of a directory past the bound a
 * function of whatever order the filesystem happened to report.
 */
export function distDirFingerprint(dir: string, maxFiles = 1000): string {
  try {
    const names = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .sort();
    return names
      .slice(0, maxFiles)
      .map((name) => {
        const stat = statSync(join(dir, name));
        return `${name}:${stat.size}:${Math.round(stat.mtimeMs)}`;
      })
      .join("|");
  } catch {
    return "unreadable";
  }
}

// Digest of everything that shapes the output: the connect dist the entry
// comes from (version + entry mtime/size cover a rebuild in place), the
// upstream packages the entry's bare imports resolve into at build time
// (dist fingerprint, over the list {@link upstreamWorkerPackages} derives —
// covers an upstream rebuild that never touched connect's own dist), the
// vendor the externals point at (its
// import-map.json changes whenever the vendor is rebuilt), NODE_ENV, the
// build-worker source, and the builder-tools version, so a logic change
// (in either the inline build-worker script or this module more broadly)
// busts stale bundles.
export function computeSourceDigest(
  dirname: string,
  entryPath: string,
  vendorDir?: string,
  builderToolsVersion: string = BUILDER_TOOLS_VERSION,
): string {
  const h = createHash("sha256");
  h.update(`builder:${WORKER_BUILD_WORKER_HASH}\n`);
  h.update(`builder-tools:${builderToolsVersion}\n`);
  try {
    const pkgRoot = resolveWorkspacePackageDir(
      dirname,
      "@powerhousedao/connect",
    );
    if (!pkgRoot) throw new Error("unresolved");
    const meta = JSON.parse(
      readFileSync(join(pkgRoot, "package.json"), "utf8"),
    ) as { version?: string };
    h.update(`connect:${meta.version ?? "unknown"}\n`);
  } catch {
    h.update("connect:unresolved\n");
  }
  try {
    const stat = statSync(entryPath);
    h.update(`entry:${stat.size}:${Math.round(stat.mtimeMs)}\n`);
  } catch {
    h.update("entry:unstatable\n");
  }
  for (const pkg of upstreamWorkerPackages(dirname)) {
    const pkgDir = resolveWorkspacePackageDir(dirname, pkg);
    h.update(
      `${pkg}:${pkgDir ? distDirFingerprint(join(pkgDir, "dist")) : "unresolved"}\n`,
    );
  }
  if (vendorDir) {
    try {
      h.update(
        `vendor:${createHash("sha256")
          .update(readFileSync(join(vendorDir, "import-map.json")))
          .digest("hex")}\n`,
      );
    } catch {
      h.update("vendor:unreadable\n");
    }
  }
  return h.digest("hex").slice(0, 16);
}

function vendorKeyOf(vendorImports: Record<string, string>): string {
  const entries = Object.entries(vendorImports).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return createHash("sha256")
    .update(JSON.stringify(entries))
    .digest("hex")
    .slice(0, 16);
}

function readWorkerCacheHit(
  metaPath: string,
  sourceDigest: string,
  vendorKey: string,
  nodeEnv: string,
): boolean {
  if (!existsSync(metaPath)) return false;
  try {
    const cached = JSON.parse(
      readFileSync(metaPath, "utf8"),
    ) as WorkerBundleMeta;
    return (
      cached.sourceDigest === sourceDigest &&
      cached.vendorKey === vendorKey &&
      cached.nodeEnv === nodeEnv &&
      existsSync(join(pathDirname(metaPath), REACTOR_WORKER_ENTRY))
    );
  } catch {
    return false;
  }
}

async function waitForWorkerCacheHit(
  metaPath: string,
  sourceDigest: string,
  vendorKey: string,
  nodeEnv: string,
  lockDir: string,
): Promise<boolean> {
  const deadline = Date.now() + LOCK_STALE_MS;
  while (Date.now() < deadline) {
    if (readWorkerCacheHit(metaPath, sourceDigest, vendorKey, nodeEnv)) {
      return true;
    }
    if (!existsSync(lockDir)) {
      return readWorkerCacheHit(metaPath, sourceDigest, vendorKey, nodeEnv);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/**
 * Build the worker bundle (once, in a throwaway subprocess) into `outDir`.
 * Idempotent: reuses a cached bundle built from the same connect dist, vendor
 * mapping, and builder logic. Returns null on failure (`errorRef` carries the
 * cause) or when the installed Connect has no worker entry.
 */
export async function prebuildReactorWorker(
  options: ReactorWorkerBuildOptions,
): Promise<PrebuiltReactorWorker | null> {
  const entryPath =
    options.entryPath ?? resolveReactorWorkerSource(options.dirname);
  if (!entryPath) {
    if (options.errorRef) {
      options.errorRef.message =
        "the installed @powerhousedao/connect ships no dist/reactor.worker.js";
    }
    return null;
  }
  const vendorImports = options.vendor
    ? workerSafeVendorImports(options.vendor.dir, options.vendor.imports)
    : {};
  const nodeEnv = options.nodeEnv ?? "development";
  const outDir = options.outDir;
  const metaPath = join(outDir, META_FILE);
  const sourceDigest = computeSourceDigest(
    options.dirname,
    entryPath,
    options.vendor?.dir,
  );
  const vendorKey = vendorKeyOf(vendorImports);
  const result: PrebuiltReactorWorker = {
    outDir,
    entry: REACTOR_WORKER_ENTRY,
    sourceDigest,
  };

  try {
    if (readWorkerCacheHit(metaPath, sourceDigest, vendorKey, nodeEnv)) {
      return result;
    }

    const lockDir = `${outDir}.lock`;
    const lock = acquireLock(lockDir);
    if (!lock) {
      const hit = await waitForWorkerCacheHit(
        metaPath,
        sourceDigest,
        vendorKey,
        nodeEnv,
        lockDir,
      );
      return hit ? result : null;
    }

    try {
      if (readWorkerCacheHit(metaPath, sourceDigest, vendorKey, nodeEnv)) {
        return result;
      }
      await buildWorkerAtomic(
        options.dirname,
        outDir,
        entryPath,
        vendorImports,
        nodeEnv,
        { sourceDigest, vendorKey, nodeEnv },
      );
      return result;
    } finally {
      releaseLock(lock);
    }
  } catch (err) {
    if (options.errorRef) {
      options.errorRef.message =
        err instanceof Error ? err.message : String(err);
    }
    return null;
  }
}

async function buildWorkerAtomic(
  dirname: string,
  outDir: string,
  entryPath: string,
  vendorImports: Record<string, string>,
  nodeEnv: "development" | "production",
  meta: WorkerBundleMeta,
): Promise<void> {
  const parent = pathDirname(outDir);
  mkdirSync(parent, { recursive: true });
  const tmpDir = mkdtempSync(join(parent, ".ph-reactor-worker.tmp-"));
  try {
    const { ok, stderr } = await runWorkerBuild(
      dirname,
      tmpDir,
      { "reactor.worker": entryPath },
      vendorImports,
      nodeEnv,
    );
    if (!ok || !existsSync(join(tmpDir, REACTOR_WORKER_ENTRY))) {
      const detail = stderr.trim();
      throw new Error(
        `reactor worker build failed${detail ? `:\n${detail}` : " (no output captured)"}`,
      );
    }

    // A worker dies on its first unresolvable import, and the browser reports
    // only an opaque load failure. Fail here instead, naming the specifiers.
    assertWorkerResolvable(tmpDir);

    writeFileSync(join(tmpDir, META_FILE), JSON.stringify(meta, null, 2));

    const oldDir = `${outDir}.old-${process.pid}-${Date.now()}`;
    if (existsSync(outDir)) renameSync(outDir, oldDir);
    renameSync(tmpDir, outDir);
    // mkdtemp creates 0700; the build and the server are not always the same
    // user (see the vendor swap for the full story).
    chmodSync(outDir, 0o755);
    rmSync(oldDir, { recursive: true, force: true });
  } catch (err) {
    rmSync(tmpDir, { recursive: true, force: true });
    throw err;
  }
}

// Relative specifiers in import positions, used to walk the emitted graph.
const RELATIVE_SPECIFIER_PATTERNS = SPECIFIER_PATTERNS;

function findRelativeSpecifiers(code: string): string[] {
  const found = new Set<string>();
  for (const pattern of RELATIVE_SPECIFIER_PATTERNS) {
    for (const match of code.matchAll(pattern)) {
      const spec = match[1];
      if (spec.startsWith("./") || spec.startsWith("../")) found.add(spec);
    }
  }
  return [...found];
}

// Normalize a bundle-relative path: forward slashes, `.`/`..` folded. Paths
// escaping the bundle (e.g. the ../__vendor__/ externals) come back empty.
function normalizeBundlePath(fromFile: string, spec: string): string {
  const segments = fromFile.split("/").slice(0, -1);
  for (const part of spec.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (segments.length === 0) return "";
      segments.pop();
      continue;
    }
    segments.push(part);
  }
  return segments.join("/");
}

/**
 * Scan the emitted JS files REACHABLE from the entry via import statements
 * for specifiers a worker cannot resolve. Vendor externals were rewritten to
 * ../__vendor__/ relative paths, so anything bare that survives in the graph
 * is a real defect.
 *
 * Deliberately a graph walk, not a directory walk: the bundled reactor code
 * carries `new URL(..., import.meta.url)` references to its node
 * worker-thread entries (executor/projection workers), which Vite emits as
 * stray assets full of node-only imports. They are unreachable dead weight in
 * a browser bundle — the production vendor output tolerates the same files —
 * and must not fail the build.
 */
export function findBundleSpecifierOffenders(
  bundleDir: string,
  entry: string = REACTOR_WORKER_ENTRY,
): { file: string; specs: string[] }[] {
  const offenders: { file: string; specs: string[] }[] = [];
  walkBundleGraph(bundleDir, entry, (file, code) => {
    const specs = findDisallowedSpecifiers(code);
    if (specs.length > 0) offenders.push({ file, specs });
    return true;
  });
  return offenders;
}

// Visits each JS file reachable from `entry` via relative imports, stopping
// as soon as `visit` returns false.
function walkBundleGraph(
  bundleDir: string,
  entry: string,
  visit: (file: string, code: string) => boolean,
): void {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const rel = queue.shift()!;
    if (seen.has(rel)) continue;
    seen.add(rel);
    const full = join(bundleDir, rel);
    if (!existsSync(full) || statSync(full).isDirectory()) continue;
    if (!rel.endsWith(".js") && !rel.endsWith(".mjs")) continue;
    const code = readFileSync(full, "utf8");
    if (!visit(rel, code)) return;
    for (const spec of findRelativeSpecifiers(code)) {
      const next = normalizeBundlePath(rel, spec);
      if (next) queue.push(next);
    }
  }
}

function assertWorkerResolvable(bundleDir: string): void {
  const offenders = findBundleSpecifierOffenders(bundleDir);
  if (offenders.length > 0) {
    throw new Error(
      "reactor worker bundle contains module specifiers a worker cannot resolve:\n" +
        offenders.map((o) => `  ${o.file}: ${o.specs.join(", ")}`).join("\n"),
    );
  }
}

// Page-only code that survives minification: the dynamic-base expression
// (`(globalThis.__PH_DYNAMIC_BASE__||"/")`, set by the serving proxy on the
// main thread only) and the event Vite's preload helper dispatches on
// `window` (the helper also appends `<link>` tags to `document`).
const WORKER_UNSAFE_MARKERS = ["__PH_DYNAMIC_BASE__", "vite:preloadError"];

/** The page-only markers present in `code`, in a fixed order. */
export function findWorkerUnsafeMarkers(code: string): string[] {
  return WORKER_UNSAFE_MARKERS.filter((marker) => code.includes(marker));
}

/**
 * The subset of the vendor's entries a worker may import.
 *
 * The vendor build keeps the React family external: its chunks carry bare
 * `import "react"` statements that the PAGE resolves through its import map.
 * A worker resolves no import map, so externalizing a vendor spec whose chunk
 * closure reaches such an import would kill the worker on its first load —
 * and the chunk graph is shared across vendor entries, so even a React-free
 * module (e.g. an rpc subpath) can be entangled with React through a shared
 * chunk. The vendor is also built for the page: a dynamic-base build rewrites
 * its asset URLs onto a global only the page sets, and its dynamic imports go
 * through Vite's preload helper, which needs `document`. Each entry's own
 * closure inside the vendor dir decides: clean closure, worker-safe; anything
 * bare or page-only in it (see {@link findWorkerUnsafeMarkers}), or a missing
 * entry file, bundled into the worker instead.
 */
export function workerSafeVendorImports(
  vendorDir: string,
  vendorImports: Record<string, string>,
): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [spec, url] of Object.entries(vendorImports)) {
    const entryFile = url.slice(url.lastIndexOf("/") + 1);
    if (!existsSync(join(vendorDir, entryFile))) continue;
    let clean = true;
    walkBundleGraph(vendorDir, entryFile, (_file, code) => {
      clean =
        findDisallowedSpecifiers(code).length === 0 &&
        findWorkerUnsafeMarkers(code).length === 0;
      return clean;
    });
    if (clean) safe[spec] = url;
  }
  return safe;
}

/**
 * Builds arbitrary worker-loadable entries with the worker build config.
 * Exported for the local-package bundles, which need the same self-contained
 * output and vendor externalization at a different depth.
 */
export function runWorkerBuildEntries(
  dirname: string,
  outDir: string,
  entries: Record<string, string>,
  vendorImports: Record<string, string>,
  nodeEnv: "development" | "production",
  vendorPrefix = "../__vendor__/",
): Promise<{ ok: boolean; stderr: string }> {
  return runWorkerBuild(
    dirname,
    outDir,
    entries,
    vendorImports,
    nodeEnv,
    vendorPrefix,
  );
}

function runWorkerBuild(
  dirname: string,
  outDir: string,
  entries: Record<string, string>,
  vendorImports: Record<string, string>,
  nodeEnv: "development" | "production",
  vendorPrefix = "../__vendor__/",
): Promise<{ ok: boolean; stderr: string }> {
  const workerPath = join(outDir, "build-worker.mjs");
  writeFileSync(workerPath, WORKER_BUILD_WORKER);
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        workerPath,
        dirname,
        outDir,
        JSON.stringify(entries),
        JSON.stringify(vendorImports),
        nodeEnv,
        resolveBuilderVite() ?? "",
        vendorPrefix,
      ],
      { cwd: dirname, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stderr = "";
    child.stdout.on("data", (d) => {
      stderr += String(d);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("exit", (code) => {
      rmSync(workerPath, { force: true });
      resolve({ ok: code === 0, stderr });
    });
    child.on("error", (e) => resolve({ ok: false, stderr: String(e) }));
  });
}

/**
 * The vite installed next to this module. The subprocess must run the vite
 * this build config was written against: a consumer project can pin an older
 * vite/rolldown (overrides) whose bundler leaves unresolvable specifiers bare
 * instead of erroring and shims node builtins differently — the output guard
 * then correctly rejects the bundle. builder-tools declares vite as a direct
 * dependency, so this resolution works wherever builder-tools is installed.
 */
function resolveBuilderVite(): string | null {
  try {
    return createRequire(import.meta.url).resolve("vite");
  } catch {
    return null;
  }
}

/**
 * The build subprocess (same pattern as the vendor's). Loads builder-tools'
 * own vite (argv; project fallback) and builds the given entries with
 * relative base, so chunk/asset URLs resolve against each script's own URL
 * under any deploy base. argv: dirname, outDir, entriesJSON (name ->
 * absolute entry path), vendorImportsJSON, nodeEnv, vitePath, vendorPrefix
 * (relative path from the out dir to __vendor__/, e.g. "../__vendor__/").
 */
const WORKER_BUILD_WORKER = `
import { createRequire } from 'node:module';
import { isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const [dirname, outDir, entriesJSON, vendorImportsJSON, nodeEnvArg, vitePathArg, vendorPrefixArg] = process.argv.slice(2);
const nodeEnv = nodeEnvArg ?? 'development';
const entries = JSON.parse(entriesJSON);
const vendorImports = JSON.parse(vendorImportsJSON ?? '{}');
const vendorPrefix = vendorPrefixArg || '../__vendor__/';
const externalSet = new Set(Object.keys(vendorImports));
const vendorPath = (spec) => {
  const url = vendorImports[spec];
  return vendorPrefix + url.slice(url.lastIndexOf('/') + 1);
};
const reqProj = createRequire(dirname + '/noop.js');
// pathToFileURL: on Windows import('D:\\\\...') parses "D:" as a URL scheme.
const vitePath = vitePathArg || reqProj.resolve('vite');
const { build } = await import(pathToFileURL(vitePath).href);
// Resolve bare specifiers from the project (same plugin as the vendor build):
// prefer the bundler's browser-condition-aware resolution, fall back to the
// worker's own resolution for Rolldown's realpath-anchoring bug.
const phResolveCache = new Map();
const phWorkerResolve = {
  name: 'ph-reactor-worker-resolve', enforce: 'pre',
  async resolveId(source, importer, options) {
    if (externalSet.has(source)) return null;
    if (source[0] === '\\0' || source[0] === '.' || isAbsolute(source)) return null;
    if (source.startsWith('node:') || source.startsWith('data:')) return null;
    let viaBundler = null;
    try { viaBundler = await this.resolve(source, importer, { ...options, skipSelf: true }); } catch {}
    if (viaBundler) return viaBundler;
    if (phResolveCache.has(source)) return phResolveCache.get(source);
    let resolved = null;
    try { resolved = fileURLToPath(import.meta.resolve(source)); } catch {}
    phResolveCache.set(source, resolved);
    return resolved;
  },
};
await build({
  root: dirname, configFile: false, logLevel: 'error',
  // The project's public/ dir belongs to the app build, not this bundle.
  publicDir: false,
  // Relative base: emitted chunk/asset URLs resolve against the worker
  // script's own URL, so the bundle works under any deploy base.
  base: './',
  define: {
    'process.env.NODE_ENV': JSON.stringify(nodeEnv),
    'import.meta.env.BASE_URL': JSON.stringify('./'),
  },
  plugins: [phWorkerResolve],
  // pglite ships nested web workers as ES-module chunks.
  worker: { format: 'es' },
  build: {
    // Always minified, dev included: the bundle is browser-served output
    // (sourcemaps carry the debugging story), and minification strips the
    // JSDoc comments whose embedded code samples (kysely's, viem's) would
    // otherwise trip the bare-specifier guard below.
    outDir, emptyOutDir: false, minify: true, target: 'esnext', sourcemap: true,
    // No document in a worker: the module-preload polyfill and preload helper
    // touch the DOM, so dynamic imports must stay plain import().
    modulePreload: false,
    rollupOptions: {
      input: entries,
      // A models entry is pure re-exports; without this the bundler treats
      // its exports as unused and tree-shakes the whole file to nothing.
      // Harmless for the worker entry, which exports nothing to preserve.
      preserveEntrySignatures: 'strict',
      external: (id) => externalSet.has(id),
      output: {
        format: 'es', entryFileNames: '[name].js',
        // Chunks live at the bundle root, not a chunks/ subdir: the vendor
        // paths below are emitted VERBATIM into every chunk, so all modules
        // must sit at the same depth for ../__vendor__/ to resolve.
        chunkFileNames: '[name]-[hash].js', assetFileNames: 'assets/[name]-[hash][extname]',
        paths: (id) => (externalSet.has(id) ? vendorPath(id) : id),
      },
    },
  },
});
`;

const WORKER_BUILD_WORKER_HASH = createHash("sha256")
  .update(WORKER_BUILD_WORKER)
  .digest("hex")
  .slice(0, 16);
