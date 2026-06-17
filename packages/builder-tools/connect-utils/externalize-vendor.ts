/**
 * Prebuild the heavy, stable Connect dependencies into a static ESM "vendor"
 * bundle so the dev server never runs (or holds) the dependency optimizer /
 * module graph for them.
 *
 * The reactor-project preview dev-optimizes a large UI graph (Connect itself,
 * design-system, document-engineering, reactor-browser, …) every session —
 * ~1–2 GB resident — even though those libs don't change; only the project's
 * editors do. This module builds them ONCE with `vite build` (in a throwaway
 * subprocess that exits, freeing the build's peak memory): `vite build` handles
 * CSS/asset imports, web workers, and WASM (Connect's in-browser PGlite ships
 * all three), and a multi-entry build with `preserveEntrySignatures: 'strict'`
 * dedupes shared code into shared chunks. Entries for CJS deps re-export the
 * module's named API explicitly (so `import { createRoot }` works); ESM deps
 * use `export *`. The build runs under a dynamic-base placeholder + vendor
 * segment (`connectDynamicBasePlugin`), so emitted asset/chunk URLs
 * (`new URL(…, import.meta.url)` for .wasm/.data/workers) carry the placeholder
 * and resolve at serve time to `<deploy-base>__vendor__/`, while the vendored
 * Connect's `import.meta.env.BASE_URL` resolves to the deploy base.
 *
 * The React family stays EXTERNAL (see `VENDOR_EXTERNAL`); `esmExternalRequirePlugin`
 * owns that externalization and rewrites CJS `require("react")` → import. Vendor
 * chunks keep bare React imports, which the dev import map resolves to Vite's
 * pre-bundled React (`devReactImportmapPlugin`) — one React instance across the
 * vendor, the project's editors, and CDN-loaded editors.
 *
 * `devReactImportmapPlugin` consumes the result: it externalizes these
 * specifiers in the long-lived dev server, points the page import map at the
 * vendor URLs, and serves the bundle. With Connect vendored, the dev server only
 * processes the project's own `main` + local package; HMR for them is unaffected.
 */
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname as pathDirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DYNAMIC_BASE_PLACEHOLDER } from "./vite-plugins/dynamic-base.js";

export interface VendorPrebuildOptions {
  /** Project root (the reactor-project dir). */
  dirname: string;
  /** Bare specifiers to bundle into the vendor (defaults to the heavy libs). */
  include?: string[];
  /** Specifiers left external to the build (defaults to the React family). */
  external?: string[];
  /** Directory to hold the static vendor bundle + import map. */
  vendorDir?: string;
  /** Filled with the failure cause when the prebuild returns null. */
  errorRef?: { message?: string };
}

/**
 * The stable Connect libraries worth prebuilding. The React family is NOT here —
 * it's externalized from the build (see `VENDOR_EXTERNAL`) so the vendor shares
 * the dev server's single React instance via the import map.
 */
export const DEFAULT_VENDOR_INCLUDE = [
  "@powerhousedao/connect",
  "document-model",
  "zod",
  "@powerhousedao/design-system/connect",
  "@powerhousedao/reactor-browser",
  "@powerhousedao/document-engineering",
];

/**
 * React-family specifiers kept external to the vendor build. The vendor's chunks
 * emit bare imports for these; `devReactImportmapPlugin`'s import map resolves
 * them to Vite's pre-bundled React, so there is exactly one React instance.
 */
export const VENDOR_EXTERNAL = [
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  // Dev-server virtual module (bundled local packages). Connect imports it in a
  // try/catch; left external so the build doesn't try to resolve it and the dev
  // server / import map resolves it at runtime.
  "ph-bundled-packages-virtual",
];

export interface PrebuiltVendor {
  vendorDir: string;
  /** import map: bare specifier -> "/__vendor__/<entry>.js". */
  imports: Record<string, string>;
}

/** URL prefix the vendor bundle is served under by the dev middleware. */
export const VENDOR_URL_PREFIX = "/__vendor__/";

// Vite `base` for the vendor build: dynamic-base placeholder + vendor segment.
// connectDynamicBasePlugin rewrites it so chunk/asset URLs resolve at serve time.
const VENDOR_DYNAMIC_BASE = `${DYNAMIC_BASE_PLACEHOLDER}${VENDOR_URL_PREFIX.replace(/^\/+/, "")}`;

/**
 * Build the prebuilt vendor (once, in a throwaway subprocess) and return its dir
 * + import map. Idempotent: reuses a cached vendor built for the same dep set.
 * Returns null on any failure (caller falls back to a normal dev server).
 */
