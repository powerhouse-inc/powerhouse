import { probeHostsFolder } from "../services/run/host-loader.js";

export interface RunSugarResult {
  args: string[];
  /** Set when hosts/ exists but is empty — the guard state: warn loudly, stay legacy. */
  warning?: string;
}

/**
 * `ph <host-name> [verb]` sugar: when the first arg is not a registered
 * command and names a host in the project's hosts/ folder, splice in `run`
 * (mirrors the connect→`connect studio` default-subcommand rewrite).
 * Built-in commands win collisions by construction — the known-command check
 * runs first. Callers only invoke this when the uniform-runners flag is on.
 */
export function applyRunSugar(
  args: string[],
  knownCommands: ReadonlySet<string>,
  projectRoot: string,
): RunSugarResult {
  const first = args[0];
  if (!first || first.startsWith("-") || knownCommands.has(first)) {
    return { args };
  }
  const probe = probeHostsFolder(projectRoot);
  if (probe.kind === "empty") {
    return {
      args,
      warning:
        `hosts/ exists at ${probe.dir} but contains no <name>/host.js — ` +
        "uniform-runners stays inactive (legacy command handling).",
    };
  }
  if (probe.kind === "present" && probe.hosts.includes(first)) {
    return { args: ["run", ...args] };
  }
  return { args };
}
