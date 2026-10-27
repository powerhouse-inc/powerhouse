// Hardcoded so ph-cmd's dispatch doesn't have to evaluate phCliHelpCommands.
// The compile-time guard in args/help.ts catches drift.
export const phCliCommandNames = [
  "run",
  "host",
  "generate",
  "vetra",
  "connect",
  "build",
  "publish",
  "list",
  "l",
  "access-token",
  "registry-login",
  "inspect",
  "is",
  "mcp",
  "migrate",
  "switchboard",
  "reactor",
  "login",
  "logout",
  "install",
  "add",
  "i",
  "uninstall",
  "remove",
] as const;

/** The uniform-runners commands: forwarded to ph-cli only with FEATURE_UNIFORM_RUNNERS_ENABLED. */
export const uniformRunnerCommandNames: ReadonlySet<string> = new Set([
  "run",
  "host",
]);

/** Set by ph-cmd on the ph-cli it spawns in the project root: where `ph` was run. */
export const CALLER_CWD_ENV = "PH_CALLER_CWD";
