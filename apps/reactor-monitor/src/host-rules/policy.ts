// Which setters and env the monitor may apply to a host. Browser-safe.
import {
  hostNameSchema,
  outputTokenSchema,
  tokenKeyOf,
} from "@powerhousedao/host-core/schema";
import {
  CODE_LOADING_ENV,
  ENV_KEY_PATTERN,
  isBrowserEnvKey,
} from "../controller/api.ts";
import { HOST_RULES_LIMITS, isDelete, type Setter } from "./schema.ts";

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

/** A host's name keys its run record file, so it stays one safe segment. */
const NAME: Pattern = ["name"];
export const NAME_REASON =
  "The name becomes a file name, so use only letters, digits, '.', '_' and '-', start with a letter or digit, and keep it to 128 characters.";
const REMOTE_URL: Pattern = ["reactor", "backends", "*", "remote", "url"];
const DRIVES: Pattern = ["reactor", "drives"];
const PLACED_DRIVE: Pattern = ["reactor", "placement", "drives", "*"];
const DATA_DIR: Pattern = ["reactor", "backends", "*", "storage", "dataDir"];
const READ_MODEL: Pattern = ["reactor", "backends", "*", "readModel", "url"];

/**
 * A folder under the project's `.ph/` or the instance's user data. Only those
 * stay out of the user's repo when the project is materialised by symlinks.
 */
export function isContainedPath(value: string): boolean {
  const parts = value
    .split(/[/\\]+/)
    .filter((part) => part !== "" && part !== ".");
  if (parts.includes("..") || /^([/\\~]|[A-Za-z]:)/.test(value)) return false;
  const [root, ...rest] = parts;
  if (rest.length === 0 || rest.some((part) => /[$:]/.test(part))) return false;
  return root === ".ph" || root === "${userData}";
}

export const FOLDER_REASONS = {
  dataDir:
    "The storage folder has to be inside the project's .ph folder, like .ph/reactor-storage.",
  readModel:
    "The search data folder has to be inside the project's .ph folder, like .ph/read-storage.",
} as const;

function folderVerdict(value: unknown, reason: string): PolicyVerdict {
  if (typeof value === "string" && isContainedPath(value)) return OK;
  return typeof value === "string"
    ? { ok: false, reason, hint: value }
    : { ok: false, reason };
}

/**
 * The `config.switchboard` settings the monitor may write: the same ones its
 * env allowlist passes (controller/api.ts), each in its per-switchboard home.
 */
const SWITCHBOARD_SETTABLE: Pattern[] = [
  ["auth", "enabled"],
  ["auth", "resolveIdentity"],
  ["auth", "requireAuthenticatedCaller"],
  ["auth", "admins"],
  ["auth", "defaultProtection"],
  ["auth", "attachmentReadsFollowDocumentPolicy"],
  ["auth", "documentPermissions", "enabled"],
  ["inspection", "**"],
  ["workers", "**"],
  ["features", "mcp"],
  ["features", "documentModelSubgraphs"],
].map((pattern) => ["config", "switchboard", ...pattern]);

/** Leaf paths a value may be written at. */
const SETTABLE: Pattern[] = [
  NAME,
  ["reactor", "protocol", "**"],
  ["reactor", "backends", "*", "kind"],
  ["reactor", "backends", "*", "storage", "kind"],
  ["reactor", "backends", "*", "storage", "dataDir"],
  READ_MODEL,
  REMOTE_URL,
  ["reactor", "namespace"],
  ["reactor", "placement", "primary"],
  ["reactor", "placement", "newDrives"],
  PLACED_DRIVE,
  ["reactor", "router", "probeTimeoutMs"],
  ["reactor", "router", "provisionalRouteMs"],
  ["reactor", "backends", "*", "remote", "requestTimeoutMs"],
  ["reactor", "backends", "*", "remote", "realtime"],
  ["reactor", "backends", "*", "remote", "breaker"],
  ["reactor", "backends", "*", "remote", "breaker", "failures"],
  ["reactor", "backends", "*", "remote", "breaker", "openMs"],
  ["runner", "port"],
  ["runner", "dev"],
  ...SWITCHBOARD_SETTABLE,
];

const DELETABLE: Pattern[] = [
  ...SETTABLE,
  ["reactor", "backends", "*"],
  ["reactor", "backends", "*", "storage"],
  ["reactor", "backends", "*", "storage", "url"],
  ["reactor", "backends", "*", "readModel"],
  ["reactor", "backends", "*", "remote"],
  ["reactor", "placement"],
  ["reactor", "router"],
];

const CODE_REASONS = {
  plugins: "The monitor can't change plugins, because they load code.",
  packages:
    "The monitor can't change document-model packages, because they load code.",
  drives:
    "The monitor can't change drives, because remote drives reach other servers.",
  driveList:
    "The monitor can only add a drive by name, or link a drive of a switchboard in this host.",
} as const;

