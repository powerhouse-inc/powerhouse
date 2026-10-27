import { protocolEnv } from "@powerhousedao/host-core/projection";
import {
  refineStartOrder,
  type HostExport,
  type ReactorProtocol,
} from "@powerhousedao/host-core/schema";
import type { z } from "zod";
import { EXPORT_FILE, parseHostExport } from "../lib/host-import.js";
import {
  effectiveFlags,
  FLAG_ENV,
  FLAG_LABELS,
  ladderGaps,
  LADDER,
  type FeatureFlag,
} from "./flags.js";
import {
  fileOf,
  isRecord,
  membersOf,
  nestedChildren,
  primaryBackendName,
  switchboardSettings,
  valueAt,
  type Member,
} from "./members.js";
import {
  checkEnvKey,
  FOLDER_REASONS,
  isContainedPath,
  SETTINGS_ELSEWHERE,
} from "./policy.js";
import {
  hostRulesContextSchema,
  type HostDraft,
  type HostEnv,
  type HostRuleIssue,
  type HostRulesContext,
  type RuleName,
} from "./schema.js";

const STORAGE_KINDS = {
  controller: ["path", "postgres"],
  browser: ["idb", "memory"],
} as const;

const STORAGE_REASONS: Record<
  "controller" | "browser",
  Record<string, string>
> = {
  controller: {
    idb: "A switchboard can't use browser storage. Use a folder on disk or Postgres.",
    memory:
      "A switchboard ignores in-memory storage and keeps its data in a folder on disk.",
  },
  browser: {
    path: "Only a switchboard can store in a folder.",
    postgres:
      "A browser can't reach Postgres. Sync with a switchboard that uses it instead.",
  },
};

export const REASONS = {
  noController:
    "Starting a switchboard needs the monitor's controller, which isn't running.",
  noPostgres: "The controller has no Postgres database.",
  postgresUrl:
    "The Postgres connection comes from the controller's config. Remove the address.",
  workersDev:
    "Turn off hot reload to use background workers. Hot-reloaded document models can't move to a worker.",
  workersTrust:
    "Background workers can't check signatures when permissions are on and this switchboard holds the signer credentials. Get credentials from a Renown service, or turn permissions off.",
  workersStorage:
    "Background workers need Postgres storage. The built-in database can't be shared between workers.",
  workersValue: "Background workers must be a whole number or auto.",
  workersNoSwitchboard:
    "Only a switchboard runs background workers, and this host has none.",
  projectionDev:
    "Turn off hot reload to use a separate thread for search data.",
  projectionStorage:
    "A separate thread for search data needs Postgres storage. The built-in database can't be shared between threads.",
  projectionValue: "Turn the separate thread for search data on or off.",
  projectionNoSwitchboard:
    "Only a switchboard has a separate thread for search data, and this host has none.",
  envNoSwitchboard: "Only a switchboard reads this, and this host has none.",
  readModel:
    "With no storage folder chosen, the switchboard would keep all its data in the search data folder. Choose a storage folder, or remove the search data folder.",
  switchboardOnly: "Only a switchboard reads these settings.",
  workflowsTwice:
    "Workflows are turned on or off in two places, so the switchboard won't start. Remove one.",
  nested:
    "This reactor starts a group of reactors, which the monitor doesn't check yet.",
} as const;

export type Validation = {
  members: Member[];
  issues: HostRuleIssue[];
  /** The same issues, grouped by path. */
  byPath: Record<string, HostRuleIssue[]>;
};

type Report = (
  rule: RuleName,
  path: string,
  message: string,
  hint?: string,
) => void;

function envValue(env: HostEnv, key: string): string | undefined {
  return Object.hasOwn(env, key) ? env[key] : undefined;
}

function envPath(key: string): string {
  return `env.${key}`;
}

function hasSwitchboard(members: Member[]): boolean {
  return members.some((member) => member.role === "switchboard");
}

