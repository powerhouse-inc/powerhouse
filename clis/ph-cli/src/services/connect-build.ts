import {
  DEFAULT_VENDOR_INCLUDE,
  DYNAMIC_BASE_PLACEHOLDER,
  getConnectBaseViteConfig,
  missingVendorEntries,
  prebuildConnectVendor,
  type PrebuiltVendor,
} from "@powerhousedao/builder-tools";
import { getConfig } from "@powerhousedao/shared/clis";
import {
  normalizeBasePath,
  SHARED_DEP_SPECIFIERS,
  SHARED_SUBPATHS,
} from "@powerhousedao/shared/connect";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import type { InlineConfig } from "vite";
import { build, mergeConfig } from "vite";
import type { ConnectBuildArgs } from "../types.js";
import { buildCliConnectOverride } from "../utils/cli-connect-override.js";
import { runBuild } from "./build.js";

export async function runConnectBuild(args: ConnectBuildArgs) {
  const { outDir, debug, dynamicBase, favicon } = args;

  const mode = "production";
  const dirname = process.cwd();

  // Build has no read mode; a bare positional `<key>` is a user error. The
  // 2-positional `<key> <value>` form is handled inside buildCliConnectOverride
  // so it layers on top of --json + flags like any other override input.
  if (args.keyPositional !== undefined && args.valuePositional === undefined) {
    throw new Error(
      "ph connect build: positional override requires both <key> and <value> (e.g. `ph connect build connect.renown.url https://renown.staging`). To read a value, use `ph connect config <key>`.",
    );
  }

  // Fail fast if any package marked as provider: "local" is missing from
  // node_modules — the Vite plugin that bundles them needs them on disk.
  assertLocalPackagesInstalled(dirname);

  // Build the CLI override layers (--json + individual flags + positional)
  // once here so a bad payload fails before we waste a build.
  // `--packages-registry` lands at the top-level `packageRegistryUrl`
  // (mirrors source-config shape); every other flag feeds the connect-block
  // precedence ladder.
  const { connectOverride, packageRegistryUrl } = buildCliConnectOverride(args);

  await runBuild({
    outDir: "dist",
    debug,
    // Local packages built for Connect share deps with the app vendor, same
    // as a plain `ph build`.
    noSharedDeps: false,
  });

  // Production shared-dependency vendor: prebuilt into <outDir>/__vendor__
  // before the app build. On by default; PH_CONNECT_VENDOR=0|false disables
  // it. A failed prebuild fails the build — production must not ship import
  // map entries pointing at a vendor that was never built (the dev server
  // keeps its own soft fallback in the dev plugin).
  const outDirAbs = resolve(dirname, outDir);
  let vendor: PrebuiltVendor | null = null;
  // The deploy base the vendor's import-map addresses are written against.
  // Only meaningful when the vendor is built; "/" is the inert default.
  let appBase = "/";
  if (isVendorEnabled()) {
    // The vendor dir's parent must exist before the prebuild: its build
    // lock is a sibling of the vendor dir, and the package build (runBuild)
    // writes to a different out dir, so nothing else creates it yet.
    mkdirSync(outDirAbs, { recursive: true });
    const errorRef: { message?: string } = {};
    // The same base string the app build uses below: the dynamic-base
    // placeholder, or the normalized deploy base (CLI override wins over the
    // source config). The vendor worker appends its own segment.
    const phConfig = getConfig(join(dirname, "powerhouse.config.json"));
    const connectBasePath =
      connectOverride?.app?.basePath ?? phConfig.connect?.app?.basePath;
    appBase = dynamicBase
      ? DYNAMIC_BASE_PLACEHOLDER
      : connectBasePath
        ? normalizeBasePath(connectBasePath)
        : "/";
    vendor = await prebuildConnectVendor({
      dirname,
      include: productionVendorInclude(),
      vendorDir: join(outDirAbs, "__vendor__"),
      base: appBase,
      nodeEnv: "production",
      errorRef,
    });
    if (!vendor) {
      console.error(
        `ph connect build: the shared-dependency vendor failed to build${
          errorRef.message ? `:\n${errorRef.message}` : ""
        }`,
      );
      throw new Error("shared-dependency vendor prebuild failed");
    }
    // Stale top-level output goes, the vendor stays: the app build below
    // runs with emptyOutDir: false and must not wipe it.
    cleanDistExcept(outDirAbs, ["__vendor__"]);
  }

  const baseConfig = getConnectBaseViteConfig({
    mode,
    dirname,
    cliConnectOverride: connectOverride,
    cliPackageRegistryUrl: packageRegistryUrl,
    dynamicBase,
    favicon,
    // Vendor import-map entries are relative (leading slash stripped) so
    // they resolve against the page URL under any deploy base — root or
    // subpath, dynamic or concrete.
    vendor: vendor
      ? {
          imports: vendorImportMapEntries(vendor.imports, appBase),
          versions: vendor.versions,
        }
      : undefined,
  });

  const buildConfig: InlineConfig = {
    build: {
      outDir,
      // The vendor dir was prebuilt into the out dir above; the build must
      // not empty it.
      ...(vendor ? { emptyOutDir: false } : {}),
    },
  };

  const config = mergeConfig(baseConfig, buildConfig);

  await build(config);

  // Last word on the shipped artifact: every specifier the page's import map
  // publishes must have a file next to it. The prebuild verifies its own
  // output, but it can return a cache hit it never rebuilt, and both the
  // stale-output clean and the app build run afterwards. An entry with no
  // file behind it ships as a URL that 404s, and a SPA answers that with
  // index.html — so the browser reports only an opaque MIME-type error with
  // no filename. Fail here instead, naming the entries.
  if (vendor) {
    const unbacked = missingVendorEntries(
      join(outDirAbs, "__vendor__"),
      vendor.imports,
    );
    if (unbacked.length > 0) {
      throw new Error(
        `ph connect build: the shared-dependency vendor is missing ` +
          `${unbacked.length} of the ${Object.keys(vendor.imports).length} ` +
          `entries its import map publishes:\n` +
          unbacked.map((e) => `  ${e.spec} -> ${e.url}`).join("\n"),
      );
    }
  }
}

