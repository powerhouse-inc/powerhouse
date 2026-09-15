import {
  DEFAULT_VENDOR_INCLUDE,
  DYNAMIC_BASE_PLACEHOLDER,
  getConnectBaseViteConfig,
  prebuildConnectVendor,
  type PrebuiltVendor,
} from "@powerhousedao/builder-tools";
import { getConfig } from "@powerhousedao/shared/clis";
import {
  normalizeBasePath,
  SHARED_DEP_SPECIFIERS,
} from "@powerhousedao/shared/connect";
import { existsSync, readdirSync, rmSync } from "node:fs";
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
  });

  // Production shared-dependency vendor: prebuilt into <outDir>/__vendor__
  // before the app build. On by default; PH_CONNECT_VENDOR=0|false disables
  // it. A failed prebuild fails the build — production must not ship import
  // map entries pointing at a vendor that was never built (the dev server
  // keeps its own soft fallback in the dev plugin).
  const outDirAbs = resolve(dirname, outDir);
  let vendor: PrebuiltVendor | null = null;
  if (isVendorEnabled()) {
    const errorRef: { message?: string } = {};
    // The same base string the app build uses below: the dynamic-base
    // placeholder, or the normalized deploy base (CLI override wins over the
    // source config). The vendor worker appends its own segment.
    const phConfig = getConfig(join(dirname, "powerhouse.config.json"));
    const connectBasePath =
      connectOverride?.app?.basePath ?? phConfig.connect?.app?.basePath;
    const appBase = dynamicBase
      ? DYNAMIC_BASE_PLACEHOLDER
      : connectBasePath
        ? normalizeBasePath(connectBasePath)
        : "/";
    vendor = await prebuildConnectVendor({
      dirname,
      // The dev-proven heavy set ∪ the package-shared set: everything the
      // app and packages externalize onto the vendor.
      include: [
        ...new Set([...DEFAULT_VENDOR_INCLUDE, ...SHARED_DEP_SPECIFIERS]),
      ],
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
          imports: Object.fromEntries(
            Object.entries(vendor.imports).map(([spec, url]) => [
              spec,
              url.startsWith("/") ? url.slice(1) : url,
            ]),
          ),
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
