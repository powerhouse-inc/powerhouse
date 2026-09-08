// Hardcoded so ph-cmd's dispatch doesn't have to evaluate phCliHelpCommands.
// The compile-time guard in args/help.ts catches drift.
export const phCliCommandNames = [
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
  "migrate",
  "model",
  "subgraph",
  "scalar",
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

export const phCliCommandsWithSubcommands = [
  "generate",
  "connect",
  "model",
  "scalar",
  "subgraph",
] as const;

export const phCliDefinitionReportCommands = [
  "model",
  "scalar",
  "subgraph",
] as const;

export function isPhCliJsonReportInvocation(args: readonly string[]): boolean {
  return (
    phCliDefinitionReportCommands.includes(
      args[0] as (typeof phCliDefinitionReportCommands)[number],
    ) &&
    args.some(
      (argument) => argument === "--json" || argument.startsWith("--json="),
    )
  );
}
