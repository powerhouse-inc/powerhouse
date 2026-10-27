import type { HostExport } from "@powerhousedao/host-core/schema";
import {
  attachMode,
  isDelete,
  type Attach,
  type AttachMode,
  type Axis,
  type AxisValue,
  type Capabilities,
  type Combo,
  type MatrixIssue,
  type Requirement,
} from "./schema.js";

/** Mirrors reactor's FLAG_PREREQUISITES (pinned by a test). */
export const FLAG_PREREQUISITES = {
  documentDecisions: [],
  authEnforcement: ["documentDecisions"],
  authGroups: ["authEnforcement"],
  authConditions: ["authGroups"],
} as const satisfies Record<string, readonly string[]>;
export type FeatureFlag = keyof typeof FLAG_PREREQUISITES;

/** The ladder's rungs, bottom up: each turns on one more flag. */
export const LADDER: readonly FeatureFlag[] = [
  "documentDecisions",
  "authEnforcement",
  "authGroups",
  "authConditions",
];

export const STORAGE_KINDS: Record<AttachMode, readonly string[]> = {
  browser: ["idb", "memory"],
  controller: ["path", "memory", "postgres"],
};

const SWITCHBOARD_RUNNER = "/runners/switchboard";

const MODE_LABEL: Record<AttachMode, string> = {
  browser: "browser-provisioned",
  controller: "controller-spawned",
};

export const NEEDS_POSTGRES =
  "needs a Postgres server; set PH_MONITOR_PG_URL on the controller";

