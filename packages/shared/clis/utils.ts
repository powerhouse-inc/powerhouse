// Sub-path: this module loads on the cold path of every CLI invocation.
import lt from "semver/functions/lt.js";
import {
  BOILERPLATE_ALLOWED_BUILDS,
  MINIMUM_NODE_VERSION,
} from "./constants.js";

/**
 * Mutates a resolved `pnpm dlx ...` command to add one `--allow-build=<pkg>`
 * flag per package in {@link BOILERPLATE_ALLOWED_BUILDS}, so pnpm 11's
 * `strict-dep-builds=true` default doesn't prompt for approval during the
 * outer dlx download. No-op for other package managers or non-dlx commands.
 */
export function injectPnpmAllowBuilds(
  pm: string,
  resolved: { command: string; args: string[] },
): void {
  if (pm !== "pnpm" || resolved.args[0] !== "dlx") return;
  const flags = BOILERPLATE_ALLOWED_BUILDS.map((pkg) => `--allow-build=${pkg}`);
  resolved.args = [resolved.args[0], ...flags, ...resolved.args.slice(1)];
}

export class NodeVersionError extends Error {
  constructor(currentVersion: string, minimumVersion: string) {
    super(
      `Node version ${minimumVersion} or higher is required. Current version: ${currentVersion}`,
    );
    this.name = "NodeVersionError";
  }

  static isError(error: unknown): error is NodeVersionError {
    return error instanceof Error && error.name === "NodeVersionError";
  }
}

export function assertNodeVersion(nodeVersion = process.versions.node) {
  if (!nodeVersion) return;

  if (lt(nodeVersion, MINIMUM_NODE_VERSION)) {
    throw new NodeVersionError(nodeVersion, MINIMUM_NODE_VERSION);
  }
}
