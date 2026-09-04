import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import type { Plugin } from "vite";
/** Name of the build-identity file emitted into the build output. */
export const BUILD_HASH_FILE = "build-hash.json" as const;

export interface BuildHashInput {
  /** Monorepo workspace git SHA (CI/dev builds); empty outside the monorepo. */
  workspaceGitSha: string;
  /** Monorepo workspace version (CI/dev builds); empty outside it. */
  workspaceVersion: string;
  /** Version of @powerhousedao/connect installed in the project — the
   * published Connect code identity for standalone/Docker builds. */
  connectPackageVersion: string;
  /** Full powerhouse.config.json contents (drives, connect block, packages…). */
  projectConfig: unknown;
  /** Effective package list (config + PH_PACKAGES env override). */
  packages: string[];
  /** Resolved deploy base path (affects emitted asset URLs). */
  connectBasePath: string;
  /** Whether the offline/PWA build variant is emitted. */
  offlineEnabled: boolean;
  /** Packages registry URL baked into the runtime config. */
  packageRegistryUrl: string;
}

/**
 * Deterministic identity of a Connect build. Differs whenever the deployed
 * content differs (published Connect version, project config, package list,
 * build options) so the SPA can detect "the server is serving a different
 * build than the one this bundle was built from" by comparing its baked copy
 * (define `PH_CONNECT_BUILD_HASH`) to `build-hash.json`, which the build
 * emits alongside the app and the server must serve no-cache.
 */
export function computeBuildHash(input: BuildHashInput): string {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 16);
}

/**
 * Read the installed @powerhousedao/connect version. The package's `exports`
 * map does not expose a `./package.json` subpath, so `require.resolve(
 * "…/package.json")` throws — resolve the main entry and walk up to the
 * package root instead.
 */
function readConnectVersion(projectRoot: string): string {
  try {
    const require = createRequire(join(projectRoot, "package.json"));
    const entry = require.resolve("@powerhousedao/connect", {
      paths: [projectRoot],
    });
    let dir = dirname(entry);
    for (;;) {
      try {
        const pkg = JSON.parse(
          readFileSync(join(dir, "package.json"), "utf-8"),
        ) as { name?: string; version?: string };
        if (pkg.name === "@powerhousedao/connect") {
          return pkg.version ?? "unknown";
        }
      } catch {
        // no readable package.json at this level; keep walking up
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // Connect not resolvable from this project; fall through to "unknown".
  }
  return "unknown";
}

export function buildHashFromBuildOptions(options: {
  dirname: string;
  phConfig: unknown;
  packages: ReadonlyArray<{
    packageName: string;
    version?: string;
    provider?: string;
  }>;
  connectBasePath?: string | null;
  offlineEnabled: boolean;
  packageRegistryUrl?: string | null;
}): string {
  return computeBuildHash({
    workspaceGitSha: process.env.WORKSPACE_GIT_SHA ?? "",
    workspaceVersion: process.env.WORKSPACE_VERSION ?? "",
    connectPackageVersion: readConnectVersion(options.dirname),
    projectConfig: options.phConfig,
    packages: options.packages.map(
      (p) => `${p.packageName}@${p.version ?? ""}:${p.provider ?? ""}`,
    ),
    connectBasePath: options.connectBasePath ?? "",
    offlineEnabled: options.offlineEnabled,
    packageRegistryUrl: options.packageRegistryUrl ?? "",
  });
}

/**
 * Emits `build-hash.json` (`{"hash": "<build id>"}`) into the build output.
 * Emitted as an asset so it lands at the deploy base like every other file.
 * Build-only: dev (studio) never runs generateBundle, and the SPA check
 * treats a missing file as "nothing to compare" and stays silent.
 */
export function connectBuildHashPlugin(buildHash: string): Plugin {
  return {
    name: "ph-connect-build-hash",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: BUILD_HASH_FILE,
        source: `${JSON.stringify({ hash: buildHash }, null, 2)}\n`,
      });
    },
  };
}