/**
 * The specifier set the production vendor bundles: the dev-proven heavy set
 * ∪ the package-shared set — everything the app and loaded packages
 * externalize onto the vendor.
 *
 * Two specifiers are deliberately dropped:
 *
 * - `@powerhousedao/connect`. It is in DEFAULT_VENDOR_INCLUDE because the dev
 *   server vendors the app to keep rebuilds cheap, but in a production build
 *   the app *is* Connect: `SHARED_DEP_SPECIFIERS` omits it, so the app build
 *   never externalizes it and nothing would ever resolve its import-map
 *   entry. Vendoring it is not merely dead weight — bundling Connect's dist
 *   for the browser pulls in its node-only `@powerhousedao/config/node`
 *   import, and so `read-pkg` -> `unicorn-magic`, whose browser entry has no
 *   `toPath`. That fails the vendor build, and a failed prebuild fails
 *   `ph connect build`.
 * - the bare `@powerhousedao/shared` root, whose barrel likewise reaches
 *   node-only modules. Its browser-safe subpaths (SHARED_SUBPATHS) are
 *   listed instead; a package importing the bare root bundles its own copy.
 */
export function productionVendorInclude(): string[] {
  return [
    ...new Set([
      ...DEFAULT_VENDOR_INCLUDE.filter((s) => s !== "@powerhousedao/connect"),
      ...SHARED_DEP_SPECIFIERS.filter((s) => s !== "@powerhousedao/shared"),
      ...SHARED_SUBPATHS.map((s) => `@powerhousedao/shared/${s}`),
    ]),
  ];
}

/**
 * Turn the vendor's base-less URLs (`/__vendor__/x.js`) into the addresses
 * the page's import map ships, by prefixing the deploy base.
 *
 * An import map *address* must be a URL or begin with `/`, `./` or `../`;
 * anything else is a bare specifier, which the browser rejects — it drops the
 * entry, resolves the specifier to null, and every shared import then fails
 * with "blocked by a null value". So the base is applied rather than the
 * leading slash stripped: a root-relative address is both valid and correct
 * under a subpath deploy, and a dynamic-base build keeps its placeholder for
 * the serving proxy to substitute (the dynamic-base plugin leaves HTML
 * tokens alone by design).
 */
export function vendorImportMapEntries(
  imports: Record<string, string>,
  appBase: string,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(imports).map(([spec, url]) => [
      spec,
      `${appBase}/${url}`.replace(/\/{2,}/g, "/"),
    ]),
  );
}

/**
 * The production vendor prebuild runs on every `ph connect build` unless
 * disabled with PH_CONNECT_VENDOR=0 or false.
 */
export function isVendorEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.PH_CONNECT_VENDOR ?? "1";
  return raw !== "0" && raw !== "false";
}

/**
 * Remove every top-level entry of `dist` except the kept names. Used between
 * the vendor prebuild and the app build so stale app output goes but the
 * just-built vendor stays (the build then runs with emptyOutDir: false).
 * Returns the number of entries removed.
 */
export function cleanDistExcept(dist: string, keep: string[] = []): number {
  if (!existsSync(dist)) return 0;
  let removed = 0;
  for (const entry of readdirSync(dist)) {
    if (keep.includes(entry)) continue;
    rmSync(join(dist, entry), { recursive: true, force: true });
    removed += 1;
  }
  return removed;
}

function assertLocalPackagesInstalled(projectPath: string) {
  const config = getConfig(join(projectPath, "powerhouse.config.json"));
  const localPackages = (config.packages ?? []).filter(
    (p) => p.provider === "local",
  );
  if (localPackages.length === 0) return;

  const missing = localPackages.filter(
    (p) =>
      !existsSync(
        join(projectPath, "node_modules", p.packageName, "package.json"),
      ),
  );
  if (missing.length === 0) return;

  const names = missing.map((p) => p.packageName);
  throw new Error(
    `ph connect build requires these packages to be installed in node_modules (they are declared with provider: "local" in powerhouse.config.json):\n` +
      names.map((n) => `  - ${n}`).join("\n") +
      `\n\nInstall them with:\n  ph install --local ${names.join(" ")}`,
  );
}
