import type { RunnerArgsSchema } from "@powerhousedao/host-core";

/**
 * A runner's `argsSchema` and its per-invocation values, from the SAME cmd-ts
 * definitions the classic commands parse (`@powerhousedao/shared/clis/args`),
 * so a name or a type cannot drift from them.
 */

/** The names a cmd-ts argument registers with the parser. */
interface ArgNames {
  forceFlagLongNames: Set<string>;
  forceFlagShortNames: Set<string>;
  forceOptionLongNames: Set<string>;
  forceOptionShortNames: Set<string>;
}

/** The slice of a cmd-ts argument definition read here. */
interface NamedArg {
  register?: (names: ArgNames) => void;
}

function namesOf(arg: NamedArg): { options: string[]; flags: string[] } {
  const names: ArgNames = {
    forceFlagLongNames: new Set(),
    forceFlagShortNames: new Set(),
    forceOptionLongNames: new Set(),
    forceOptionShortNames: new Set(),
  };
  arg.register?.(names);
  return {
    options: [
      ...[...names.forceOptionLongNames].map((name) => `--${name}`),
      ...[...names.forceOptionShortNames].map((name) => `-${name}`),
    ],
    flags: [
      ...[...names.forceFlagLongNames].map((name) => `--${name}`),
      ...[...names.forceFlagShortNames].map((name) => `-${name}`),
    ],
  };
}

/** The schema of a set of cmd-ts arguments, as typed on the command line. */
export function runnerArgsSchemaOf(
  args: Record<string, NamedArg>,
  extra: Pick<RunnerArgsSchema, "memberOptions" | "retired"> = {},
): RunnerArgsSchema {
  const all = Object.values(args).map(namesOf);
  return {
    options: all.flatMap((names) => names.options),
    flags: all.flatMap((names) => names.flags),
    ...extra,
  };
}

/** The parsed values `argv` names itself: a definition's default is not an
 * argument, and must not override the host file. */
export function onlyPassed<T extends Record<string, unknown>>(
  values: T,
  args: Record<keyof T & string, NamedArg>,
  argv: readonly string[],
): Partial<T> {
  const passed: Partial<T> = {};
  for (const key of Object.keys(values) as (keyof T & string)[]) {
    const { options, flags } = namesOf(args[key]);
    const names = [...options, ...flags];
    const named = argv.some((token) =>
      names.some((name) => token === name || token.startsWith(`${name}=`)),
    );
    if (named) passed[key] = values[key];
  }
  return passed;
}
