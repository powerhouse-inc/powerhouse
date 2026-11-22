import {
  loadHost,
  probeHostsFolder,
  withoutHostsMessage,
  type RunnerArgsSchema,
} from "@powerhousedao/host-core";
import {
  DEPRECATIONS_REMOVED_IN,
  MIGRATION_GUIDE_URL,
} from "@powerhousedao/shared/clis/deprecations";
import { CONNECT_VERBS, HOST_COMMANDS, type SugarHost } from "./run-sugar.js";

/**
 * What `ph dev`, `ph connect` and `ph switchboard` are refused for, before
 * they become `ph run <host>` (run-sugar.ts): a project without the host
 * file, and the flags of the commands they once were that `ph run` has no
 * argument for. `ph run` is not checked here, nor is any other host name: a
 * runner refuses the arguments it does not know itself. Nor are the flags of
 * a host on a runner of its own: they are checked against the stock runners.
 */

/** `ph switchboard` flags that are verbs of the host. */
const SWITCHBOARD_VERB_FLAGS: Readonly<Record<string, string>> = {
  "--migrate": "migrate",
  "--migrate-status": "migrate-status",
  "--reset": "reset",
  "--dev": "dev",
};

/** Read by the CLI itself, before any command. */
const CLI_FLAGS = new Set(["--debug"]);

/** The runner argument schemas the flags are checked against. */
export interface SugarArgSchemas {
  switchboard: RunnerArgsSchema;
  connect: RunnerArgsSchema;
}

interface SugarInvocation {
  /** As typed: `ph connect build`. */
  typed: string;
  /** The host it runs. */
  host: SugarHost;
  /** What it is sugar for: `ph run <host> [verb]`. */
  replacement: string;
  /** The flags passed, by name, without their values. */
  flags: string[];
}

function sugarInvocation(args: readonly string[]): SugarInvocation | undefined {
  const [command, ...rest] = args;
  if (command === undefined || !Object.hasOwn(HOST_COMMANDS, command)) {
    return undefined;
  }
  if (rest.some((arg) => arg === "--help" || arg === "-h")) return undefined;
  const flags = [
    ...new Set(
      rest
        .filter((arg) => arg.startsWith("-") && arg !== "--")
        .map((arg) => arg.split("=")[0]),
    ),
  ].filter((name) => !CLI_FLAGS.has(name));
  // A word right after the command is the subcommand or the verb.
  const word =
    rest.length > 0 && !rest[0].startsWith("-") ? rest[0] : undefined;
  if (command === "connect") {
    // `ph connect config` reads and writes the config: a tool, not a host.
    if (word === "config") return undefined;
    const verb =
      word === undefined
        ? CONNECT_VERBS.studio
        : Object.hasOwn(CONNECT_VERBS, word)
          ? CONNECT_VERBS[word]
          : word;
    return {
      typed: word ? `ph connect ${word}` : "ph connect",
      host: "connect",
      replacement: `ph run connect ${verb}`,
      flags,
    };
  }
  // `ph dev` runs hosts/vetra.
  const host = HOST_COMMANDS[command];
  return {
    typed: word ? `ph ${command} ${word}` : `ph ${command}`,
    host,
    replacement: word ? `ph run ${host} ${word}` : `ph run ${host}`,
    flags,
  };
}

/**
 * `ph reactor` was an alias of `ph switchboard`. It is gone, unless the
 * project names a host of its own that.
 */
function removedAliasError(
  args: readonly string[],
  projectRoot: string,
): string | undefined {
  if (args[0] !== "reactor") return undefined;
  const probe = probeHostsFolder(projectRoot);
  if (probe.kind === "present" && probe.hosts.includes("reactor")) {
    return undefined;
  }
  return (
    `\`ph reactor\` was removed in ${DEPRECATIONS_REMOVED_IN}. ` +
    "Use `ph switchboard` or `ph run switchboard` instead."
  );
}

/**
 * Why the command cannot run in this project: it has no hosts (the wording
 * of `ph run`, naming `ph migrate`), or it has hosts and not this one.
 * Undefined for anything else, for help, and for a project with the host.
 */
export function withoutHostError(
  args: readonly string[],
  projectRoot: string,
): string | undefined {
  const invocation = sugarInvocation(args);
  if (!invocation) return undefined;
  const { typed, host } = invocation;
  const probe = probeHostsFolder(projectRoot);
  if (probe.kind !== "present") {
    return withoutHostsMessage(probe, `\`${typed}\``);
  }
  if (probe.hosts.includes(host)) return undefined;
  // `ph migrate` adds the hosts to a project that has none, and only then.
  return (
    `This project has no hosts/${host}/host.js, so \`${typed}\` cannot run. ` +
    `\`ph migrate\` adds the host files to a project without hosts only: add hosts/${host}/host.js to this one. ` +
    `See ${MIGRATION_GUIDE_URL}`
  );
}

/**
 * The flags `ph run <host>` has no argument for, as one error. A flag the
 * runner takes passes, under its member name for `ph dev`
 * (`--switchboard-port`); a flag the runner retired passes too, and the
 * runner says so. Undefined when every flag passes.
 */
