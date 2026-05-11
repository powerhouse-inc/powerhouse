declare const CLI_VERSION: string | undefined;
declare const CLI_GIT_SHA: string | undefined;

/**
 * Returns the CLI version string. Replaced inline by tsdown's `define` at
 * build time; falls back to env vars when running un-bundled (e.g. via
 * `bun run scripts/generate-commands-docs.ts` or `bun run src/cli.ts`).
 */
export function getVersion() {
  if (typeof CLI_VERSION !== "undefined") return CLI_VERSION;
  return (
    process.env.WORKSPACE_VERSION ||
    process.env.npm_package_version ||
    "unknown"
  );
}

export function getGitHash() {
  if (typeof CLI_GIT_SHA !== "undefined") return CLI_GIT_SHA;
  return process.env.WORKSPACE_GIT_SHA || "unknown";
}
