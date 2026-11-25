import { RunnerError } from "./runner-resolver.js";

/**
 * The arguments of one invocation: what follows `ph run <host> [verb]` and
 * `ph run` does not read itself. A runner declares the ones it accepts as its
 * `argsSchema` export; anything else fails before the runner starts.
 */

/** The arguments a runner accepts, as typed (`--port`, `-w`). Structural: a
 * runner builds it from its own argument definitions, and this package needs
 * no argument parser. */
export interface RunnerArgsSchema {
  /** Take a value: `--port 4001` or `--port=4001`. */
  options: readonly string[];
  /** Switches: `--strictPort`. */
  flags: readonly string[];
  /** The name a compound's member takes an option under, e.g.
   * `{ "--switchboard-port": "--port" }`. In a compound the plain name is
   * refused: it would reach every member that has it. */
  memberOptions?: Readonly<Record<string, string>>;
  /** Retired switches and what to do instead: accepted, one warning, no
   * effect. */
  retired?: Readonly<Record<string, string>>;
  /** Every argument goes to the runner as typed, unchecked: a runner whose
   * host parses its own (the Cli runner hands them to the Cli). */
  passthrough?: boolean;
}

const isStrings = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isStringRecord = (value: unknown): value is Record<string, string> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((item) => typeof item === "string");

export function isRunnerArgsSchema(value: unknown): value is RunnerArgsSchema {
  if (typeof value !== "object" || value === null) return false;
  const schema = value as Record<string, unknown>;
  return (
    isStrings(schema.options) &&
    isStrings(schema.flags) &&
    (schema.memberOptions === undefined ||
      isStringRecord(schema.memberOptions)) &&
    (schema.retired === undefined || isStringRecord(schema.retired)) &&
    (schema.passthrough === undefined ||
      typeof schema.passthrough === "boolean")
  );
}

export interface SplitRunArgv {
  host?: string;
  verb?: string;
  /** `ph run`'s own arguments (`--debug`, `--stop`, `--explain <topic>`,
   * help). */
  own: string[];
  /** Everything else, in order: the runner's. */
  argv: string[];
}

const OWN_FLAGS = new Set(["--debug", "--stop", "--help", "-h"]);

/**
 * Splits what follows `ph run`. The host and the verb come before the
 * runner's arguments: `ph run` does not know which of those take a value, so
 * a bare word after the first of them belongs to the runner. A literal `--`
 * hands over everything after it.
 */
export function splitRunArgv(args: readonly string[]): SplitRunArgv {
  const result: SplitRunArgv = { own: [], argv: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") {
      result.argv.push(...args.slice(i + 1));
      break;
    }
    if (OWN_FLAGS.has(arg) || arg.startsWith("--explain=")) {
      result.own.push(arg);
    } else if (arg === "--explain") {
      result.own.push(...args.slice(i, i + 2));
      i++;
    } else if (arg.startsWith("-") || result.argv.length > 0) {
      result.argv.push(arg);
    } else if (result.host === undefined) {
      result.host = arg;
    } else if (result.verb === undefined) {
      result.verb = arg;
    } else {
      result.argv.push(arg);
    }
  }
  return result;
}

interface ArgvEntry {
  /** The argument as typed, without its value: `--port`. */
  name: string;
  /** Its tokens: `["--port", "4001"]` or `["--port=4001"]`. */
  tokens: string[];
}

function entriesOf(
  argv: readonly string[],
  takesValue: (name: string) => boolean,
  where: string,
): ArgvEntry[] {
  const entries: ArgvEntry[] = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--") continue;
    const equals = token.startsWith("-") ? token.indexOf("=") : -1;
    const name = equals === -1 ? token : token.slice(0, equals);
    if (equals === -1 && takesValue(name)) {
      if (i + 1 >= argv.length) {
        throw new RunnerError(`${where}: ${name} needs a value.`);
      }
      entries.push({ name, tokens: [token, argv[i + 1]] });
      i++;
    } else {
      entries.push({ name, tokens: [token] });
    }
  }
  return entries;
}