/**
 * `config.switchboard` keys the switchboard runner refuses, and where each is
 * set instead (ph-cli runners/member-config.ts memberSwitchboardConfigSchema).
 */
export const SETTINGS_ELSEWHERE: [Pattern, string][] = [
  [
    ["protocol", "**"],
    "The switchboard won't start with access control in its own settings. Set it in the reactor settings instead.",
  ],
  [
    ["storage", "reactor", "**"],
    "The switchboard won't start with its storage in its own settings. Set it in the reactor settings instead.",
  ],
  [
    ["storage", "readModel", "**"],
    "The switchboard won't start with its search data folder in its own settings. Set it in the reactor settings instead.",
  ],
  [
    ["packages", "dynamic"],
    "The switchboard won't start with on-demand document models in its own settings. Set them in the reactor settings instead.",
  ],
  [
    ["server", "port"],
    "The switchboard won't start with a port in its own settings. Set its port instead.",
  ],
  [
    ["server", "dev"],
    "The switchboard won't start with hot reload in its own settings. Turn hot reload on or off instead.",
  ],
  [
    ["logLevel"],
    "The switchboard won't start with a log level in its own settings. Set it in the host's environment, where it applies to every reactor.",
  ],
  [
    ["drive", "**"],
    "The switchboard won't start with a drive in its own settings. Declare drives in the reactor settings instead.",
  ],
  [
    ["remoteDrives", "**"],
    "The switchboard won't start with remote drives in its own settings. Declare drives in the reactor settings instead.",
  ],
  [
    ["features", "pluginHost"],
    "The switchboard won't start with the plugin host in its own settings. Plugins turn it on.",
  ],
  [
    ["processorConfig", "**"],
    "The switchboard won't start with processor settings in its own settings.",
  ],
];

const DENIED_FAMILIES: [Pattern, string][] = [
  [
    ["runner", "module", "**"],
    "The monitor can't change which runner a reactor uses, because that loads other code.",
  ],
  [["runner", "plugins", "**"], CODE_REASONS.plugins],
  [["reactor", "backends", "*", "packages", "**"], CODE_REASONS.packages],
  [
    ["reactor", "workflows", "**"],
    "The monitor can't turn workflows on or off, because that loads code.",
  ],
  [["reactor", "drives", "**"], CODE_REASONS.drives],
  [["config", "switchboard", "packages", "**"], CODE_REASONS.packages],
  ...SETTINGS_ELSEWHERE.map(([pattern, reason]): [Pattern, string] => [
    ["config", "switchboard", ...pattern],
    reason,
  ]),
  [
    ["config", "switchboard", "features", "workflows"],
    "The monitor can't turn workflows on or off, because that loads code.",
  ],
];

/** Runner config other than a switchboard's own settings. */
const OTHER_CONFIG_REASON =
  "The monitor can't change runner config; each runner defines its own.";

function isOtherConfig(rest: readonly string[]): boolean {
  return rest[0] === "config" && rest[1] !== "switchboard";
}

export type PolicyVerdict =
  | { ok: true }
  | { ok: false; reason: string; hint?: string };

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

export const REMOTE_URL_REASON =
  "A reactor can only sync with a drive of another reactor in this host.";

/** The slug of a `drives.<slug>.url` output of a member of this host. */
export function memberDriveSlug(
  value: unknown,
  envelope: unknown,
): string | undefined {
  const token = outputTokenSchema.safeParse(value);
  if (!token.success) return undefined;
  const { host, path } = token.data.$output;
  if (!memberFolders(envelope).includes(host)) return undefined;
  const [drives, slug, url, ...rest] = path;
  return drives === "drives" &&
    typeof slug === "string" &&
    slug !== "" &&
    url === "url" &&
    rest.length === 0
    ? slug
    : undefined;
}

/** A remote may only open a drive of another reactor of this host, by its output. */
function remoteUrlVerdict(value: unknown, envelope: unknown): PolicyVerdict {
  return memberDriveSlug(value, envelope) === undefined
    ? { ok: false, reason: REMOTE_URL_REASON }
    : OK;
}

function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => isEqual(item, b[index]))
    );
  }
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && isEqual(a[key], b[key]))
  );
}

/** What the subject runs at `rest` now; a child without its own reactor
 * block runs its folder's. */
function currentValue(
  envelope: unknown,
  subject: readonly string[],
  rest: readonly string[],
): unknown {
  let body: unknown = envelope;
  for (const segment of subject) {
    if (!isPlainObject(body) || !Object.hasOwn(body, segment)) return undefined;
    body = body[segment];
  }
  if (
    isChild(subject) &&
    rest[0] === "reactor" &&
    isPlainObject(body) &&
    body.reactor === undefined &&
    typeof body.host === "string" &&
    isPlainObject(envelope) &&
    isPlainObject(envelope.members)
  ) {
    body = Object.hasOwn(envelope.members, body.host)
      ? envelope.members[body.host]
      : undefined;
  }
  for (const segment of rest) {
    if (!isPlainObject(body) || !Object.hasOwn(body, segment)) return undefined;
    body = body[segment];
  }
  return body;
}

