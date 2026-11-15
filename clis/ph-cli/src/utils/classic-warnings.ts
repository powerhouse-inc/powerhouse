import {
  probeHostsFolder,
  type RunnerArgsSchema,
} from "@powerhousedao/host-core";
import {
  deprecationWarned,
  DEPRECATIONS_REMOVED_IN,
  markDeprecationWarned,
  presentConfigKeys,
  supersededConfigKeys,
  warnDeprecations,
  type Deprecation,
} from "@powerhousedao/shared/clis/deprecations";
import fs from "node:fs";
import path from "node:path";

/**
 * The 6.3 warnings of a classic invocation: `ph vetra`, `ph connect`,
 * `ph switchboard` and the `ph reactor` alias, run the classic way. `ph run`
 * is not one, nor is a host name rewritten to it, so a project that runs its
 * hosts gets none of these.
 */

/** The commands with a classic handling, as typed. */
export const CLASSIC_COMMANDS: ReadonlySet<string> = new Set([
  "vetra",
  "connect",
  "switchboard",
  "reactor",
]);

/** `ph connect <subcommand>` and the verb of the connect host it became. */
const CONNECT_VERBS: Readonly<Record<string, string>> = {
  studio: "dev",
  build: "build",
  preview: "serve",
};

/** Classic `ph switchboard` flags that became verbs of the host. */
const SWITCHBOARD_VERB_FLAGS: Readonly<Record<string, string>> = {
  "--migrate": "migrate",
  "--migrate-status": "migrate-status",
  "--reset": "reset",
  "--dev": "dev",
};

/** Read by the CLI itself, before any command. */
const CLI_FLAGS = new Set(["--debug"]);

/** The runner argument schemas the classic flags are checked against. */
export interface ClassicArgSchemas {
  switchboard: RunnerArgsSchema;
  connect: RunnerArgsSchema;
}

interface ClassicInvocation {
  /** As typed: `ph connect build`, `ph reactor`. */
  typed: string;
  /** The host that replaces the command. */
  host: "vetra" | "connect" | "switchboard";
  /** `ph run <host> [verb]`. */
  replacement: string;
  alias: boolean;
  /** The flags passed, by name, without their values. */
  flags: string[];
}

function classicInvocation(
  args: readonly string[],
): ClassicInvocation | undefined {
  const [command, ...rest] = args;
  if (command === undefined || !CLASSIC_COMMANDS.has(command)) return undefined;
  if (rest.some((arg) => arg === "--help" || arg === "-h")) return undefined;
  const flags = [
    ...new Set(
      rest
        .filter((arg) => arg.startsWith("-") && arg !== "--")
        .map((arg) => arg.split("=")[0]),
    ),
  ].filter((name) => !CLI_FLAGS.has(name));
  if (command === "connect") {
    // `ph connect config` reads and writes the config: a tool, not a host.
    if (rest[0] === "config") return undefined;
    const subcommand =
      rest.length > 0 && Object.hasOwn(CONNECT_VERBS, rest[0])
        ? rest[0]
        : undefined;
    return {
      typed: subcommand ? `ph connect ${subcommand}` : "ph connect",
      host: "connect",
      replacement: `ph run connect ${CONNECT_VERBS[subcommand ?? "studio"]}`,
      alias: false,
      flags,
    };
  }
  if (command === "vetra") {
    return {
      typed: "ph vetra",
      host: "vetra",
      replacement: "ph run vetra",
      alias: false,
      flags,
    };
  }
  return {
    typed: `ph ${command}`,
    host: "switchboard",
    replacement: "ph run switchboard",
    alias: command === "reactor",
    flags,
  };
}

/** How `ph run <host>` takes a classic flag, when it does not take it as is. */
function flagDeprecations(
  invocation: ClassicInvocation,
  schemas: ClassicArgSchemas,
): Deprecation[] {
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
      ? members.some(
          (schema) =>
            schema.memberOptions?.[name] !== undefined ||
            (!scoped.has(name) &&
              [...schema.options, ...schema.flags].includes(name)),
        )
      : [...members[0].options, ...members[0].flags].includes(name);
  const deprecations: Deprecation[] = [];
  const unsupported: string[] = [];
  for (const name of invocation.flags) {
    const verb =
      host === "switchboard" ? SWITCHBOARD_VERB_FLAGS[name] : undefined;
    const retired = members.find((schema) => schema.retired?.[name])?.retired?.[
      name
    ];
    if (verb !== undefined) {
      deprecations.push({
        id: `classic:flag:${name}`,
        text: `\`${typed} ${name}\` is deprecated and stops working in ${DEPRECATIONS_REMOVED_IN}. Use \`ph run switchboard ${verb}\` instead.`,
      });
    } else if (accepts(name)) {
      continue;
    } else if (retired !== undefined) {
      deprecations.push({
        id: `classic:flag:${name}`,
        text: `\`${typed} ${name}\` is deprecated and stops working in ${DEPRECATIONS_REMOVED_IN}: ${retired}`,
      });
    } else {
      unsupported.push(name);
    }
  }
  if (unsupported.length > 0) {
    const one = unsupported.length === 1;
    const subject = one
      ? `\`${typed} ${unsupported[0]}\` has no \`${replacement}\` argument and stops`
      : `The \`${typed}\` flags ${unsupported.join(", ")} have no \`${replacement}\` argument and stop`;
    deprecations.push({
      id: "classic:flags",
      text:
        `${subject} working in ${DEPRECATIONS_REMOVED_IN}. ` +
        `Set what ${one ? "it configures" : "they configure"} in the host files under hosts/ instead.`,
    });
  }
  return deprecations;
}