function warnRetired(name: string, instead: string): void {
  console.warn(`${name} is retired and has no effect: ${instead}`);
}

const acceptedBy = (schema: RunnerArgsSchema): string[] => [
  ...schema.options,
  ...schema.flags,
];

export interface RunnerArgvTarget {
  /** The host's folder name under hosts/. */
  host: string;
  /** The runner's specifier. */
  runner: string;
  /** The runner module's `argsSchema` export. */
  schema: unknown;
}

/**
 * The arguments a standalone runner receives as `ctx.argv`: `argv` checked
 * against the runner's schema, retired switches warned about and dropped.
 * Nothing is dropped silently: an argument the runner does not accept, or any
 * argument for a runner without a schema, fails. A `passthrough` runner gets
 * them all, in order.
 */
export function checkRunnerArgv(
  argv: readonly string[],
  target: RunnerArgvTarget,
): string[] {
  if (argv.length === 0) return [];
  const where = `hosts/${target.host}`;
  const schema = target.schema;
  if (!isRunnerArgsSchema(schema)) {
    throw new RunnerError(
      `${where}: its runner ${target.runner} accepts no arguments, but got: ${argv.join(" ")}`,
      "Set these in the host file instead.",
    );
  }
  if (schema.passthrough) return [...argv];
  const options = new Set(schema.options);
  const accepted = new Set(acceptedBy(schema));
  const kept: string[] = [];
  const unknown: string[] = [];
  for (const entry of entriesOf(argv, (name) => options.has(name), where)) {
    const instead = schema.retired?.[entry.name];
    if (accepted.has(entry.name)) {
      kept.push(...entry.tokens);
    } else if (instead !== undefined) {
      warnRetired(entry.name, instead);
    } else {
      unknown.push(entry.name);
    }
  }
  if (unknown.length > 0) {
    throw new RunnerError(
      `${where}: its runner ${target.runner} does not accept ${unknown.join(", ")}.`,
      `It accepts: ${[...accepted].join(", ") || "no arguments"}.`,
    );
  }
  return kept;
}

export interface CompoundArgvMember {
  /** The member's key in the compound's `children`. */
  key: string;
  /** The member runner's specifier. */
  runner: string;
  /** The member runner module's `argsSchema` export. */
  schema: unknown;
}

/**
 * A compound's arguments, per member key: each member gets the ones its
 * runner accepts. A member option arrives under its member name
 * (`--switchboard-port 4001` reaches that member as `--port 4001`). An
 * argument no member accepts fails, as does one that would set the same
 * option on several members.
 *
 * With a `foreground` member (the one that owns the terminal) the members
 * take only their member-named options, at the front; the first other
 * argument, or a literal `--`, starts the foreground member's own, checked
 * against its runner's schema (a passthrough runner takes them as typed).
 */
