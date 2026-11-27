// Hardcoded so ph-cmd's dispatch doesn't have to evaluate phCliHelpCommands.
// The compile-time guard in args/help.ts catches drift.
export const phCliCommandNames = [
  "run",
  "host",
  "generate",
  "dev",
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
  "keyframes",
  "mcp",
  "migrate",
  "model",
  "switchboard",
  "login",
  "logout",
  "whoami",
  "identity",
  "credentials",
  "token",
  "install",
  "add",
  "i",
  "uninstall",
  "remove",
] as const;

/** Set by ph-cmd on the ph-cli it spawns in the project root: where `ph` was run. */
export const CALLER_CWD_ENV = "PH_CALLER_CWD";
