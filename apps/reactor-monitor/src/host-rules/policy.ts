// Which setters and env the monitor may apply to a host. Browser-safe.
import { outputTokenSchema, tokenKeyOf } from "@powerhousedao/host-core/schema";
import {
  CODE_LOADING_ENV,
  ENV_KEY_PATTERN,
  isBrowserEnvKey,
} from "../controller/api.js";
import { HOST_RULES_LIMITS, isDelete, type Setter } from "./schema.js";

const FORBIDDEN_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

export type ParsedPath =
  | { segments: string[]; subject: string[]; rest: string[] }
  | { error: string };

/** Dotted, rooted at the envelope: host.…, members.<f>.… or host.children.<k>.… */
export function parsePath(path: string): ParsedPath {
  const segments = path.split(".");
  if (segments.length > HOST_RULES_LIMITS.pathSegments) {
    return {
      error: `The path "${path}" is longer than ${HOST_RULES_LIMITS.pathSegments} parts.`,
    };
  }
  if (segments.some((segment) => segment === "")) {
    return { error: `The path "${path}" has an empty part.` };
  }
  const forbidden = segments.find((segment) => FORBIDDEN_SEGMENTS.has(segment));
  if (forbidden !== undefined) {
    return {
      error: `The path "${path}" uses the reserved name "${forbidden}".`,
    };
  }
  if (segments.some((segment) => segment.startsWith("$"))) {
    return { error: `The path "${path}" points inside a token.` };
  }
  const subject = subjectOf(segments);
  if (!subject) {
    return {
      error: `The path "${path}" must start at host, members.<folder> or host.children.<key>.`,
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

const REMOTE_URL: Pattern = ["reactor", "backends", "*", "remote", "url"];

/** Leaf paths a value may be written at. */
const SETTABLE: Pattern[] = [
  ["reactor", "protocol", "**"],
  ["reactor", "backends", "*", "kind"],
  ["reactor", "backends", "*", "storage", "kind"],
  ["reactor", "backends", "*", "storage", "dataDir"],
  ["reactor", "backends", "*", "readModel", "url"],
  REMOTE_URL,
  ["reactor", "namespace"],
  ["reactor", "placement", "primary"],
  ["runner", "port"],
  ["runner", "dev"],
];

const DELETABLE: Pattern[] = [
  ...SETTABLE,
  ["reactor", "backends", "*"],
  ["reactor", "backends", "*", "storage"],
  ["reactor", "backends", "*", "storage", "url"],
  ["reactor", "backends", "*", "readModel"],
  ["reactor", "backends", "*", "remote"],
  ["reactor", "placement"],
];

const DENIED_FAMILIES: [Pattern, string][] = [
  [
    ["runner", "module", "**"],
    "The monitor can't change which runner a reactor uses, because that loads other code.",
  ],
  [
    ["runner", "plugins", "**"],
    "The monitor can't change plugins, because they load code.",
  ],
  [
    ["reactor", "backends", "*", "packages", "**"],
    "The monitor can't change document-model packages, because they load code.",
  ],
  [
    ["reactor", "workflows", "**"],
    "The monitor can't turn workflows on or off, because that loads code.",
  ],
  [
    ["reactor", "drives", "**"],
    "The monitor can't change drives, because remote drives reach other servers.",
  ],
  [
    ["config", "**"],
    "The monitor can't change runner config; each runner defines its own.",
  ],
];

export type PolicyVerdict = { ok: true } | { ok: false; reason: string };

const OK: PolicyVerdict = { ok: true };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isChild(subject: readonly string[]): boolean {
  return subject.at(-2) === "children";
}

function memberFolders(envelope: unknown): string[] {
  if (!isPlainObject(envelope) || !isPlainObject(envelope.members)) return [];
  return Object.keys(envelope.members);
}

/** A remote may only point at another reactor of this host, by its output. */
function remoteUrlVerdict(value: unknown, envelope: unknown): PolicyVerdict {
  const token = outputTokenSchema.safeParse(value);
  if (
    token.success &&
    memberFolders(envelope).includes(token.data.$output.host)
  ) {
    return OK;
  }
  return {
    ok: false,
    reason: "A reactor can only sync with another reactor in this host.",
  };
}

function childHostVerdict(value: unknown, envelope: unknown): PolicyVerdict {
  if (typeof value === "string" && memberFolders(envelope).includes(value)) {
    return OK;
  }
  return {
    ok: false,
    reason: `A reactor has to run one of this host's member folders; "${String(value)}" isn't one.`,
  };
}

function leafVerdict(
  subject: readonly string[],
  rest: readonly string[],
  value: unknown,
  envelope: unknown,
): PolicyVerdict {
  if (isChild(subject) && rest.length === 1 && rest[0] === "host") {
    return childHostVerdict(value, envelope);
  }
  for (const [pattern, reason] of DENIED_FAMILIES) {
    if (matches(pattern, rest)) return { ok: false, reason };
  }
  if (matches(REMOTE_URL, rest)) return remoteUrlVerdict(value, envelope);
  if (SETTABLE.some((pattern) => matches(pattern, rest))) return OK;
  const where = rest.join(".");
  return DELETABLE.some((pattern) => matches(pattern, rest))
    ? { ok: false, reason: `The monitor can only remove ${where}, not set it.` }
    : { ok: false, reason: `The monitor can't change ${where}.` };
}

/** Each written leaf; a token, an array or an empty object is one leaf. */
function leaves(
  rest: readonly string[],
  value: unknown,
): [string[], unknown][] {
  if (
    !isPlainObject(value) ||
    tokenKeyOf(value) !== undefined ||
    Object.keys(value).length === 0
  ) {
    return [[[...rest], value]];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    leaves([...rest, key], child),
  );
}

/** A set is checked leaf by leaf; `envelope` names the member folders. */
export function checkSetter(setter: Setter, envelope?: unknown): PolicyVerdict {
  const parsed = parsePath(setter.path);
  if ("error" in parsed) return { ok: false, reason: parsed.error };
  const { subject, rest } = parsed;
  if (isDelete(setter.value)) {
    if (rest.length === 0) {
      return isChild(subject)
        ? OK
        : { ok: false, reason: "The monitor can't remove a whole host file." };
    }
    for (const [pattern, reason] of DENIED_FAMILIES) {
      if (matches(pattern, rest)) return { ok: false, reason };
    }
    return DELETABLE.some((pattern) => matches(pattern, rest))
      ? OK
      : { ok: false, reason: `The monitor can't remove ${rest.join(".")}.` };
  }
  if (rest.length === 0 && !isChild(subject)) {
    return {
      ok: false,
      reason: "The monitor can't replace a whole host file.",
    };
  }
  const value = checkSetterValue(setter.value);
  if (!value.ok) return value;
  for (const [leafRest, leafValue] of leaves(rest, setter.value)) {
    const verdict = leafVerdict(subject, leafRest, leafValue, envelope);
    if (!verdict.ok) return verdict;
  }
  return OK;
}

/** Size, and every `$env` leaf must name a key the monitor accepts. */
export function checkSetterValue(value: unknown): PolicyVerdict {
  const size = new TextEncoder().encode(JSON.stringify(value ?? null)).length;
  if (size > HOST_RULES_LIMITS.setterValueBytes) {
    return {
      ok: false,
      reason: `The value is ${size} bytes; the limit is ${HOST_RULES_LIMITS.setterValueBytes}.`,
    };
  }
  for (const name of envLeaves(value)) {
    const verdict = checkEnvKey(name);
    if (!verdict.ok) return verdict;
  }
  return OK;
}

function envLeaves(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(envLeaves);
  if (!isPlainObject(value)) return [];
  const keys = Object.keys(value);
  // A `$$` escape is literal data.
  if (keys.length === 1 && keys[0] === "$$") return [];
  if (keys.length === 1 && keys[0] === "$env") {
    const operand = value.$env;
    if (typeof operand === "string") return [operand];
    if (isPlainObject(operand)) {
      return [typeof operand.name === "string" ? operand.name : ""];
    }
    return [""];
  }
  return Object.values(value).flatMap(envLeaves);
}

const SET_ELSEWHERE: Record<string, string> = {
  PH_REACTOR_DATABASE_URL: "The database comes from the controller's config.",
  PH_SWITCHBOARD_DATABASE_URL:
    "The database comes from the controller's config.",
  RENOWN_SOURCE: "Set signer credentials in powerhouse.config.json.",
};

export function checkEnvKey(key: string): PolicyVerdict {
  if (isBrowserEnvKey(key)) return OK;
  if (!ENV_KEY_PATTERN.test(key)) {
    return {
      ok: false,
      reason: `"${key}" isn't a valid name. Use capital letters, digits and _, and don't start with a digit.`,
    };
  }
  if (CODE_LOADING_ENV.test(key)) {
    return {
      ok: false,
      reason: `${key} loads code, so only the controller's config can set it.`,
    };
  }
  return {
    ok: false,
    reason:
      SET_ELSEWHERE[key] ?? `The monitor doesn't pass ${key} to reactors.`,
  };
}