/**
 * A drive list the monitor may write: entries the reactor already has, a
 * drive added by name, or a link to a drive of another reactor of this host.
 */
function drivesVerdict(
  value: unknown,
  current: unknown,
  envelope: unknown,
): PolicyVerdict {
  const refused = { ok: false, reason: CODE_REASONS.driveList } as const;
  if (!Array.isArray(value)) return refused;
  const kept = Array.isArray(current) ? current : [];
  for (const entry of value) {
    if (kept.some((other) => isEqual(other, entry))) continue;
    if (!isPlainObject(entry) || typeof entry.slug !== "string") return refused;
    const keys = Object.keys(entry);
    const named =
      keys.every((key) => key === "slug" || key === "name") &&
      (entry.name === undefined || typeof entry.name === "string");
    const remote = isPlainObject(entry.remote) ? entry.remote : undefined;
    const linked =
      keys.length === 2 &&
      remote !== undefined &&
      Object.keys(remote).length === 1 &&
      memberDriveSlug(remote.url, envelope) === entry.slug;
    if (!named && !linked) return refused;
  }
  return OK;
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
  // Copying what the reactor already runs, as into a wrapper, changes nothing.
  const current =
    rest[0] === "reactor" ? currentValue(envelope, subject, rest) : undefined;
  if (current !== undefined && isEqual(current, value)) return OK;
  // New drive entries can't carry `$env`; kept ones are what it runs.
  if (matches(DRIVES, rest)) return drivesVerdict(value, current, envelope);
  const env = envVerdict(value);
  if (!env.ok) return env;
  for (const [pattern, reason] of DENIED_FAMILIES) {
    if (matches(pattern, rest)) return { ok: false, reason };
  }
  if (matches(REMOTE_URL, rest)) return remoteUrlVerdict(value, envelope);
  if (matches(NAME, rest)) {
    return typeof value === "string" && hostNameSchema.safeParse(value).success
      ? OK
      : { ok: false, reason: NAME_REASON };
  }
  if (matches(DATA_DIR, rest)) {
    return folderVerdict(value, FOLDER_REASONS.dataDir);
  }
  if (matches(READ_MODEL, rest)) {
    return folderVerdict(value, FOLDER_REASONS.readModel);
  }
  if (SETTABLE.some((pattern) => matches(pattern, rest))) return OK;
  if (isOtherConfig(rest)) return { ok: false, reason: OTHER_CONFIG_REASON };
  const hint = rest.join(".");
  return DELETABLE.some((pattern) => matches(pattern, rest))
    ? {
        ok: false,
        reason: "The monitor can only remove this setting, not set it.",
        hint,
      }
    : { ok: false, reason: "The monitor can't change this setting.", hint };
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
    // A member, or a member folder no child runs any more; never the host.
    if (rest.length === 0) {
      return subject[0] === "members" || isChild(subject)
        ? OK
        : { ok: false, reason: "The monitor can't remove the host itself." };
    }
    for (const [pattern, reason] of DENIED_FAMILIES) {
      if (matches(pattern, rest)) return { ok: false, reason };
    }
    if (DELETABLE.some((pattern) => matches(pattern, rest))) return OK;
    return isOtherConfig(rest)
      ? { ok: false, reason: OTHER_CONFIG_REASON }
      : {
          ok: false,
          reason: "The monitor can't remove this setting.",
          hint: rest.join("."),
        };
  }
  if (rest.length === 0 && !isChild(subject)) {
    return {
      ok: false,
      reason: "The monitor can't replace a whole host file.",
    };
  }
  const size = sizeVerdict(setter.value);
  if (!size.ok) return size;
  for (const [leafRest, leafValue] of leaves(rest, setter.value)) {
    const verdict = leafVerdict(subject, leafRest, leafValue, envelope);
    if (!verdict.ok) return verdict;
  }
  return OK;
}

function sizeVerdict(value: unknown): PolicyVerdict {
  const size = new TextEncoder().encode(JSON.stringify(value ?? null)).length;
  return size > HOST_RULES_LIMITS.setterValueBytes
    ? {
        ok: false,
        reason: `The value is ${size} bytes; the limit is ${HOST_RULES_LIMITS.setterValueBytes}.`,
      }
    : OK;
}

function envVerdict(value: unknown): PolicyVerdict {
  for (const name of envLeaves(value)) {
    const verdict = checkEnvKey(name);
    if (!verdict.ok) return verdict;
  }
  return OK;
}

/** Size, and every `$env` leaf must name a key the monitor accepts. */
export function checkSetterValue(value: unknown): PolicyVerdict {
  const size = sizeVerdict(value);
  return size.ok ? envVerdict(value) : size;
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
