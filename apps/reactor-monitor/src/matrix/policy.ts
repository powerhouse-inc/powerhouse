// Which setters and env a matrix may apply. Browser-safe.
import { isBrowserEnvKey } from "../controller/api.js";
import { MATRIX_LIMITS } from "./schema.js";

const FORBIDDEN_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

export type ParsedPath =
  | { segments: string[]; subject: string[]; rest: string[] }
  | { error: string };

/** Dotted, rooted at the envelope: host.…, members.<f>.… or host.children.<k>.… */
export function parsePath(path: string): ParsedPath {
  const segments = path.split(".");
  if (segments.length > MATRIX_LIMITS.pathSegments) {
    return { error: `more than ${MATRIX_LIMITS.pathSegments} segments` };
  }
  if (segments.some((segment) => segment === "")) {
    return { error: "empty segment" };
  }
  const forbidden = segments.find((segment) => FORBIDDEN_SEGMENTS.has(segment));
  if (forbidden !== undefined) return { error: `segment "${forbidden}"` };
  const subject = subjectOf(segments);
  if (!subject) {
    return {
      error: "must start at host, members.<folder> or host.children.<key>",
    };
  }
  return { segments, subject, rest: segments.slice(subject.length) };
}

function subjectOf(segments: readonly string[]): string[] | undefined {
  let subject: string[];
  if (segments[0] === "host") subject = ["host"];
  else if (segments[0] === "members" && segments.length > 1) {
    subject = ["members", segments[1]];
  } else return undefined;
  const at = subject.length;
  if (segments[at] === "children" && segments.length > at + 1) {
    subject = [...subject, "children", segments[at + 1]];
  }
  return subject;
}

type Pattern = readonly string[];

/** `*` is one segment, a trailing `**` any rest (or none). */
function matches(pattern: Pattern, rest: readonly string[]): boolean {
  for (let index = 0; index < pattern.length; index++) {
    const part = pattern[index];
    if (part === "**") return true;
    if (index >= rest.length) return false;
    if (part !== "*" && part !== rest[index]) return false;
  }
  return pattern.length === rest.length;
}

const SETTABLE: Pattern[] = [
  ["reactor", "protocol", "**"],
  ["reactor", "backends", "*", "kind"],
  ["reactor", "backends", "*", "storage", "kind"],
  ["reactor", "namespace"],
  ["runner", "port"],
];

const DELETABLE: Pattern[] = [
  ...SETTABLE,
  ["reactor", "backends", "*", "storage", "dataDir"],
  ["reactor", "backends", "*", "storage", "url"],
  ["reactor", "backends", "*", "readModel"],
];

/** Paths that load code or reach the network, named so a refusal says why. */
const DENIED_FAMILIES: [Pattern, string][] = [
  [["runner", "module", "**"], "runner.module loads code"],
  [["runner", "plugins", "**"], "runner.plugins loads code"],
  [["reactor", "backends", "*", "packages", "**"], "packages loads code"],
  [["reactor", "workflows", "**"], "workflows loads code"],
  [
    ["reactor", "backends", "*", "remote", "**"],
    "remote.url reaches the network",
  ],
  [["reactor", "drives", "**"], "drives reach the network"],
  [["config", "**"], "config is runner-defined"],
];

export type PolicyVerdict = { ok: true } | { ok: false; reason: string };

export function checkSetterPath(
  path: string,
  op: "set" | "delete",
): PolicyVerdict {
  const parsed = parsePath(path);
  if ("error" in parsed) return { ok: false, reason: parsed.error };
  const { subject, rest } = parsed;
  if (rest.length === 0) {
    return { ok: false, reason: "a setter cannot replace a whole host" };
  }
  if (
    subject.at(-2) === "children" &&
    rest.length === 1 &&
    rest[0] === "host"
  ) {
    return {
      ok: false,
      reason: "children.*.host picks the code a member runs",
    };
  }
  for (const [pattern, reason] of DENIED_FAMILIES) {
    if (matches(pattern, rest)) return { ok: false, reason };
  }
  const allowed = op === "set" ? SETTABLE : DELETABLE;
  if (allowed.some((pattern) => matches(pattern, rest))) return { ok: true };
  const deletable = op === "set" && DELETABLE.some((p) => matches(p, rest));
  return {
    ok: false,
    reason: deletable
      ? `${rest.join(".")} may only be $delete'd`
      : `${rest.join(".")} is not matrix-settable`,
  };
}

/** Every `$env` leaf a value carries must name a browser-settable key. */
export function checkSetterValue(value: unknown): PolicyVerdict {
  const size = JSON.stringify(value ?? null).length;
  if (size > MATRIX_LIMITS.setterValueBytes) {
    return {
      ok: false,
      reason: `value is ${size} bytes; at most ${MATRIX_LIMITS.setterValueBytes}`,
    };
  }
  for (const name of envLeaves(value)) {
    if (!isBrowserEnvKey(name)) {
      return { ok: false, reason: `$env "${name}" is not browser-settable` };
    }
  }
  return { ok: true };
}

function envLeaves(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(envLeaves);
  if (typeof value !== "object" || value === null) return [];
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  // A `$$` escape is literal data.
  if (keys.length === 1 && keys[0] === "$$") return [];
  if (keys.length === 1 && keys[0] === "$env") {
    const operand = record.$env;
    if (typeof operand === "string") return [operand];
    if (typeof operand === "object" && operand !== null) {
      const name = (operand as Record<string, unknown>).name;
      return [typeof name === "string" ? name : String(name)];
    }
    return [String(operand)];
  }
  return Object.values(record).flatMap(envLeaves);
}

export function checkEnvKey(key: string): PolicyVerdict {
  return isBrowserEnvKey(key)
    ? { ok: true }
    : { ok: false, reason: `env ${key} is not browser-settable` };
}