/** File-relative paths from the shape check, rooted at the envelope. */
function envelopePath(
  envelope: HostExport,
  file: string,
  path: string,
): string {
  if (file === EXPORT_FILE) return path;
  const folder = file.replace(/^hosts\//, "").replace(/\/host\.js$/, "");
  const root = folder === envelope.name ? "host" : `members.${folder}`;
  return path === "" ? root : `${root}.${path}`;
}

/** The schema's own words go to the hint; the message is a sentence. */
export function shapeWording(message: string): {
  message: string;
  hint?: string;
} {
  if (/^Unrecognized key/.test(message)) {
    return {
      message: "A host file can't contain this setting.",
      hint: message,
    };
  }
  if (/^Too (small|big)/.test(message)) {
    return { message: "This value is out of range.", hint: message };
  }
  if (/^(Invalid|Expected)/.test(message)) {
    return { message: "This value isn't valid here.", hint: message };
  }
  return { message };
}

function shapeRule(envelope: HostExport, report: Report): void {
  for (const issue of parseHostExport(JSON.stringify(envelope)).issues) {
    const path = envelopePath(envelope, issue.file, issue.path);
    const worded = shapeWording(issue.message);
    report("shape", path, worded.message, worded.hint);
  }
  const bodies: [string, unknown][] = [
    ["host", envelope.host],
    ...Object.entries(isRecord(envelope.members) ? envelope.members : {}).map(
      ([folder, body]): [string, unknown] => [`members.${folder}`, body],
    ),
  ];
  for (const [at, body] of bodies) {
    if (!isRecord(body) || !isRecord(body.children)) continue;
    const config = isRecord(body.config) ? body.config : undefined;
    const ctx = {
      addIssue: (issue: { path?: PropertyKey[]; message?: string }) =>
        report(
          "shape",
          [at, ...(issue.path ?? []).map(String)].join("."),
          "The start order names a reactor this host doesn't have, or one twice.",
          issue.message,
        ),
    } as unknown as z.RefinementCtx;
    refineStartOrder({ children: body.children, config }, ctx);
  }
  for (const path of nestedChildren(envelope)) {
    report("scope", path, REASONS.nested);
  }
}

/** REACTOR_WORKERS as the switchboard's parseWorkerCount reads it; auto is on. */
export function workerCount(raw: string): number | undefined {
  const value = raw.trim();
  if (value === "") return 0;
  if (value.toLowerCase() === "auto") return Number.POSITIVE_INFINITY;
  const count = Number.parseInt(value, 10);
  return Number.isInteger(count) && count >= 0 && String(count) === value
    ? count
    : undefined;
}

const ON = ["1", "true", "on", "yes"];
const OFF = ["0", "false", "off", "no"];

/** REACTOR_PROJECTION_WORKER as the switchboard's parseOnOff reads it. */
export function onOff(raw: string | undefined): boolean | undefined {
  if (raw === undefined || raw.trim() === "") return false;
  const token = raw.trim().toLowerCase();
  if (ON.includes(token)) return true;
  if (OFF.includes(token)) return false;
  return undefined;
}

const PROTOCOL_ENV = new Set([
  ...Object.values(FLAG_ENV),
  "CREATE_SIGNATURE_POLICY",
  "REACTOR_UNSUPPORTED_STORED_DOCUMENTS",
]);

/** One env for the whole host; only switchboards read the reactor keys. */
function envRule(env: HostEnv, members: Member[], report: Report): void {
  for (const key of Object.keys(env)) {
    const verdict = checkEnvKey(key);
    if (!verdict.ok) report("env", envPath(key), verdict.reason);
  }
  const workers = envValue(env, "REACTOR_WORKERS");
  const projection = envValue(env, "REACTOR_PROJECTION_WORKER");
  if (!hasSwitchboard(members)) {
    if (workers !== undefined) {
      report("env", envPath("REACTOR_WORKERS"), REASONS.workersNoSwitchboard);
    }
    if (projection !== undefined) {
      report(
        "env",
        envPath("REACTOR_PROJECTION_WORKER"),
        REASONS.projectionNoSwitchboard,
      );
    }
    for (const key of Object.keys(env)) {
      if (PROTOCOL_ENV.has(key)) {
        report("env", envPath(key), REASONS.envNoSwitchboard);
      }
    }
    return;
  }
  if (workers !== undefined && workerCount(workers) === undefined) {
    report("env", envPath("REACTOR_WORKERS"), REASONS.workersValue);
  }
  if (projection !== undefined && onOff(projection) === undefined) {
    report(
      "env",
      envPath("REACTOR_PROJECTION_WORKER"),
      REASONS.projectionValue,
      "1, true, on, yes, 0, false, off, no",
    );
  }
}

function flagsOf(member: Member, env: HostEnv) {
  return effectiveFlags(
    member.reactor?.protocol,
    member.role === "switchboard" ? env : {},
  );
}

function declaredFlags(member: Member): string {
  return LADDER.map((flag) =>
    String(effectiveFlags(member.reactor?.protocol).flags[flag]),
  ).join(",");
}

/** The member folders whose outputs a value reads (`$output` tokens). */
function outputHosts(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) outputHosts(item, into);
    return into;
  }
  if (!isRecord(value)) return into;
  const token = value.$output;
  if (isRecord(token) && typeof token.host === "string") into.add(token.host);
  for (const child of Object.values(value)) outputHosts(child, into);
  return into;
}