export function removedFlagsError(
  args: readonly string[],
  schemas: SugarArgSchemas,
): string | undefined {
  const invocation = sugarInvocation(args);
  if (!invocation) return undefined;
  const { typed, host, replacement } = invocation;
  // A compound hands each member its arguments; a member option goes by its
  // member name there (`--switchboard-port`), never by its plain one.
  const members =
    host === "vetra" ? [schemas.switchboard, schemas.connect] : [schemas[host]];
  const scoped = new Set(
    members.flatMap((schema) => Object.values(schema.memberOptions ?? {})),
  );
  const accepts = (name: string): boolean =>
    host === "vetra"
      ? // `ph run vetra` takes --restart itself (vetra-host.ts).
        name === "--restart" ||
        members.some(
          (schema) =>
            schema.memberOptions?.[name] !== undefined ||
            (!scoped.has(name) &&
              [...schema.options, ...schema.flags].includes(name)),
        )
      : [...members[0].options, ...members[0].flags].includes(name);
  const errors: string[] = [];
  const unsupported: string[] = [];
  for (const name of invocation.flags) {
    const verb =
      host === "switchboard" ? SWITCHBOARD_VERB_FLAGS[name] : undefined;
    const retired = members.some(
      (schema) => schema.retired?.[name] !== undefined,
    );
    if (verb !== undefined) {
      errors.push(
        `\`${typed} ${name}\` was removed in ${DEPRECATIONS_REMOVED_IN}. Use \`ph run switchboard ${verb}\` instead.`,
      );
    } else if (accepts(name) || retired) {
      continue;
    } else {
      unsupported.push(name);
    }
  }
  if (unsupported.length > 0) {
    const one = unsupported.length === 1;
    const subject = one
      ? `\`${typed} ${unsupported[0]}\` was removed in ${DEPRECATIONS_REMOVED_IN}: \`${replacement}\` has no such argument.`
      : `The \`${typed}\` flags ${unsupported.join(", ")} were removed in ${DEPRECATIONS_REMOVED_IN}: \`${replacement}\` has no such arguments.`;
    errors.push(
      `${subject} Set what ${one ? "it configures" : "they configure"} in the host files under hosts/ instead. ` +
        `See ${MIGRATION_GUIDE_URL}`,
    );
  }
  return errors.length > 0 ? errors.join("\n") : undefined;
}

/** The runners the scaffold's hosts name, whose schemas the flags are
 * checked against. ph-cli's are the ph-run ones, re-exported. */
const STOCK_RUNNERS: Readonly<Record<string, readonly string[]>> = {
  connect: [
    "@powerhousedao/ph-cli/runners/connect",
    "@powerhousedao/ph-run/runners/connect",
  ],
  switchboard: [
    "@powerhousedao/ph-cli/runners/switchboard",
    "@powerhousedao/ph-run/runners/switchboard",
  ],
};
const COMPOUND_RUNNER = "@powerhousedao/host-core/runners/compound";

async function runnerModuleOf(
  projectRoot: string,
  host: string,
): Promise<{ module: string; children?: unknown } | undefined> {
  try {
    const { host: definition } = await loadHost(projectRoot, host);
    return {
      module: definition.runner.module,
      children: (definition as { children?: unknown }).children,
    };
  } catch {
    // `ph run` loads it next and says what is wrong with it.
    return undefined;
  }
}

/**
 * Whether the host runs the stock runner of its command: the connect or
 * switchboard runner, or for `ph dev` the compound over members that are
 * the project's connect and switchboard hosts, each on its stock runner.
 * Anything else has arguments of its own, which its runner checks.
 */
export async function runsStockRunner(
  projectRoot: string,
  host: SugarHost,
): Promise<boolean> {
  const loaded = await runnerModuleOf(projectRoot, host);
  if (!loaded) return false;
  if (host !== "vetra") return STOCK_RUNNERS[host].includes(loaded.module);
  if (loaded.module !== COMPOUND_RUNNER) return false;
  const children = loaded.children;
  if (typeof children !== "object" || children === null) return false;
  const members = new Set<string>();
  for (const child of Object.values(children as Record<string, unknown>)) {
    const { host: member, runner } = (child ?? {}) as {
      host?: unknown;
      runner?: { module?: unknown };
    };
    if (typeof member !== "string" || !Object.hasOwn(STOCK_RUNNERS, member)) {
      return false;
    }
    // A member that names a runner module is not on its sibling's.
    if (runner?.module !== undefined) return false;
    members.add(member);
  }
  for (const member of members) {
    const sibling = await runnerModuleOf(projectRoot, member);
    if (!sibling || !STOCK_RUNNERS[member].includes(sibling.module)) {
      return false;
    }
  }
  return true;
}

async function loadArgSchemas(): Promise<SugarArgSchemas | undefined> {
  try {
    const [switchboard, connect] = await Promise.all([
      import("@powerhousedao/ph-run/runners/switchboard"),
      import("@powerhousedao/ph-run/runners/connect"),
    ]);
    return {
      switchboard: switchboard.argsSchema,
      connect: connect.argsSchema,
    };
  } catch {
    return undefined;
  }
}

/**
 * Run by the CLI on the command line as typed, before the host sugar: the
 * error the invocation ends with, if any. `args` is untouched either way.
 */
export async function sugarError(
  args: readonly string[],
  projectRoot: string,
): Promise<string | undefined> {
  const removed = removedAliasError(args, projectRoot);
  if (removed !== undefined) return removed;
  const withoutHost = withoutHostError(args, projectRoot);
  if (withoutHost !== undefined) return withoutHost;
  const invocation = sugarInvocation(args);
  if (!invocation || invocation.flags.length === 0) return undefined;
  // A runner of the project's own takes the arguments it declares.
  if (!(await runsStockRunner(projectRoot, invocation.host))) return undefined;
  // Without the schemas the runner still refuses what it does not accept.
  const schemas = await loadArgSchemas();
  return schemas ? removedFlagsError(args, schemas) : undefined;
}
