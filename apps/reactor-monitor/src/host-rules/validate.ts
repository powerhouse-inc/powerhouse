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
  FLAG_LABELS,
  ladderGaps,
  LADDER,
  type FeatureFlag,
} from "./flags.js";
import { fileOf, isRecord, membersOf, type Member } from "./members.js";
import { checkEnvKey } from "./policy.js";
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
  projectionDev:
    "Turn off hot reload to use a separate thread for search data.",
  projectionStorage:
    "A separate thread for search data needs Postgres storage. The built-in database can't be shared between threads.",
} as const;

export type Validation = {
  members: Member[];
  issues: HostRuleIssue[];
  /** The same issues, grouped by path. */
  byPath: Record<string, HostRuleIssue[]>;
};

type Report = (rule: RuleName, path: string, message: string) => void;

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

function shapeRule(envelope: HostExport, report: Report): void {
  for (const issue of parseHostExport(JSON.stringify(envelope)).issues) {
    report(
      "shape",
      envelopePath(envelope, issue.file, issue.path),
      issue.message,
    );
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
          issue.message ?? "Invalid start order.",
        ),
    } as unknown as z.RefinementCtx;
    refineStartOrder({ children: body.children, config }, ctx);
  }
}

function envRule(draft: HostDraft, members: Member[], report: Report): void {
  const paths = new Set(members.map((member) => member.path));
  for (const path of Object.keys(draft.env ?? {})) {
    if (!paths.has(path)) {
      report(
        "env",
        `${path}.env`,
        `There is no reactor at ${path}, so its environment is not used.`,
      );
    }
  }
  for (const member of members) {
    for (const key of Object.keys(member.env)) {
      const verdict = checkEnvKey(key);
      if (!verdict.ok) report("env", envPath(member, key), verdict.reason);
    }
    const workers = envValue(member, "REACTOR_WORKERS");
    if (workers !== undefined && workerCount(workers) === undefined) {
      report("env", envPath(member, "REACTOR_WORKERS"), REASONS.workersValue);
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

function storageRule(
  members: Member[],
  context: z.output<typeof hostRulesContextSchema>,
  report: Report,
): void {
  for (const member of members) {
    if (member.role === "switchboard" && !context.controller) {
      report("capability", member.path, REASONS.noController);
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
            `Storage "${kind}" isn't available here.`,
        );
        continue;
      }
      if (backend.mode !== "controller" || kind !== "postgres") continue;
      const storage = isRecord(backend.body.storage)
        ? backend.body.storage
        : {};
      if (storage.url !== undefined)
        report("postgres", `${at}.url`, REASONS.postgresUrl);
      if (!context.postgres)
        report("capability", `${at}.kind`, REASONS.noPostgres);
    }
  }
}

/** REACTOR_WORKERS as the switchboard reads it; auto counts as on. */
export function workerCount(raw: string): number | undefined {
  const value = raw.trim();
  if (value === "") return 0;
  if (value.toLowerCase() === "auto") return Number.POSITIVE_INFINITY;
  return /^\d+$/.test(value) ? Number(value) : undefined;
}

const TRUTHY = new Set(["1", "true", "on", "yes"]);

function isPostgresUrl(url: string): boolean {
  return url.startsWith("postgres");
}

/** Why the switchboard's reactor database can't be shared, if it can't. */
function sharedDbProblem(member: Member): "storage" | "readModel" | undefined {
  const primary = member.backends.find((backend) => backend.primary);
  if (primary?.storage !== "postgres") return "storage";
  const readModel = isRecord(primary.body.readModel)
    ? primary.body.readModel.url
    : undefined;
  if (typeof readModel === "string" && !isPostgresUrl(readModel)) {
    return "readModel";
  }
  return undefined;
}

function workersRule(
  members: Member[],
  context: z.output<typeof hostRulesContextSchema>,
  report: Report,
): void {
  for (const member of members) {
    if (member.role !== "switchboard") continue;
    const count = workerCount(envValue(member, "REACTOR_WORKERS") ?? "");
    const db = sharedDbProblem(member);
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
    const projection = envValue(member, "REACTOR_PROJECTION_WORKER");
    if (
      projection !== undefined &&
      TRUTHY.has(projection.trim().toLowerCase())
    ) {
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
  const report: Report = (rule, path, message) => {
    const id = `${path}\0${message}`;
    if (seen.has(id)) return;
    seen.add(id);
    issues.push({ rule, path, message, file: fileOf(draft.envelope, path) });
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
