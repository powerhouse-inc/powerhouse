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
  type Member,
} from "./members.js";
import { checkEnvKey, FOLDER_REASONS, isContainedPath } from "./policy.js";
import {
  hostRulesContextSchema,
  type HostDraft,
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
  workersReadModel:
    "Background workers need the search and list data in Postgres too. Clear its folder so it uses the same database.",
  workersValue: "Background workers must be a whole number or auto.",
  workersNotSwitchboard: "Only a switchboard runs background workers.",
  projectionDev:
    "Turn off hot reload to use a separate thread for search data.",
  projectionStorage:
    "A separate thread for search data needs Postgres storage. The built-in database can't be shared between threads.",
  projectionValue: "Turn the separate thread for search data on or off.",
  projectionNotSwitchboard:
    "Only a switchboard has a separate thread for search data.",
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

function envValue(member: Member, key: string): string | undefined {
  return Object.hasOwn(member.env, key) ? member.env[key] : undefined;
}

function envPath(member: Member, key: string): string {
  return `${member.path}.env.${key}`;
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

function envRule(draft: HostDraft, members: Member[], report: Report): void {
  const paths = new Set(members.map((member) => member.path));
  for (const path of Object.keys(draft.env ?? {})) {
    if (!paths.has(path)) {
      report(
        "env",
        `${path}.env`,
        "There is no reactor here, so this environment is not used.",
        path,
      );
    }
  }
  for (const member of members) {
    for (const key of Object.keys(member.env)) {
      const verdict = checkEnvKey(key);
      if (!verdict.ok) report("env", envPath(member, key), verdict.reason);
    }
    const workers = envValue(member, "REACTOR_WORKERS");
    const projection = envValue(member, "REACTOR_PROJECTION_WORKER");
    if (member.role !== "switchboard") {
      if (workers !== undefined) {
        report(
          "env",
          envPath(member, "REACTOR_WORKERS"),
          REASONS.workersNotSwitchboard,
        );
      }
      if (projection !== undefined) {
        report(
          "env",
          envPath(member, "REACTOR_PROJECTION_WORKER"),
          REASONS.projectionNotSwitchboard,
        );
      }
      for (const key of Object.keys(member.env)) {
        if (!PROTOCOL_ENV.has(key)) continue;
        report(
          "env",
          envPath(member, key),
          `${member.key} doesn't read this; it takes it from the host's settings.`,
          key,
        );
      }
      continue;
    }
    if (workers !== undefined && workerCount(workers) === undefined) {
      report("env", envPath(member, "REACTOR_WORKERS"), REASONS.workersValue);
    }
    if (projection !== undefined && onOff(projection) === undefined) {
      report(
        "env",
        envPath(member, "REACTOR_PROJECTION_WORKER"),
        REASONS.projectionValue,
        "1, true, on, yes, 0, false, off, no",
      );
    }
  }
}

function flagsOf(member: Member) {
  return effectiveFlags(
    member.reactor?.protocol,
    member.role === "switchboard" ? member.env : {},
  );
}

function declaredFlags(member: Member): string {
  return LADDER.map((flag) =>
    String(effectiveFlags(member.reactor?.protocol).flags[flag]),
  ).join(",");
}

/** One access-control setting for the whole host; env cannot bend it. */
function protocolRule(members: Member[], report: Report): void {
  if (members.length > 0) {
    const first = members[0];
    for (const member of members.slice(1)) {
      if (declaredFlags(member) === declaredFlags(first)) continue;
      report(
        "protocol",
        `${member.reactorAt}.protocol.featureFlags`,
        `Access control has to be the same for every reactor in the host, but ${member.key} differs from ${first.key}.`,
      );
    }
  }
  for (const member of members) {
    if (member.role !== "switchboard") continue;
    const host = protocolEnv(
      member.reactor?.protocol as ReactorProtocol | undefined,
    );
    for (const [key, hostValue] of Object.entries(host)) {
      const value = envValue(member, key);
      if (value === undefined || value === hostValue) continue;
      report(
        "protocol",
        envPath(member, key),
        `${key}=${value} disagrees with the host's setting (${hostValue}), so ${member.key} won't start.`,
      );
    }
  }
}

function label(flags: readonly FeatureFlag[]): string {
  return flags.map((flag) => FLAG_LABELS[flag]).join(" and ");
}

function ladderRule(members: Member[], report: Report): void {
  for (const member of members) {
    const { flags, fromEnv } = flagsOf(member);
    for (const gap of ladderGaps(flags)) {
      const key = fromEnv[gap.flag];
      report(
        "ladder",
        key
          ? envPath(member, key)
          : `${member.reactorAt}.protocol.featureFlags.${gap.flag}`,
        `${FLAG_LABELS[gap.flag]} needs ${label(gap.missing)} turned on, or ${member.key} won't start.`,
      );
    }
  }
}

const DEFAULT_STORE = ".ph/reactor-storage";

/** The folder a switchboard's own store lands in, if it is a known folder. */
function storeFolder(member: Member): string | undefined {
  const primary = member.backends.find((backend) => backend.primary);
  if (primary && primary.storage !== undefined && primary.storage !== "path") {
    return undefined;
  }
  const storage =
    primary && isRecord(primary.body.storage) ? primary.body.storage : {};
  const dir = storage.dataDir;
  if (dir === undefined) return DEFAULT_STORE;
  return typeof dir === "string"
    ? dir.replace(/^\.\//, "").replace(/\/+$/, "")
    : undefined;
}

function storageRule(
  members: Member[],
  context: z.output<typeof hostRulesContextSchema>,
  report: Report,
): void {
  const switchboards = members.filter(
    (member) => member.role === "switchboard",
  );
  switchboards.forEach((member, index) => {
    const earlier = switchboards.slice(0, index);
    const sharesBlock = earlier.find(
      (other) => other.reactorAt === member.reactorAt,
    );
    if (sharesBlock) {
      report(
        "storage",
        member.path,
        `${member.key} and ${sharesBlock.key} share one set of reactor settings, so they would use the same database. Give ${member.key} its own.`,
        member.reactorAt,
      );
      return;
    }
    const folder = storeFolder(member);
    const sharesFolder = earlier.find(
      (other) => folder !== undefined && storeFolder(other) === folder,
    );
    if (sharesFolder) {
      report(
        "storage",
        member.path,
        `${member.key} and ${sharesFolder.key} would store in the same folder, which corrupts both. Give ${member.key} its own folder.`,
        folder,
      );
    }
  });
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
      if (
        typeof storage.dataDir === "string" &&
        !isContainedPath(storage.dataDir)
      ) {
        report(
          "storage",
          `${at}.dataDir`,
          FOLDER_REASONS.dataDir,
          storage.dataDir,
        );
      }
      if (typeof readModel === "string" && !isContainedPath(readModel)) {
        report(
          "storage",
          `${backend.at}.readModel.url`,
          FOLDER_REASONS.readModel,
          readModel,
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

/** Why the switchboard's reactor database can't be shared, if it can't. */
function sharedDbProblem(member: Member): "storage" | "readModel" | undefined {
  const primary = member.backends.find((backend) => backend.primary);
  if (primary?.storage !== "postgres") return "storage";
  // A readModel.url is the dbPath the switchboard prefers, and it is a folder.
  const readModel = isRecord(primary.body.readModel)
    ? primary.body.readModel.url
    : undefined;
  return typeof readModel === "string" ? "readModel" : undefined;
}

function workersRule(
  members: Member[],
  context: z.output<typeof hostRulesContextSchema>,
  report: Report,
): void {
  for (const member of members) {
    if (member.role !== "switchboard") continue;
    // A missing primary backend is reported once, as the placement.
    const db = member.placementMissing ? undefined : sharedDbProblem(member);
    const count = workerCount(envValue(member, "REACTOR_WORKERS") ?? "");
    if (count !== undefined && count > 0) {
      const path = envPath(member, "REACTOR_WORKERS");
      if (db === "storage") report("workers", path, REASONS.workersStorage);
      if (db === "readModel") report("workers", path, REASONS.workersReadModel);
      if (member.dev) report("workers", path, REASONS.workersDev);
      if (
        flagsOf(member).flags.authEnforcement &&
        context.renownSource === "self"
      ) {
        report("workers", path, REASONS.workersTrust);
      }
    }
    if (onOff(envValue(member, "REACTOR_PROJECTION_WORKER")) === true) {
      const path = envPath(member, "REACTOR_PROJECTION_WORKER");
      if (db) report("workers", path, REASONS.projectionStorage);
      if (member.dev) report("workers", path, REASONS.projectionDev);
    }
  }
}

/** Every rule over a draft host; all issues, never the first only. */
export function validateDraft(
  draft: HostDraft,
  contextInput: HostRulesContext,
): Validation {
  const context = hostRulesContextSchema.parse(contextInput);
  const members = membersOf(draft, context);
  const issues: HostRuleIssue[] = [];
  const seen = new Set<string>();
  const report: Report = (rule, path, message, hint) => {
    const id = `${path}\0${message}`;
    if (seen.has(id)) return;
    seen.add(id);
    issues.push({
      rule,
      path,
      message,
      file: fileOf(draft.envelope, path),
      ...(hint === undefined ? {} : { hint }),
    });
  };
  envRule(draft, members, report);
  shapeRule(draft.envelope, report);
  protocolRule(members, report);
  ladderRule(members, report);
  storageRule(members, context, report);
  workersRule(members, context, report);
  const byPath: Record<string, HostRuleIssue[]> = {};
  for (const issue of issues) (byPath[issue.path] ??= []).push(issue);
  return { members, issues, byPath };
}