export function splitCompoundArgv(
  argv: readonly string[],
  host: string,
  members: readonly CompoundArgvMember[],
  foreground?: string,
): Map<string, string[]> {
  const perMember = new Map<string, string[]>(members.map((m) => [m.key, []]));
  if (argv.length === 0) return perMember;
  const where = `hosts/${host}`;
  const schemas = members.flatMap((m) =>
    isRunnerArgsSchema(m.schema) ? [{ key: m.key, schema: m.schema }] : [],
  );
  const owner = members.find((m) => m.key === foreground);
  if (owner) {
    let i = 0;
    for (; i < argv.length; i++) {
      const token = argv[i];
      if (token === "--") {
        i++;
        break;
      }
      const equals = token.startsWith("-") ? token.indexOf("=") : -1;
      const name = equals === -1 ? token : token.slice(0, equals);
      const named = schemas.filter(
        ({ key, schema }) =>
          key !== owner.key && schema.memberOptions?.[name] !== undefined,
      );
      if (named.length === 0) break;
      if (named.length > 1) {
        throw new RunnerError(
          `${where}: ${name} matches the members ${named.map((m) => m.key).join(", ")}.`,
          "Set the option in each member's host file instead.",
        );
      }
      const { key, schema } = named[0];
      const option = schema.memberOptions?.[name] ?? name;
      if (equals !== -1) {
        // `--switchboard-port=4001` keeps its `=4001`
        perMember.get(key)?.push(option + token.slice(name.length));
      } else if (i + 1 >= argv.length) {
        throw new RunnerError(`${where}: ${name} needs a value.`);
      } else {
        perMember.get(key)?.push(option, argv[i + 1]);
        i++;
      }
    }
    perMember.set(
      owner.key,
      checkRunnerArgv(argv.slice(i), {
        host,
        runner: owner.runner,
        schema: owner.schema,
      }),
    );
    return perMember;
  }
  // plain option name -> the member names it goes by
  const memberNames = new Map<string, string[]>();
  for (const { schema } of schemas) {
    for (const [alias, option] of Object.entries(schema.memberOptions ?? {})) {
      const aliases = memberNames.get(option) ?? [];
      if (!aliases.includes(alias)) aliases.push(alias);
      memberNames.set(option, aliases);
    }
  }
  const takesValue = (name: string) =>
    schemas.some(
      ({ schema }) =>
        schema.options.includes(name) ||
        schema.memberOptions?.[name] !== undefined,
    );
  const warned = new Set<string>();
  const unknown: string[] = [];
  for (const entry of entriesOf(argv, takesValue, where)) {
    const { name, tokens } = entry;
    const named = schemas.filter(
      ({ schema }) => schema.memberOptions?.[name] !== undefined,
    );
    if (named.length > 1) {
      throw new RunnerError(
        `${where}: ${name} matches the members ${named.map((m) => m.key).join(", ")}.`,
        "Set the option in each member's host file instead.",
      );
    }
    if (named.length === 1) {
      const { key, schema } = named[0];
      const option = schema.memberOptions?.[name] ?? name;
      // `--switchboard-port=4001` keeps its `=4001`
      const first = option + tokens[0].slice(name.length);
      perMember.get(key)?.push(first, ...tokens.slice(1));
      continue;
    }
    const aliases = memberNames.get(name);
    if (aliases) {
      throw new RunnerError(
        `${where}: ${name} does not say which member it is for.`,
        `Use ${aliases.join(" or ")}.`,
      );
    }
    const takers = schemas.filter(({ schema }) =>
      acceptedBy(schema).includes(name),
    );
    if (takers.length > 0) {
      for (const { key } of takers) perMember.get(key)?.push(...tokens);
      continue;
    }
    const retired = schemas.find(
      ({ schema }) => schema.retired?.[name] !== undefined,
    );
    if (retired) {
      if (!warned.has(name)) {
        warned.add(name);
        warnRetired(name, retired.schema.retired?.[name] ?? "");
      }
      continue;
    }
    unknown.push(name);
  }
  if (unknown.length > 0) {
    const accepted = members.map((m) => {
      if (!isRunnerArgsSchema(m.schema)) {
        return `  - ${m.key} (${m.runner}): no arguments`;
      }
      const schema = m.schema;
      const scoped = new Set(Object.values(schema.memberOptions ?? {}));
      const names = [
        ...Object.keys(schema.memberOptions ?? {}),
        ...acceptedBy(schema).filter((name) => !scoped.has(name)),
      ];
      return `  - ${m.key} (${m.runner}): ${names.join(", ") || "no arguments"}`;
    });
    throw new RunnerError(
      `${where}: no member accepts ${unknown.join(", ")}. The members accept:\n${accepted.join("\n")}`,
    );
  }
  return perMember;
}
