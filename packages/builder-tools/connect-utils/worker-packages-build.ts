/**
 * Prebuild a project's local packages into worker-loadable model bundles.
 *
 * The reactor worker gets document models from the registry CDN or from what
 * Connect statically bundled. A project's own (`provider: "local"`) package is
 * in neither, so its document types have no reducer in the worker and their
 * load jobs fail. So the entries are prebuilt here: by `ph connect build`,
 * next to the worker bundle they are loaded beside, and by the dev server for
 * the packages other than the project, whose models it serves live.
 *
 * Each package's `browser/document-models/index.js` (reducers only: no React,
 * no CSS, no editors) is built self-contained, with the worker-safe subset of
 * the vendor externalized onto `../../__vendor__/` - two levels up, since
 * these land in `__reactor_worker__/packages/`. A `manifest.json` names what
 * was built so the tab can turn it into package sources without guessing.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname as pathDirname, join } from "node:path";
import { workerPackageFileName } from "@powerhousedao/shared/connect";
import {
  findBundleSpecifierOffenders,
  publishDirAtomic,
  runWorkerBuildEntries,
  workerSafeVendorImports,
  type ReactorWorkerVendorOptions,
} from "./reactor-worker-build.js";

/** Served under `<base>__reactor_worker__/packages/`. */
export const WORKER_PACKAGES_MANIFEST = "manifest.json";

/** Vendor is two levels up from `__reactor_worker__/packages/`. */
const VENDOR_PREFIX = "../../__vendor__/";

export interface WorkerPackagesBuildOptions {
  /** Project root the packages resolve from. */
  dirname: string;
  /** Local package names (`provider: "local"` in powerhouse.config.json). */
  packages: string[];
  /** Directory to hold the bundles (`<dist>/__reactor_worker__/packages`). */
  outDir: string;
  /** The prebuilt vendor to share dependencies with, when one was built. */
  vendor?: ReactorWorkerVendorOptions;
  /**
   * The vendor's worker-safe subset, when the caller already computed it
   * (`PrebuiltReactorWorker.vendorImports`); skips walking the vendor again.
   */
  safeVendorImports?: Record<string, string>;
  nodeEnv?: "development" | "production";
  errorRef?: { message?: string };
}

export interface WorkerPackageManifestEntry {
  name: string;
  version?: string;
  /** Filename inside outDir, as {@link workerPackageFileName} spells it. */
  file: string;
}

function readVersion(root: string): string | undefined {
  try {
    const meta = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    ) as { version?: string };
    return typeof meta.version === "string" ? meta.version : undefined;
  } catch {
    // version is decoration; the bundle is what matters
    return undefined;
  }
}

/**
 * A package root's models entry, or null when it ships none.
 *
 * Two roots are possible and both are normal: an installed dependency under
 * `node_modules/<name>`, and the project itself - the vetra case, where the
 * project *is* the local package and has no self-link in node_modules.
 */
function resolvePackageModels(
  dirname: string,
  name: string,
): { entryPath: string; version?: string } | null {
  const roots: string[] = [];
  try {
    roots.push(realpathSync(join(dirname, "node_modules", name)));
  } catch {
    // not installed; the project itself may still be the package
  }
  if (readProjectName(dirname) === name) {
    roots.push(dirname);
  }
  for (const root of roots) {
    const entryPaths = [
      join(root, "dist", "browser", "document-models", "index.js"),
      // A library build (vetra's): its `./document-models` export.
      exportedModelsEntry(root),
    ];
    const entryPath = entryPaths.find(
      (candidate) => candidate !== undefined && existsSync(candidate),
    );
    if (entryPath) {
      return { entryPath, version: readVersion(root) };
    }
  }
  return null;
}

/** The file a package's `./document-models` export names for a browser. */
function exportedModelsEntry(root: string): string | undefined {
  let exports: unknown;
  try {
    exports = (
      JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
        exports?: unknown;
      }
    ).exports;
  } catch {
    return undefined;
  }
  if (!exports || typeof exports !== "object") return undefined;
  const target = exportTarget(
    (exports as Record<string, unknown>)["./document-models"],
  );
  return target ? join(root, target) : undefined;
}

function exportTarget(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;
  for (const condition of ["browser", "import", "default"]) {
    const target = exportTarget((value as Record<string, unknown>)[condition]);
    if (target) return target;
  }
  return undefined;
}