/** Each member paired with the members whose outputs it reads, so they sync. */
function syncPairs(members: Member[]): [Member, Member][] {
  return members.flatMap((member) => {
    const hosts = outputHosts([member.runner, member.reactor, member.config]);
    return members
      .filter((other) => other !== member && hosts.has(other.folder))
      .map((other): [Member, Member] => [member, other]);
  });
}

/** Members that sync must agree on access control; env cannot bend it. */
function protocolRule(members: Member[], env: HostEnv, report: Report): void {
  for (const [member, other] of syncPairs(members)) {
    if (declaredFlags(member) === declaredFlags(other)) continue;
    report(
      "protocol",
      `${member.reactorAt}.protocol.featureFlags`,
      `${member.key} syncs with ${other.key}, so both need the same access control. Set ${member.key}'s to match ${other.key}'s.`,
    );
  }
  for (const member of members) {
    if (member.role !== "switchboard") continue;
    const host = protocolEnv(
      member.reactor?.protocol as ReactorProtocol | undefined,
    );
    for (const [key, hostValue] of Object.entries(host)) {
      const value = envValue(env, key);
      if (value === undefined || value === hostValue) continue;
      report(
        "protocol",
        envPath(key),
        `${key}=${value} disagrees with the host's setting (${hostValue}), so ${member.key} won't start.`,
      );
    }
  }
}

function label(flags: readonly FeatureFlag[]): string {
  return flags.map((flag) => FLAG_LABELS[flag]).join(" and ");
}

function ladderRule(members: Member[], env: HostEnv, report: Report): void {
  for (const member of members) {
    const { flags, fromEnv } = flagsOf(member, env);
    for (const gap of ladderGaps(flags)) {
      const key = fromEnv[gap.flag];
      report(
        "ladder",
        key
          ? envPath(key)
          : `${member.reactorAt}.protocol.featureFlags.${gap.flag}`,
        `${FLAG_LABELS[gap.flag]} needs ${label(gap.missing)} turned on, or ${member.key} won't start.`,
      );
    }
  }
}

function storageRule(
  members: Member[],
  env: HostEnv,
  context: z.output<typeof hostRulesContextSchema>,
  report: Report,
): void {
  for (const member of members) {
    if (member.role === "switchboard" && !context.controller) {
      report("capability", member.path, REASONS.noController);
    }
    if (member.placementMissing) {
      const name = primaryBackendName(member.reactor) ?? "";
      report(
        "storage",
        `${member.reactorAt}.placement.primary`,
        `The main backend is set to "${name}", which ${member.key} doesn't have, so ${member.key} would ignore its backends.`,
      );
    }
    for (const backend of member.backends) {
      if (backend.mode !== "controller" && backend.mode !== "browser") continue;
      const at = `${backend.at}.storage`;
      const kind = backend.storage;
      const allowed: readonly string[] = STORAGE_KINDS[backend.mode];
      if (kind !== undefined && !allowed.includes(kind)) {
        report(
          "storage",
          `${at}.kind`,
          STORAGE_REASONS[backend.mode][kind] ??
            "This kind of storage isn't available here.",
          kind,
        );
        continue;
      }
      if (backend.mode !== "controller") continue;
      const storage = isRecord(backend.body.storage)
        ? backend.body.storage
        : {};
      const readModel = isRecord(backend.body.readModel)
        ? backend.body.readModel.url
        : undefined;
      const dataDir = resolvedDataDir(env, storage.dataDir);
      if (dataDir.unset) {
        report(
          "env",
          `${at}.dataDir`,
          `The storage folder comes from ${dataDir.unset}, which isn't set in this host's environment.`,
          dataDir.unset,
        );
      } else if (
        dataDir.value !== undefined &&
        !isContainedPath(dataDir.value)
      ) {
        report(
          "storage",
          `${at}.dataDir`,
          FOLDER_REASONS.dataDir,
          dataDir.value,
        );
      }
      const namesStore =
        kind === "postgres" || (kind === "path" && dataDir.value !== undefined);
      if (typeof readModel === "string" && !isContainedPath(readModel)) {
        report(
          "storage",
          `${backend.at}.readModel.url`,
          FOLDER_REASONS.readModel,
          readModel,
        );
      } else if (readModel !== undefined && !namesStore) {
        // With nothing else naming the store, the reactor moves there too.
        report(
          "storage",
          `${backend.at}.readModel.url`,
          REASONS.readModel,
          typeof readModel === "string" ? readModel : undefined,
        );
      }
      if (kind !== "postgres") continue;
      if (storage.url !== undefined) {
        report("postgres", `${at}.url`, REASONS.postgresUrl);
      }
      if (!context.postgres) {
        report("capability", `${at}.kind`, REASONS.noPostgres);
      }
    }
  }
}

