import { probeHostsFolder, splitRunArgv } from "@powerhousedao/host-core";
import { DEV_HOST } from "@powerhousedao/shared/clis/constants";
import { devHostOf, type DevHost } from "./dev-host.js";

export interface RunSugarResult {
  args: string[];
  /** Set when hosts/ exists but is empty: no host is defined, so nothing is rewritten. */
  warning?: string;
}

/** A host a scaffold has. */
export type SugarHost = DevHost | "connect" | "switchboard";

/**
 * The commands that run a host every scaffold has, and the host: `ph dev`,
 * `ph connect` and `ph switchboard` are `ph run <host>` and have no code of
 * their own. `ph dev` runs the dev mode: hosts/dev, or hosts/vetra in a
 * project that has only that one ({@link sugarHostOf}). They are rewritten
 * whatever the project holds, so a project without the host gets the error
 * of `ph run` (sugar-checks.ts says it first, as typed).
 */
export const HOST_COMMANDS: Readonly<Record<string, SugarHost>> = {
  dev: DEV_HOST,
  connect: "connect",
  switchboard: "switchboard",
};

/** The host the command runs in this project. */
export function sugarHostOf(command: string, projectRoot: string): SugarHost {
  const host = HOST_COMMANDS[command];
  return host === DEV_HOST ? devHostOf(projectRoot) : host;
}

/** `ph connect <subcommand>` and the verb of the connect host it stands for. */
export const CONNECT_VERBS: Readonly<Record<string, string>> = {
  studio: "dev",
  build: "build",
  preview: "serve",
};

const isHelp = (arg: string | undefined) => arg === "--help" || arg === "-h";

/**
 * `ph connect [studio|build|preview]` → `ph run connect <dev|build|serve>`.
 * Without a subcommand it is `studio`, as it always was. `ph connect config`
 * and `ph connect --help` stay the `connect` command: a tool, not a host.
 * Any other word is a verb of the host (`ph connect serve`).
 */
function connectSugar(args: string[]): string[] {
  const rest = args.slice(1);
  if (rest[0] === "config" || isHelp(rest[0])) return args;
  if (rest.length === 0 || rest[0].startsWith("-")) {
    return ["run", "connect", CONNECT_VERBS.studio, ...rest];
  }
  if (Object.hasOwn(CONNECT_VERBS, rest[0])) {
    return ["run", "connect", CONNECT_VERBS[rest[0]], ...rest.slice(1)];
  }
  return ["run", ...args];
}

/**
 * `ph <host-name> [verb]` sugar: when the first arg is not a registered
 * command and names a host in the project's hosts/ folder, splice in `run`.
 * Built-in commands win collisions by construction — the known-command check
 * runs first. {@link HOST_COMMANDS} are sugar in every project. `ph vetra` is
 * a command, the gateway to Vetra Studio (services/vetra-gateway.ts), and
 * never a host.
 */
export function applyRunSugar(
  args: string[],
  knownCommands: ReadonlySet<string>,
  projectRoot: string,
): RunSugarResult {
  const first = args[0];
  if (!first || first.startsWith("-")) {
    return { args };
  }
  if (first === "connect") {
    return { args: connectSugar(args) };
  }
  if (Object.hasOwn(HOST_COMMANDS, first)) {
    return {
      args: ["run", sugarHostOf(first, projectRoot), ...args.slice(1)],
    };
  }
  if (knownCommands.has(first)) {
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