function readProjectConfig(projectRoot: string): unknown {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(projectRoot, "powerhouse.config.json"), "utf8"),
    );
  } catch {
    return undefined;
  }
}

/**
 * What a classic invocation should be told, in order: the project without
 * hosts or the command with its replacement, the alias, its flags, and the
 * config keys only the classic commands read. `args` is the command line
 * after the host sugar. Empty for anything else, and for help.
 * `schemas` is only needed when the invocation passes flags.
 */
export function classicDeprecations(
  args: readonly string[],
  projectRoot: string,
  schemas?: ClassicArgSchemas,
): Deprecation[] {
  const invocation = classicInvocation(args);
  if (!invocation) return [];
  const { typed, host, replacement, alias } = invocation;
  const deprecations: Deprecation[] = [];
  const probe = probeHostsFolder(projectRoot);
  if (probe.kind !== "present") {
    deprecations.push({
      id: "classic:no-hosts",
      text:
        `This project has no hosts/<name>/host.js, so \`${typed}\` runs the classic way, which stops working in ${DEPRECATIONS_REMOVED_IN}. ` +
        `Run \`ph migrate\` to add the host files, then use \`${replacement}\`.`,
    });
  } else if (!probe.hosts.includes(host)) {
    deprecations.push({
      id: "classic:command",
      text:
        `\`${typed}\` runs the classic way, which stops working in ${DEPRECATIONS_REMOVED_IN}. ` +
        `This project has no hosts/${host}/host.js: add that host file, then use \`${replacement}\`.`,
    });
  } else if (!alias) {
    deprecations.push({
      id: "classic:command",
      text:
        `\`${typed}\` runs the classic way and does not read hosts/${host}/host.js. ` +
        `The classic way stops working in ${DEPRECATIONS_REMOVED_IN}: use \`${replacement}\` instead.`,
    });
  }
  if (alias) {
    deprecations.push({
      id: "classic:alias",
      text: `\`${typed}\` is a deprecated alias and is removed in ${DEPRECATIONS_REMOVED_IN}. Use \`${replacement}\` instead.`,
    });
  }
  if (schemas && invocation.flags.length > 0) {
    deprecations.push(...flagDeprecations(invocation, schemas));
  }
  const superseded = presentConfigKeys(
    readProjectConfig(projectRoot),
    Object.keys(supersededConfigKeys),
  );
  if (superseded.length > 0) {
    const homes = superseded.map(
      (key) => `${key} to ${supersededConfigKeys[key]}`,
    );
    deprecations.push({
      id: "classic:config",
      text:
        `powerhouse.config.json sets ${superseded.join(", ")}: only the classic commands read ${superseded.length === 1 ? "it" : "them"}, and ${DEPRECATIONS_REMOVED_IN} refuses ${superseded.length === 1 ? "it" : "them"}. ` +
        `Move ${homes.join("; ")}.`,
    });
  }
  return deprecations;
}

/** Marks an invocation whose classic warnings are out: the classic commands
 * it spawns inherit the mark and stay silent. */
const CLASSIC_WARNED = "classic";

async function loadArgSchemas(): Promise<ClassicArgSchemas | undefined> {
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
 * Run by the CLI before a classic command: prints its warnings to stderr,
 * once per invocation. Never throws and never changes the exit code: a
 * warning that cannot be worked out is skipped.
 */
export async function warnClassicInvocation(
  args: readonly string[],
  projectRoot: string,
  env: Record<string, string | undefined> = process.env,
  warn?: (text: string) => void,
): Promise<void> {
  try {
    if (deprecationWarned(CLASSIC_WARNED, env)) return;
    const invocation = classicInvocation(args);
    if (!invocation) return;
    const schemas =
      invocation.flags.length > 0 ? await loadArgSchemas() : undefined;
    warnDeprecations(
      classicDeprecations(args, projectRoot, schemas),
      env,
      warn,
    );
    markDeprecationWarned(CLASSIC_WARNED, env);
  } catch {
    // A warning must not stop the command.
  }
}