/** A `$env` data dir read from the host's env, as `ph run` resolves it. */
function resolvedDataDir(
  env: HostEnv,
  dataDir: unknown,
): { value?: string; unset?: string } {
  if (typeof dataDir === "string") return { value: dataDir };
  if (!isRecord(dataDir) || !Object.hasOwn(dataDir, "$env")) return {};
  const operand = dataDir.$env;
  const name =
    typeof operand === "string"
      ? operand
      : isRecord(operand) && typeof operand.name === "string"
        ? operand.name
        : undefined;
  if (name === undefined) return {};
  const value = envValue(env, name);
  if (value !== undefined) return { value };
  const optional = isRecord(operand) && operand.optional === true;
  return optional ? {} : { unset: name };
}

/** The switchboard's database can only be shared when it is in Postgres. */
function sharedDb(member: Member): boolean {
  const primary = member.backends.find((backend) => backend.primary);
  return primary?.storage === "postgres";
}

type WorkerSetting<T> = {
  /** undefined: not a value the switchboard accepts. */
  value: T | undefined;
  /** `env.<KEY>` when the host's env sets it, which wins; else the setting. */
  at: string;
  fromEnv: boolean;
};

function settingAt(member: Member, keys: readonly string[]): string {
  return `${member.configAt}.switchboard.${keys.join(".")}`;
}

const COUNT_KEYS = ["workers", "executor", "count"] as const;
const PROJECTION_KEYS = ["workers", "projection", "enabled"] as const;

/** A switchboard's workers: the host's env wins over its own settings. */
export function workerSettings(
  member: Member,
  env: HostEnv,
): { count: WorkerSetting<number>; projection: WorkerSetting<boolean> } {
  const settings = switchboardSettings(member);
  const envCount = envValue(env, "REACTOR_WORKERS");
  const ownCount = valueAt(settings, COUNT_KEYS);
  const envProjection = envValue(env, "REACTOR_PROJECTION_WORKER");
  const ownProjection = valueAt(settings, PROJECTION_KEYS);
  return {
    count:
      envCount !== undefined
        ? {
            value: workerCount(envCount),
            at: envPath("REACTOR_WORKERS"),
            fromEnv: true,
          }
        : {
            value:
              ownCount === undefined
                ? 0
                : ownCount === "auto"
                  ? Number.POSITIVE_INFINITY
                  : Number.isInteger(ownCount) && (ownCount as number) >= 0
                    ? (ownCount as number)
                    : undefined,
            at: settingAt(member, COUNT_KEYS),
            fromEnv: false,
          },
    projection:
      envProjection !== undefined
        ? {
            value: onOff(envProjection),
            at: envPath("REACTOR_PROJECTION_WORKER"),
            fromEnv: true,
          }
        : {
            value:
              ownProjection === undefined
                ? false
                : typeof ownProjection === "boolean"
                  ? ownProjection
                  : undefined,
            at: settingAt(member, PROJECTION_KEYS),
            fromEnv: false,
          },
  };
}