export async function prebuildConnectVendor(
  options: VendorPrebuildOptions,
): Promise<PrebuiltVendor | null> {
  const include = expandIncludeSubpaths(
    options.dirname,
    options.include ?? DEFAULT_VENDOR_INCLUDE,
  );
  const external = options.external ?? VENDOR_EXTERNAL;
  const vendorDir =
    options.vendorDir ?? join(options.dirname, "node_modules/.ph-vendor");
  const importMapPath = join(vendorDir, "import-map.json");
  // A version change of any vendored dep must invalidate the cache, so the
  // resolved versions are part of the key (not just the specifier lists).
  const versionDigest = resolveVersionDigest(options.dirname, [
    ...include,
    ...external,
  ]);

  try {
    const hit = readCacheHit(importMapPath, include, external, versionDigest);
    if (hit) return { vendorDir, imports: hit };

    // Serialize concurrent builders on a lock dir; a loser waits for the
    // winner's result instead of clobbering the shared output.
    const lockDir = `${vendorDir}.lock`;
    const lock = acquireLock(lockDir);
    if (!lock) {
      const imports = await waitForCacheHit(
        importMapPath,
        include,
        external,
        versionDigest,
        lockDir,
      );
      return imports ? { vendorDir, imports } : null;
    }

    try {
      // Recheck under the lock: another builder may have finished while we
      // were acquiring it.
      const raced = readCacheHit(
        importMapPath,
        include,
        external,
        versionDigest,
      );
      if (raced) return { vendorDir, imports: raced };

      const imports = await buildVendorAtomic(
        options.dirname,
        vendorDir,
        include,
        external,
        versionDigest,
      );
      return imports ? { vendorDir, imports } : null;
    } finally {
      releaseLock(lock);
    }
  } catch (err) {
    if (options.errorRef)
      options.errorRef.message =
        err instanceof Error ? err.message : String(err);
    return null;
  }
}

interface VendorCacheMeta {
  include?: string[];
  external?: string[];
  versionDigest?: string;
  imports: Record<string, string>;
}

// Return the cached import map iff the specifier sets AND the resolved-version
// digest all match; otherwise null (forces a rebuild).
function readCacheHit(
  importMapPath: string,
  include: string[],
  external: string[],
  versionDigest: string,
): Record<string, string> | null {
  if (!existsSync(importMapPath)) return null;
  try {
    const cached = JSON.parse(
      readFileSync(importMapPath, "utf8"),
    ) as VendorCacheMeta;
    if (
      sameSet(cached.include, include) &&
      sameSet(cached.external, external) &&
      cached.versionDigest === versionDigest
    ) {
      return cached.imports;
    }
  } catch {
    // partial/corrupt import-map.json → treat as miss
  }
  return null;
}

// Hash the resolved version of each spec's owning package (from its installed
// package.json). A bump or branch checkout that changes any version yields a
// different digest, invalidating the cache. Unresolvable specs contribute a
// sentinel so they don't silently collide.
function resolveVersionDigest(dirname: string, specs: string[]): string {
  const seen = new Map<string, string>();
  for (const spec of specs) {
    const { pkg } = parsePkg(spec);
    if (seen.has(pkg)) continue;
    let version = "missing";
    try {
      const pkgRoot = realpathSync(join(dirname, "node_modules", pkg));
      const meta = JSON.parse(
        readFileSync(join(pkgRoot, "package.json"), "utf8"),
      ) as { version?: string };
      version = String(meta.version ?? "unknown");
    } catch {
      // leave sentinel
    }
    seen.set(pkg, version);
  }
  const h = createHash("sha256");
  // Fold in the build worker so a logic/build-option change busts stale bundles,
  // not just a dep version bump.
  const workerHash = createHash("sha256")
    .update(VENDOR_BUILD_WORKER)
    .digest("hex");
  h.update(`worker:${workerHash}\n`);
  for (const pkg of [...seen.keys()].sort()) {
    h.update(`${pkg}@${seen.get(pkg)}\n`);
  }
  return h.digest("hex").slice(0, 16);
}