function readProjectName(dirname: string): string | undefined {
  try {
    const meta = JSON.parse(
      readFileSync(join(dirname, "package.json"), "utf8"),
    ) as { name?: string };
    return typeof meta.name === "string" ? meta.name : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The project's own package name when it ships a models bundle, so a caller
 * can include it beside the configured `provider: "local"` packages. A vetra
 * project declares no package entry for itself, yet its models are exactly
 * the ones the worker is missing.
 */
export function ownProjectPackage(dirname: string): string | undefined {
  const name = readProjectName(dirname);
  if (!name) return undefined;
  return resolvePackageModels(dirname, name) ? name : undefined;
}

/**
 * The local packages whose models the reactor worker loads: the configured
 * `provider: "local"` packages, and the project itself when it ships a models
 * bundle. `own: false` leaves the project out, for the dev server, which
 * serves the project's models live.
 */
export function workerLocalPackages(
  dirname: string,
  packages: readonly { packageName: string; provider?: string }[] | undefined,
  options: { own?: boolean } = {},
): string[] {
  const configured = (packages ?? [])
    .filter((p) => p.provider === "local")
    .map((p) => p.packageName);
  if (options.own === false) {
    const project = readProjectName(dirname);
    return [...new Set(configured.filter((name) => name !== project))];
  }
  const own = ownProjectPackage(dirname);
  return [...new Set([...configured, ...(own ? [own] : [])])];
}

/**
 * Build each local package's models entry into `outDir` and write the
 * manifest the tab reads. Returns the manifest entries (empty when no local
 * package ships a models bundle), or null when the build itself failed -
 * `errorRef` then carries the cause. Both of those remove `outDir`, so a
 * previous build's bundles never outlive the packages they came from.
 */
export async function prebuildWorkerPackages(
  options: WorkerPackagesBuildOptions,
): Promise<WorkerPackageManifestEntry[] | null> {
  const nodeEnv = options.nodeEnv ?? "production";
  const resolved: {
    entry: WorkerPackageManifestEntry;
    entryPath: string;
  }[] = [];
  for (const name of options.packages) {
    const models = resolvePackageModels(options.dirname, name);
    if (!models) continue;
    resolved.push({
      entry: {
        name,
        version: models.version,
        file: workerPackageFileName(name),
      },
      entryPath: models.entryPath,
    });
  }
  if (resolved.length === 0) {
    rmSync(options.outDir, { recursive: true, force: true });
    return [];
  }

  const vendorImports =
    options.safeVendorImports ??
    (options.vendor
      ? workerSafeVendorImports(options.vendor.dir, options.vendor.imports)
      : {});
  // Entry names are the filenames minus `.js`; the subprocess appends it.
  const entries = Object.fromEntries(
    resolved.map((item) => [
      item.entry.file.replace(/\.js$/, ""),
      item.entryPath,
    ]),
  );

  const parent = pathDirname(options.outDir);
  mkdirSync(parent, { recursive: true });
  const tmpDir = mkdtempSync(join(parent, ".ph-worker-packages.tmp-"));
  try {
    const { ok, stderr } = await runWorkerBuildEntries(
      options.dirname,
      tmpDir,
      entries,
      vendorImports,
      nodeEnv,
      VENDOR_PREFIX,
    );
    const missing = resolved.filter(
      (item) => !existsSync(join(tmpDir, item.entry.file)),
    );
    if (!ok || missing.length > 0) {
      const detail = stderr.trim();
      throw new Error(
        `worker package bundles failed to build${
          missing.length > 0
            ? ` (missing: ${missing.map((m) => m.entry.name).join(", ")})`
            : ""
        }${detail ? `:\n${detail}` : ""}`,
      );
    }

    // Same guard as the worker entry: a bare specifier here kills the import
    // inside the worker, with only an opaque failure to show for it.
    for (const item of resolved) {
      const offenders = findBundleSpecifierOffenders(tmpDir, item.entry.file);
      if (offenders.length > 0) {
        throw new Error(
          `worker package bundle for ${item.entry.name} contains module ` +
            `specifiers a worker cannot resolve:\n` +
            offenders
              .map((o) => `  ${o.file}: ${o.specs.join(", ")}`)
              .join("\n"),
        );
      }
    }

    const manifest = resolved.map((item) => item.entry);
    writeFileSync(
      join(tmpDir, WORKER_PACKAGES_MANIFEST),
      JSON.stringify(manifest, null, 2),
    );

    publishDirAtomic(tmpDir, options.outDir);
    return manifest;
  } catch (err) {
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(options.outDir, { recursive: true, force: true });
    if (options.errorRef) {
      options.errorRef.message =
        err instanceof Error ? err.message : String(err);
    }
    return null;
  }
}