function workersRule(
  members: Member[],
  env: HostEnv,
  context: z.output<typeof hostRulesContextSchema>,
  report: Report,
): void {
  for (const member of members) {
    if (member.role !== "switchboard") continue;
    // A missing primary backend is reported once, as the placement.
    const unshared = !member.placementMissing && !sharedDb(member);
    const { count, projection } = workerSettings(member, env);
    if (count.value !== undefined && count.value > 0) {
      if (unshared) report("workers", count.at, REASONS.workersStorage);
      if (member.dev) report("workers", count.at, REASONS.workersDev);
      if (
        flagsOf(member, env).flags.authEnforcement &&
        context.renownSource === "self"
      ) {
        report("workers", count.at, REASONS.workersTrust);
      }
    }
    if (projection.value === true) {
      if (unshared) report("workers", projection.at, REASONS.projectionStorage);
      if (member.dev) report("workers", projection.at, REASONS.projectionDev);
    }
  }
}

/** `config.switchboard`: keys the runner refuses, and the values the builder writes. */
function configRule(members: Member[], env: HostEnv, report: Report): void {
  for (const member of members) {
    const settings = switchboardSettings(member);
    if (Object.keys(settings).length === 0) continue;
    if (member.role !== "switchboard") {
      report(
        "config",
        `${member.configAt}.switchboard`,
        REASONS.switchboardOnly,
      );
      continue;
    }
    for (const [pattern, reason] of SETTINGS_ELSEWHERE) {
      const keys = pattern.filter((part) => part !== "**");
      if (valueAt(settings, keys) !== undefined) {
        report("config", settingAt(member, keys), reason);
      }
    }
    const workflows = ["features", "workflows"];
    if (
      valueAt(settings, workflows) !== undefined &&
      member.reactor?.workflows !== undefined
    ) {
      report("config", settingAt(member, workflows), REASONS.workflowsTwice);
    }
    const { count, projection } = workerSettings(member, env);
    if (!count.fromEnv && count.value === undefined) {
      report("config", count.at, REASONS.workersValue);
    }
    if (!projection.fromEnv && projection.value === undefined) {
      report("config", projection.at, REASONS.projectionValue);
    }
  }
}

/** The switchboard's own folders when nothing names them. */
const DEFAULT_STORES = {
  reactor: ".ph/reactor-storage",
  readModel: ".ph/read-storage",
} as const;

/** The switchboard runner's port when the host names none. */
const DEFAULT_SWITCHBOARD_PORT = 4001;

type Store = {
  kind: "reactor" | "readModel";
  /** One spelling per place; see storeKey. */
  key: string;
  /** Where it is set, or the member when it is the default. */
  at: string;
  /** The controller's Postgres database. */
  controllerDb: boolean;
};

/**
 * One spelling per folder. `${userData}/x` and the project's `x` are taken as
 * one place, as they are under `ph run`; the controller moves the default
 * folders under user data, so either spelling may be the default there.
 */
function storeKey(value: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return value;
  const parts = value
    .split(/[/\\]+/)
    .filter((part) => part !== "" && part !== ".");
  if (parts[0] === "${userData}") parts.shift();
  return parts.join("/");
}

/** Where a switchboard keeps its documents and its search data, as it boots. */
function storesOf(member: Member, env: HostEnv): Store[] {
  const primary = member.placementMissing
    ? undefined
    : member.backends.find((backend) => backend.primary);
  const body = primary?.body ?? {};
  const storage = isRecord(body.storage) ? body.storage : {};
  const readModel = isRecord(body.readModel) ? body.readModel.url : undefined;
  const readModelAt = `${primary?.at}.readModel.url`;
  const dataDir =
    primary?.storage === "path"
      ? resolvedDataDir(env, storage.dataDir).value
      : undefined;
  let reactor: Store;
  if (primary?.storage === "postgres") {
    const url = typeof storage.url === "string" ? storage.url : undefined;
    reactor = {
      kind: "reactor",
      key: url ?? "postgres:controller",
      at: `${primary.at}.storage.kind`,
      controllerDb: url === undefined,
    };
  } else if (dataDir !== undefined) {
    reactor = {
      kind: "reactor",
      key: storeKey(dataDir),
      at: `${primary?.at}.storage.dataDir`,
      controllerDb: false,
    };
  } else if (typeof readModel === "string") {
    // Nothing names the store, so the reactor moves into the search data folder.
    reactor = {
      kind: "reactor",
      key: storeKey(readModel),
      at: readModelAt,
      controllerDb: false,
    };
  } else {
    reactor = {
      kind: "reactor",
      key: DEFAULT_STORES.reactor,
      at: member.path,
      controllerDb: false,
    };
  }
  const search: Store =
    typeof readModel === "string"
      ? {
          kind: "readModel",
          key: storeKey(readModel),
          at: readModelAt,
          controllerDb: false,
        }
      : {
          kind: "readModel",
          key: DEFAULT_STORES.readModel,
          at: member.path,
          controllerDb: false,
        };
  return [reactor, search];
}

