declare const CLI_VERSION: string | undefined;
declare const CLI_GIT_SHA: string | undefined;

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