export type Selected = { axis: Axis; value: AxisValue };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function overlaps(a: string, b: string): boolean {
  const shorter = a.length <= b.length ? a : b;
  const longer = shorter === a ? b : a;
  return longer === shorter || longer.startsWith(`${shorter}.`);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Two axes that touch one path, env key, attach or expectation differently. */
export function conflicts(selected: readonly Selected[]): MatrixIssue[] {
  const issues: MatrixIssue[] = [];
  const conflict = (path: string, a: Selected, b: Selected, what: string) =>
    issues.push({
      stage: "conflict",
      path,
      message: `${a.axis.key}=${a.value.key} and ${b.axis.key}=${b.value.key} both set ${what}`,
      axis: b.axis.key,
      value: b.value.key,
    });
  selected.forEach((a, i) => {
    for (const b of selected.slice(i + 1)) {
      for (const sa of a.value.setters) {
        for (const sb of b.value.setters) {
          if (!overlaps(sa.path, sb.path)) continue;
          const same =
            sa.path === sb.path && canonical(sa.value) === canonical(sb.value);
          if (!same) {
            conflict(
              sb.path,
              a,
              b,
              sa.path === sb.path ? sa.path : `${sa.path} and ${sb.path}`,
            );
          }
        }
      }
      for (const [key, value] of Object.entries(b.value.env)) {
        if (Object.hasOwn(a.value.env, key) && a.value.env[key] !== value) {
          conflict(`env.${key}`, a, b, `env ${key}`);
        }
      }
      if (
        a.value.attach &&
        b.value.attach &&
        a.value.attach !== b.value.attach
      ) {
        conflict("attach", a, b, "attach");
      }
      const ea = a.value.expect.storageEngine;
      const eb = b.value.expect.storageEngine;
      if (ea && eb && ea !== eb) {
        conflict("expect.storageEngine", a, b, "expect.storageEngine");
      }
    }
  });
  return issues;
}

type ReactorSite = {
  /** Envelope path of the reactor block. */
  at: string;
  reactor: Record<string, unknown>;
  switchboard: boolean;
};

function runnerModule(body: unknown): string | undefined {
  if (!isRecord(body) || !isRecord(body.runner)) return undefined;
  return typeof body.runner.module === "string"
    ? body.runner.module
    : undefined;
}

/** Every reactor block in the envelope, standalone and member-wrapper alike. */
export function reactorSites(envelope: HostExport): ReactorSite[] {
  const members = isRecord(envelope.members) ? envelope.members : {};
  const bodies: [string, unknown][] = [
    ["host", envelope.host],
    ...Object.entries(members).map(([folder, body]): [string, unknown] => [
      `members.${folder}`,
      body,
    ]),
  ];
  const sites: ReactorSite[] = [];
  for (const [at, body] of bodies) {
    if (!isRecord(body)) continue;
    const module = runnerModule(body);
    if (isRecord(body.reactor)) {
      sites.push({
        at: `${at}.reactor`,
        reactor: body.reactor,
        switchboard: module?.endsWith(SWITCHBOARD_RUNNER) ?? false,
      });
    }
    if (!isRecord(body.children)) continue;
    for (const [key, wrapper] of Object.entries(body.children)) {
      if (!isRecord(wrapper) || !isRecord(wrapper.reactor)) continue;
      const own = isRecord(wrapper.runner) ? wrapper.runner.module : undefined;
      const folder = typeof wrapper.host === "string" ? wrapper.host : "";
      const effective =
        typeof own === "string"
          ? own
          : Object.hasOwn(members, folder)
            ? runnerModule(members[folder])
            : undefined;
      sites.push({
        at: `${at}.children.${key}.reactor`,
        reactor: wrapper.reactor,
        switchboard: effective?.endsWith(SWITCHBOARD_RUNNER) ?? false,
      });
    }
  }
  return sites;
}

/** A flag on without its prerequisite fails the reactor build. */
export function ladderCombos(envelope: HostExport): Combo[] {
  const combos: Combo[] = [];
  for (const site of reactorSites(envelope)) {
    const protocol = site.reactor.protocol;
    const flags = isRecord(protocol) ? protocol.featureFlags : undefined;
    if (!isRecord(flags)) continue;
    for (const [flag, prerequisites] of Object.entries(FLAG_PREREQUISITES)) {
      if (flags[flag] !== true) continue;
      const missing = prerequisites.filter((p: string) => flags[p] !== true);
      if (missing.length === 0) continue;
      combos.push({
        rule: "ladder",
        path: `${site.at}.protocol.featureFlags.${flag}`,
        message: `${flag} requires ${missing.join(", ")}`,
      });
    }
  }
  return combos;
}

function localBackends(
  reactor: Record<string, unknown>,
): [name: string, backend: Record<string, unknown>][] {
  if (!isRecord(reactor.backends)) return [];
  return Object.entries(reactor.backends).flatMap(
    ([name, backend]): [string, Record<string, unknown>][] =>
      isRecord(backend) && backend.kind !== "remote" ? [[name, backend]] : [],
  );
}

function storageKind(backend: Record<string, unknown>): string | undefined {
  return isRecord(backend.storage) && typeof backend.storage.kind === "string"
    ? backend.storage.kind
    : undefined;
}

/** Storage kinds per attach mode; controller cells constrain switchboards only. */
export function storageModeCombos(
  envelope: HostExport,
  attach: Attach,
): Combo[] {
  const mode = attachMode(attach);
  const allowed = STORAGE_KINDS[mode];
  const combos: Combo[] = [];
  for (const site of reactorSites(envelope)) {
    if (mode === "controller" && !site.switchboard) continue;
    for (const [name, backend] of localBackends(site.reactor)) {
      const kind = storageKind(backend);
      if (kind === undefined || allowed.includes(kind)) continue;
      combos.push({
        rule: "storage-mode",
        path: `${site.at}.backends.${name}.storage.kind`,
        message: `storage "${kind}" is not offered for ${MODE_LABEL[mode]} cells (${allowed.join(" | ")})`,
      });
    }
  }
  return combos;
}

/** Explicit `requires`, plus postgres storage on a spawned switchboard. */
export function requirements(
  envelope: HostExport,
  selected: readonly Selected[],
  attach: Attach,
): Requirement[] {
  const found = new Set<Requirement>(
    selected.flatMap(({ value }) => value.requires),
  );
  if (attachMode(attach) === "controller") {
    for (const site of reactorSites(envelope)) {
      if (!site.switchboard) continue;
      for (const [, backend] of localBackends(site.reactor)) {
        if (storageKind(backend) === "postgres") found.add("postgres");
      }
    }
  }
  return [...found];
}

export function capabilityIssues(
  requires: readonly Requirement[],
  capabilities: Capabilities,
): MatrixIssue[] {
  return requires.includes("postgres") && !capabilities.postgres
    ? [{ stage: "capability", path: "", message: NEEDS_POSTGRES }]
    : [];
}

function setsStorageKind(value: AxisValue, kind: string): boolean {
  return value.setters.some(
    (setter) =>
      !isDelete(setter.value) &&
      setter.path.endsWith(".storage.kind") &&
      setter.value === kind,
  );
}

/** Whether the editor should offer a value, and why not. */
export function valueAvailability(
  value: AxisValue,
  capabilities: Capabilities,
  attach: Attach,
): { available: true } | { available: false; reason: string } {
  const needsPostgres =
    value.requires.includes("postgres") || setsStorageKind(value, "postgres");
  if (needsPostgres && !capabilities.postgres) {
    return { available: false, reason: NEEDS_POSTGRES };
  }
  const mode = attachMode(value.attach ?? attach);
  const kinds = ["idb", "memory", "path", "postgres"];
  for (const kind of kinds) {
    if (STORAGE_KINDS[mode].includes(kind) || !setsStorageKind(value, kind)) {
      continue;
    }
    return {
      available: false,
      reason: `storage "${kind}" is not offered for ${MODE_LABEL[mode]} cells`,
    };
  }
  return { available: true };
}