function storeMessage(member: Member, other: Member, store: Store): string {
  if (store.controllerDb) {
    return `${member.key} and ${other.key} would both keep their data in the controller's Postgres database, so each would change the other's documents. Only one switchboard in a host can use it.`;
  }
  return store.kind === "reactor"
    ? `${member.key} and ${other.key} would keep their data in the same folder, which corrupts both. Give ${member.key} its own storage folder.`
    : `${member.key} and ${other.key} would keep their search data in the same folder, which corrupts both. Give ${member.key} its own search data folder.`;
}

function portOf(member: Member): number | undefined {
  const port = member.runner.port;
  if (typeof port === "number") return port;
  return member.role === "switchboard" ? DEFAULT_SWITCHBOARD_PORT : undefined;
}

/** Each switchboard needs its own store, search data folder and port. */
function storesRule(members: Member[], env: HostEnv, report: Report): void {
  const switchboards = members.filter(
    (member) => member.role === "switchboard",
  );
  const claims = new Map<string, Member>();
  const sharedBlock = new Set<Member>();
  for (const member of switchboards) {
    const twin = switchboards.find(
      (other) =>
        other !== member &&
        other.reactorAt === member.reactorAt &&
        switchboards.indexOf(other) < switchboards.indexOf(member),
    );
    if (twin) {
      sharedBlock.add(member);
      report(
        "storage",
        member.path,
        `${member.key} and ${twin.key} share one set of reactor settings, so they would keep their data in the same place, which corrupts both. Give ${member.key} its own reactor settings.`,
      );
    }
    for (const store of storesOf(member, env)) {
      const other = claims.get(store.key);
      if (!other) {
        claims.set(store.key, member);
        continue;
      }
      if (other === member || sharedBlock.has(member)) continue;
      report(
        "storage",
        store.at,
        storeMessage(member, other, store),
        store.controllerDb ? undefined : store.key,
      );
    }
  }
  const ports = new Map<number, Member>();
  for (const member of members) {
    const port = portOf(member);
    if (port === undefined || port === 0) continue;
    const other = ports.get(port);
    if (!other) {
      ports.set(port, member);
      continue;
    }
    if (member.role !== "switchboard" && other.role !== "switchboard") continue;
    report(
      "port",
      `${member.path}.runner.port`,
      `${member.key} and ${other.key} would both use port ${port}. Give ${member.key} its own port.`,
    );
  }
}

/** Every rule over a draft host; all issues, never the first only. */
export function validateDraft(
  draft: HostDraft,
  contextInput: HostRulesContext,
): Validation {
  const context = hostRulesContextSchema.parse(contextInput);
  const members = membersOf(draft, context);
  const env = draft.env ?? {};
  const issues: HostRuleIssue[] = [];
  const seen = new Set<string>();
  const report: Report = (rule, path, message, hint) => {
    const id = `${path}\0${message}`;
    if (seen.has(id)) return;
    seen.add(id);
    const file = fileOf(draft.envelope, path);
    issues.push({
      rule,
      path,
      message,
      ...(file === undefined ? {} : { file }),
      ...(hint === undefined ? {} : { hint }),
    });
  };
  envRule(env, members, report);
  shapeRule(draft.envelope, report);
  protocolRule(members, env, report);
  ladderRule(members, env, report);
  storageRule(members, env, context, report);
  storesRule(members, env, report);
  configRule(members, env, report);
  workersRule(members, env, context, report);
  const byPath: Record<string, HostRuleIssue[]> = {};
  for (const issue of issues) (byPath[issue.path] ??= []).push(issue);
  return { members, issues, byPath };
}
