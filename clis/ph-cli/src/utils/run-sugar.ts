import { probeHostsFolder, splitRunArgv } from "@powerhousedao/host-core";

export interface RunSugarResult {
  args: string[];
  /** Set when hosts/ exists but is empty: no host is defined, so nothing is rewritten. */
  warning?: string;
}

/**
 * `ph <host-name> [verb]` sugar: when the first arg is not a registered
 * command and names a host in the project's hosts/ folder, splice in `run`
 * (mirrors the connect→`connect studio` default-subcommand rewrite).
 * Built-in commands win collisions by construction — the known-command check
 * runs first.
 */
/** Classic commands that route through `ph run` in a hosts project, flags
 * included: the host's runner takes them as its arguments. */
const CLASSIC_ALIASES = new Set(["vetra"]);

export function applyRunSugar(
  args: string[],
  knownCommands: ReadonlySet<string>,
  projectRoot: string,
): RunSugarResult {
  const first = args[0];
  if (!first || first.startsWith("-")) {
    return { args };
  }
  if (knownCommands.has(first)) {
    if (CLASSIC_ALIASES.has(first)) {
      const probe = probeHostsFolder(projectRoot);
      if (probe.kind === "present" && probe.hosts.includes(first)) {
        return { args: ["run", ...args] };
      }
    }
    return { args };
  }
  const probe = probeHostsFolder(projectRoot);
  if (probe.kind === "empty") {
    return {
      args,
      warning:
        `hosts/ exists at ${probe.dir} but contains no <name>/host.js — ` +
        "no host is defined. Run `ph migrate` to add the host files.",
    };
  }
  if (probe.kind === "present" && probe.hosts.includes(first)) {
    return { args: ["run", ...args] };
  }
  return { args };
}

/**
 * `ph run <host> [verb] <runner arguments>`: moves the runner's arguments
 * behind a `--`, so the `run` command takes them as they are instead of
 * refusing the ones it does not know. The verb is spelled out: after the `--`
 * nothing is read as one. Any other invocation is returned as it is.
 */
export function forwardRunnerArgv(args: string[]): string[] {
  if (args[0] !== "run") return args;
  const { host, verb, own, argv } = splitRunArgv(args.slice(1));
  if (host === undefined || argv.length === 0) return args;
  return ["run", host, verb ?? "run", ...own, "--", ...argv];
}