function sameSet(a: string[] | undefined, b: string[]): boolean {
  if (!a || a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

// Exclusive lock via mkdir (atomic on POSIX). The holder heartbeats an owner
// file so a live (slow) build keeps it fresh; a crashed builder lets it go stale.
const LOCK_STALE_MS = 5 * 60_000;
const LOCK_HEARTBEAT_MS = 60_000;

interface VendorLock {
  dir: string;
  token: string;
  timer: ReturnType<typeof setInterval>;
}

const ownerFile = (lockDir: string): string => join(lockDir, "owner");

// Stale iff the owner file hasn't been heartbeated within LOCK_STALE_MS. A
// missing owner file means a builder mid-acquire — treat as fresh, don't steal.
function lockIsStale(lockDir: string): boolean {
  try {
    return Date.now() - statSync(ownerFile(lockDir)).mtimeMs > LOCK_STALE_MS;
  } catch {
    return false;
  }
}

function acquireLock(lockDir: string): VendorLock | null {
  let made = false;
  try {
    mkdirSync(lockDir);
    made = true;
  } catch {
    if (lockIsStale(lockDir)) {
      try {
        rmSync(lockDir, { recursive: true, force: true });
        mkdirSync(lockDir);
        made = true;
      } catch {
        // lost the reclaim race to another builder
      }
    }
  }
  if (!made) return null;
  const token = `${process.pid}-${randomUUID()}`;
  writeFileSync(ownerFile(lockDir), token);
  // Refresh mtime while we still own it; stop if a stale-reclaim handed it off.
  const timer = setInterval(() => {
    try {
      if (readFileSync(ownerFile(lockDir), "utf8") === token) {
        writeFileSync(ownerFile(lockDir), token);
      } else {
        clearInterval(timer);
      }
    } catch {
      clearInterval(timer);
    }
  }, LOCK_HEARTBEAT_MS);
  timer.unref();
  return { dir: lockDir, token, timer };
}

// Remove only if we still own it — a stale-reclaim may have handed the lock to
// another builder, whose dir we must not delete.
function releaseLock(lock: VendorLock): void {
  clearInterval(lock.timer);
  try {
    if (readFileSync(ownerFile(lock.dir), "utf8") === lock.token) {
      rmSync(lock.dir, { recursive: true, force: true });
    }
  } catch {
    // owner file gone/unreadable — leave it for the stale path
  }
}

// Loser path: poll for the winner to publish a matching import-map.json, until
// the lock is released or a timeout elapses.
async function waitForCacheHit(
  importMapPath: string,
  include: string[],
  external: string[],
  versionDigest: string,
  lockDir: string,
): Promise<Record<string, string> | null> {
  const deadline = Date.now() + LOCK_STALE_MS;
  while (Date.now() < deadline) {
    const hit = readCacheHit(importMapPath, include, external, versionDigest);
    if (hit) return hit;
    if (!existsSync(lockDir)) {
      // winner finished (or gave up); one last read
      return readCacheHit(importMapPath, include, external, versionDigest);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

// Resolve an exports entry to the file it loads under browser/import
// conditions, or null if none (e.g. document-model's node-only `./node`). Used
// to skip node-only and CSS/JSON subpaths the browser-targeted build can't take.
function importTarget(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  for (const c of ["browser", "import", "module", "default"]) {
    if (c in o) {
      const t = importTarget(o[c]);
      if (t) return t;
    }
  }
  return null;
}

function parsePkg(spec: string): { pkg: string; sub: string } {
  if (spec.startsWith("@")) {
    const parts = spec.split("/");
    return { pkg: parts.slice(0, 2).join("/"), sub: parts.slice(2).join("/") };
  }
  const i = spec.indexOf("/");
  return i === -1
    ? { pkg: spec, sub: "" }
    : { pkg: spec.slice(0, i), sub: spec.slice(i + 1) };
}

/**
 * Connect imports the heavy libs by subpath too (e.g.
 * `@powerhousedao/design-system/connect/toast`, `zod/v4/core`). Those bare
 * imports need their own import-map entry, so expand each listed spec to its
 * package's concrete (non-wildcard, JS) subpath exports that share the spec's
 * prefix. Unresolvable / CSS / JSON targets are skipped. Failures leave the
 * original spec untouched.
 */
function expandIncludeSubpaths(dirname: string, include: string[]): string[] {
  const out = new Set<string>(include);
  for (const spec of include) {
    const { pkg, sub } = parsePkg(spec);
    let exp: unknown;
    let pkgRoot: string;
    try {
      pkgRoot = realpathSync(join(dirname, "node_modules", pkg));
      const pkgJson = JSON.parse(
        readFileSync(join(pkgRoot, "package.json"), "utf8"),
      ) as { exports?: unknown };
      exp = pkgJson.exports;
    } catch {
      continue;
    }
    if (!exp || typeof exp !== "object") continue;
    const expMap = exp as Record<string, unknown>;
    const prefixKey = sub ? `./${sub}` : ".";
    for (const key of Object.keys(expMap)) {
      if (key.includes("*") || key === "./package.json") continue;
      if (/\.(css|json|scss)$/.test(key)) continue;
      const matches =
        prefixKey === "."
          ? key === "." || key.startsWith("./")
          : key === prefixKey || key.startsWith(`${prefixKey}/`);
      if (!matches) continue;
      const target = importTarget(expMap[key]);
      if (!target || /\.(css|json|scss)$/.test(target)) continue;
      // Skip subpaths whose target file isn't shipped (e.g. a `./test` export
      // pointing at unbuilt dist) — they'd fail the build.
      if (!existsSync(join(pkgRoot, target))) continue;
      out.add(key === "." ? pkg : pkg + key.slice(1));
    }
  }
  return [...out];
}

/**
 * Build the vendor into a unique temp dir, then atomically swap it into place,
 * so a concurrent reader never sees a partial bundle or import-map.json. Runs
 * the build in a throwaway subprocess (its peak memory is reclaimed on exit);
 * the parent augments the import map with the version digest and does the swap.
 * Returns the published import map, or null on failure.
 */
async function buildVendorAtomic(
  dirname: string,
  vendorDir: string,
  include: string[],
  external: string[],
  versionDigest: string,
): Promise<Record<string, string> | null> {
  const parent = pathDirname(vendorDir);
  mkdirSync(parent, { recursive: true });
  const tmpDir = mkdtempSync(join(parent, ".ph-vendor.tmp-"));
  try {
    const { ok, stderr } = await runBuildWorker(
      dirname,
      tmpDir,
      include,
      external,
    );
    const tmpMap = join(tmpDir, "import-map.json");
    if (!ok || !existsSync(tmpMap)) {
      const detail = stderr.trim();
      throw new Error(
        `vendor build failed${detail ? `:\n${detail}` : " (no output captured)"}`,
      );
    }
    // Stamp the version digest into the published metadata so the cache check
    // can detect a dep bump.
    const meta = JSON.parse(readFileSync(tmpMap, "utf8")) as VendorCacheMeta;
    meta.versionDigest = versionDigest;
    writeFileSync(tmpMap, JSON.stringify(meta, null, 2));

    // Swap: move any existing dir aside, rename temp into place, drop the old.
    const oldDir = `${vendorDir}.old-${process.pid}-${Date.now()}`;
    if (existsSync(vendorDir)) renameSync(vendorDir, oldDir);
    renameSync(tmpDir, vendorDir);
    rmSync(oldDir, { recursive: true, force: true });
    return meta.imports;
  } catch (err) {
    rmSync(tmpDir, { recursive: true, force: true });
    throw err;
  }
}

/**
 * Spawn a throwaway worker that generates one entry per specifier (CJS deps get
 * explicit named re-exports, ESM deps `export *`), `vite build`s them into the
 * given out dir, and writes the import map. Captures stdout/stderr so a failure
 * is debuggable; the normal path stays quiet.
 */
function runBuildWorker(
  dirname: string,
  outDir: string,
  include: string[],
  external: string[],
): Promise<{ ok: boolean; stderr: string }> {
  const workerPath = join(outDir, "build-worker.mjs");
  writeFileSync(workerPath, VENDOR_BUILD_WORKER);
  // Absolute path to this (built) module so the worker can import the
  // dynamic-base plugin from builder-tools' own bundle.
  const selfModulePath = fileURLToPath(import.meta.url);
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        workerPath,
        dirname,
        outDir,
        JSON.stringify(include),
        VENDOR_URL_PREFIX,
        JSON.stringify(external),
        VENDOR_DYNAMIC_BASE,
        selfModulePath,
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
    child.on("exit", (code) => resolve({ ok: code === 0, stderr }));
    child.on("error", (e) => resolve({ ok: false, stderr: String(e) }));
  });
}

/**
 * The vendor build worker, written to disk and run as a subprocess. Loads
 * `vite` from the project and `connectDynamicBasePlugin` from builder-tools' own
 * built bundle (selfModulePath). argv: dirname, vendorDir, includeJSON,
 * urlPrefix, externalJSON, dynamicBase, selfModulePath.
 */
const VENDOR_BUILD_WORKER = `
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const [dirname, vendorDir, includeJSON, urlPrefix, externalJSON, dynamicBase, selfModulePath] = process.argv.slice(2);
const include = JSON.parse(includeJSON);
const external = JSON.parse(externalJSON ?? '[]');
const externalSet = new Set(external);
const reqProj = createRequire(join(dirname, 'noop.js'));
const { build, esmExternalRequirePlugin } = await import(reqProj.resolve('vite'));
// Load the dynamic-base plugin from builder-tools' own built bundle (passed as
// an absolute path) — it isn't resolvable as a bare specifier from the worker.
const { connectDynamicBasePlugin, DYNAMIC_BASE_PLACEHOLDER } = await import(pathToFileURL(selfModulePath));
const srcDir = join(vendorDir, '.entries');
mkdirSync(srcDir, { recursive: true });
const entryName = (spec) => spec.replace(/[^\\w]+/g, '_');
const RESERVED = new Set('enum void null function in instanceof typeof new delete do if else return switch case break continue for while this true false class const let var default export import extends super with yield debugger finally throw try catch await implements interface package private protected public static eval arguments'.split(' '));
const input = {};
for (const spec of include) {
  const name = entryName(spec);
  let src;
  try {
    // Import the bare spec (not reqProj.resolve(spec)) so Node picks the same
    // import/browser-condition module the build resolves — resolving first can
    // pick a CJS sibling whose default-export shape differs from the ESM build.
    const ns = await import(spec);
    // Only fall back to re-exporting from default when the module exposes NO
    // top-level named exports (a true CJS-interop module). If it does (e.g. zod
    // exposes \`z\`), \`export *\` captures them; destructuring default would miss
    // top-level names that aren't keys of the default object.
    const named = Object.keys(ns).filter((k) => k !== 'default');
    const cjs = named.length === 0 && ns.default && typeof ns.default === 'object';
    if (cjs) {
      const names = Object.keys(ns.default).filter((k) => k !== 'default' && k !== '__esModule' && /^[A-Za-z_$][\\w$]*$/.test(k));
      const plain = names.filter((n) => !RESERVED.has(n));
      const reserved = names.filter((n) => RESERVED.has(n));
      src = 'import d from ' + JSON.stringify(spec) + ';\\nexport default d;\\n'
        + (plain.length ? 'export const { ' + plain.join(', ') + ' } = d;\\n' : '');
      // reserved words are invalid as const-binding names but valid as export
      // aliases (export { x as enum }).
      reserved.forEach((n, i) => {
        src += 'const __r' + i + ' = d[' + JSON.stringify(n) + '];\\nexport { __r' + i + ' as ' + n + ' };\\n';
      });
    } else {
      src = 'export * from ' + JSON.stringify(spec) + ';\\n'
        + (('default' in ns) ? 'export { default } from ' + JSON.stringify(spec) + ';\\n' : '');
    }
  } catch {
    src = 'export * from ' + JSON.stringify(spec) + ';\\n';
  }
  const file = join(srcDir, name + '.js');
  writeFileSync(file, src);
  input[name] = file;
}
// Prefer the bundler's browser-condition-aware resolution; fall back to resolving
// from the worker (real install path) only for Rolldown's realpath-anchoring bug.
const phResolveCache = new Map();
const phVendorResolve = {
  name: 'ph-vendor-resolve', enforce: 'pre',
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
  // Dynamic-base placeholder + vendor segment: connectDynamicBasePlugin rewrites
  // emitted chunk/asset URLs to resolve against the deploy base at serve time.
  base: dynamicBase,
  define: {
    'process.env.NODE_ENV': '"development"',
    // BASE_URL resolves to the deploy base (not the vendor prefix) so vendored
    // Connect's router basename + BASE_URL-relative fetches use the right path.
    'import.meta.env.BASE_URL': JSON.stringify(DYNAMIC_BASE_PLACEHOLDER),
  },
  // phVendorResolve (pre) resolves bares from the worker; esmExternalRequirePlugin owns
  // react/virtual externalization; connectDynamicBasePlugin (post) rewrites the placeholder base.
  plugins: [phVendorResolve, esmExternalRequirePlugin({ external }), connectDynamicBasePlugin()],
  // pglite ships web workers as ES-module chunks. workerStripPrefix is the vendor
  // segment so the worker recovers the deploy base, not the vendor prefix.
  worker: { format: 'es', plugins: () => [connectDynamicBasePlugin({ forWorker: true, workerStripPrefix: urlPrefix.replace(/^\\/+/, '') })] },
  build: {
    outDir: vendorDir, emptyOutDir: false, minify: false, target: 'esnext', cssCodeSplit: true,
    rollupOptions: {
      input, preserveEntrySignatures: 'strict',
      output: { format: 'es', entryFileNames: '[name].js', chunkFileNames: 'chunks/[name]-[hash].js', assetFileNames: 'assets/[name]-[hash][extname]' },
    },
  },
});
rmSync(srcDir, { recursive: true, force: true });
const imports = {};
for (const spec of include) imports[spec] = urlPrefix + entryName(spec) + '.js';
writeFileSync(join(vendorDir, 'import-map.json'), JSON.stringify({ include, external, imports }, null, 2));
`;
