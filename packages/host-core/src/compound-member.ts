/**
 * How a compound hands an own-process member its host. The member's
 * `host.js` alone is not the member: the compound's wrapper (reactor, config
 * and runner overrides) and its resolved tokens are. So the compound
 * resolves the member as it would in its own process and the child's
 * `ph run <folder>` runs that host instead of reading the file.
 */

import { formatPath } from "./resolve/walk.js";
import { RunnerError } from "./runner-resolver.js";

/** Carries a {@link CompoundMemberHost} as JSON to the child's `ph run`. */
export const COMPOUND_MEMBER_ENV = "PH_COMPOUND_MEMBER";

/** The most an environment variable holds on Windows, in characters; counted
 * here with its name and `=`, and kept on every platform, so a stack that
 * starts on one starts on all. */
export const ENV_VALUE_LIMIT = 32_767;

export interface CompoundMemberHost {
  /** The compound host's name. */
  compound: string;
  /** The member's key in the compound's `children`. */
  member: string;
  /** The member's host folder: the child's `ph run <folder>`. */
  folder: string;
  /** The member's host, its wrapper applied and its tokens resolved. */
  host: Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A value JSON would not give back as it is, and where. */
export interface JsonChange {
  path: (string | number)[];
  /** What it is, and what JSON makes of it. */
  what: string;
}

/**
 * The first value in `value` that a JSON round trip drops or changes: a
 * function, symbol or bigint, `undefined` or an empty slot in an array, a
 * number that is not finite, an instance of a class (a Date, a Map, …) or
 * any object with `toJSON`, a symbol key, a cycle. An object property that
 * is `undefined` is fine: JSON drops it, and an absent key reads the same.
 */
export function jsonChange(value: unknown): JsonChange | undefined {
  const ancestors = new Set<object>();
  const walk = (
    item: unknown,
    path: (string | number)[],
  ): JsonChange | undefined => {
    switch (typeof item) {
      case "string":
      case "boolean":
        return undefined;
      case "number":
        return Number.isFinite(item)
          ? undefined
          : { path, what: `the number ${item}, which JSON writes as null` };
      case "undefined":
        return { path, what: "undefined, which JSON writes as null here" };
      case "function":
        return { path, what: "a function, which JSON drops" };
      case "symbol":
        return { path, what: "a symbol, which JSON drops" };
      case "bigint":
        return { path, what: "a bigint, which JSON cannot write" };
    }
    if (item === null) return undefined;
    const object = item as object;
    if (ancestors.has(object)) {
      return { path, what: "a cycle, which JSON cannot write" };
    }
    const prototype: unknown = Object.getPrototypeOf(object);
    if (Array.isArray(object) && prototype === Array.prototype) {
      ancestors.add(object);
      try {
        for (let i = 0; i < object.length; i++) {
          if (!(i in object)) {
            return {
              path: [...path, i],
              what: "an empty slot, which JSON writes as null",
            };
          }
          const found = walk(object[i], [...path, i]);
          if (found) return found;
        }
        return undefined;
      } finally {
        ancestors.delete(object);
      }
    }
    if (object instanceof Date) {
      return { path, what: "a Date, which JSON writes as a string" };
    }
    if (prototype !== Object.prototype && prototype !== null) {
      const name = (object as { constructor?: { name?: unknown } }).constructor
        ?.name;
      return {
        path,
        what: `${typeof name === "string" && name ? `a ${name}` : "an instance of a class"}, which JSON writes as a plain object`,
      };
    }
    if (typeof (object as { toJSON?: unknown }).toJSON === "function") {
      return { path, what: "an object with toJSON, which JSON replaces" };
    }
    if (Object.getOwnPropertySymbols(object).length > 0) {
      return { path, what: "a symbol-keyed property, which JSON drops" };
    }
    ancestors.add(object);
    try {
      for (const [key, entry] of Object.entries(object)) {
        if (entry === undefined) continue;
        const found = walk(entry, [...path, key]);
        if (found) return found;
      }
      return undefined;
    } finally {
      ancestors.delete(object);
    }
  };
  return walk(value, []);
}

/**
 * The member's host as the JSON its child reads from COMPOUND_MEMBER_ENV.
 * Refuses one JSON would change, or too long for an environment variable,
 * naming the member, the value and the way out: the member runs in the
 * compound's process, where nothing is copied.
 */
export function encodeCompoundMember(member: CompoundMemberHost): string {
  const where = `hosts/${member.compound}: member "${member.member}" cannot run in its own process`;
  const hint = `Run it in the compound's process: children.${member.member}.process: "shared".`;
  const change = jsonChange(member.host);
  if (change) {
    throw new RunnerError(
      `${where}: its host holds ${change.what}, at ${formatPath(change.path)}; the child gets its host as JSON.`,
      hint,
    );
  }
  const json = JSON.stringify(member);
  const size = COMPOUND_MEMBER_ENV.length + 1 + json.length;
  if (size > ENV_VALUE_LIMIT) {
    throw new RunnerError(
      `${where}: its host is ${json.length} characters as JSON, and the child gets it in an environment variable, which holds at most ${ENV_VALUE_LIMIT} on Windows.`,
      hint,
    );
  }
  return json;
}

/**
 * The member host a compound handed this process for `folder`, taken out of
 * `env` so nothing this process starts inherits it. Undefined when there is
 * none; throws when it is malformed or names another folder.
 */
export function takeCompoundMember(
  env: Record<string, string | undefined>,
  folder: string,
): CompoundMemberHost | undefined {
  const raw = env[COMPOUND_MEMBER_ENV];
  if (raw === undefined) return undefined;
  delete env[COMPOUND_MEMBER_ENV];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = undefined;
  }
  if (
    !isRecord(parsed) ||
    typeof parsed.compound !== "string" ||
    typeof parsed.member !== "string" ||
    typeof parsed.folder !== "string" ||
    !isRecord(parsed.host)
  ) {
    throw new Error(
      `${COMPOUND_MEMBER_ENV} does not hold a compound member's host.`,
    );
  }
  if (parsed.folder !== folder) {
    throw new Error(
      `${COMPOUND_MEMBER_ENV} holds member "${parsed.member}" (hosts/${parsed.folder}) of compound "${parsed.compound}", not hosts/${folder}.`,
    );
  }
  return parsed as unknown as CompoundMemberHost;
}
