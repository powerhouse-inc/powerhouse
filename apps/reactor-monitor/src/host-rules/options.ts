import type { HostExport } from "@powerhousedao/host-core/schema";
import { effectiveFlags, FLAG_LABELS, LADDER, ladderFlags } from "./flags.js";
import {
  freshKey,
  hostVerb,
  isRecord,
  membersOf,
  type Member,
} from "./members.js";
import { checkSetter } from "./policy.js";
import {
  addDriveOption,
  connectReach,
  connectReaches,
  placedOn,
  placementSaveOption,
  placementSelected,
  REACH_REASONS,
  reachOptions,
} from "./reach.js";
import {
  ROUTER_REASONS,
  routerOptions,
  routerOptionSelected,
  type RouterGroup,
} from "./router-settings.js";
import {
  hostRulesContextSchema,
  type HostDraft,
  type HostEnv,
  type HostRuleIssue,
  type HostRulesContext,
  type Setter,
} from "./schema.js";
import { applySetters } from "./setters.js";
import {
  REASONS,
  validateDraft,
  workerSettings,
  type Validation,
} from "./validate.js";
import type { z } from "zod";

export type OptionGroup =
  | "access"
  | "storage"
  | "backendKind"
  | "hotReload"
  | "workers"
  | "projectionWorker"
  | "add"
  | "reach"
  | "placement"
  | RouterGroup;

export type HostOption = {
  /** Unique per draft: `<member path or host>:<group>:[<backend>:]<value>`. */
  id: string;
  group: OptionGroup;
  value: string;
  label: string;
  member?: string;
  /** Envelope path of the backend the option changes. */
  backend?: string;
  /** The drive slug a reach or placement option is about. */
  drive?: string;
  setters: Setter[];
  /** Why it can't be offered, known without trying it. */
  blocked?: string;
};

export type OptionStatus = HostOption & {
  selected: boolean;
  enabled: boolean;
  /** Why it is disabled: a sentence about what would happen. */
  reason?: string;
};

const DELETE = { $delete: true } as const;

export const WORKER_COUNTS = [0, 2, 4, 8] as const;

const STORAGE_LABELS: Record<string, string> = {
  path: "Folder on disk",
  memory: "In memory",
  postgres: "Postgres",
  idb: "Browser storage",
};

export const ADD_REASONS = {
  single:
    "This host runs one reactor. Make it a host with several reactors to add more.",
  owner:
    "Add a switchboard or Connect first. An in-browser reactor is saved with one of them.",
  noSwitchboard: "This project has no switchboard to add.",
  noConnect: "This project has no Connect to add.",
} as const;

export const SETTING_REASONS = {
  fromEnv:
    "The host's environment sets this for every switchboard, which overrides each one's own choice. Remove it from the environment to choose here.",
} as const;

export const HOT_RELOAD_REASONS = {
  hostWide:
    "The whole host runs with hot reload. Start it with run instead of dev to turn it off here.",
  workers: "Background workers can't run with hot reload. Turn them off first.",
  projection:
    "The separate thread for search data can't run with hot reload. Turn it off first.",
} as const;

function accessOptions(members: Member[]): HostOption[] {
  const sites = [...new Set(members.map((member) => member.reactorAt))];
  return [0, 1, 2, 3, 4].map((level) => ({
    id: `host:access:${level}`,
    group: "access",
    value: String(level),
    label:
      level === 0
        ? "Off"
        : LADDER.slice(0, level)
            .map((flag) => FLAG_LABELS[flag])
            .join(", "),
    setters: sites.map((at) => ({
      path: `${at}.protocol.featureFlags`,
      value: ladderFlags(level),
    })),
  }));
}

function storageSetters(
  at: string,
  kind: string,
  create: string | undefined,
): Setter[] {
  const setters: Setter[] = [];
  if (create) setters.push({ path: `${at}.kind`, value: create });
  setters.push({ path: `${at}.storage.kind`, value: kind });
  if (kind !== "path") {
    setters.push({ path: `${at}.storage.dataDir`, value: DELETE });
  }
  setters.push({ path: `${at}.storage.url`, value: DELETE });
  return setters;
}

function switchboardOptions(member: Member): HostOption[] {
  const options: HostOption[] = [];
  const primary = member.backends.find((backend) => backend.primary);
  const name = primary?.name ?? "main";
  const at = primary?.at ?? `${member.reactorAt}.backends.main`;
  for (const kind of ["path", "memory", "postgres"]) {
    options.push({
      id: `${member.path}:storage:${name}:${kind}`,
      group: "storage",
      value: kind,
      label: STORAGE_LABELS[kind],
      member: member.path,
      backend: at,
      setters: storageSetters(at, kind, primary ? undefined : "in-process"),
    });
  }
  for (const on of [false, true]) {
    options.push({
      id: `${member.path}:hotReload:${on ? "on" : "off"}`,
      group: "hotReload",
      value: on ? "on" : "off",
      label: on ? "On" : "Off",
      member: member.path,
      // false, not a delete: the wrapper's runner key-merges over the folder's.
      setters: [{ path: `${member.path}.runner.dev`, value: on }],
    });
  }
  return options;
}

function withValue(
  record: Record<string, unknown>,
  [key, ...rest]: readonly string[],
  value: unknown,
): Record<string, unknown> {
  const next = { ...record };
  if (rest.length === 0) next[key] = value;
  else {
    const child = next[key];
    next[key] = withValue(isRecord(child) ? child : {}, rest, value);
  }
  return next;
}

/**
 * Writes one of a switchboard's own settings. When another member reads the
 * same config, the change goes to this member's wrapper, which then holds a
 * full copy: a wrapper's config replaces the folder's.
 */
function settingSetters(
  member: Member,
  members: Member[],
  keys: readonly string[],
  value: Setter["value"],
): Setter[] {
  const shared = members.some(
    (other) => other !== member && other.configAt === member.configAt,
  );
  if (!shared || !member.path.startsWith("host.children.")) {
    return [
      { path: `${member.configAt}.switchboard.${keys.join(".")}`, value },
    ];
  }
  const config = structuredClone(member.config ?? {});
  return [
    {
      path: `${member.path}.config`,
      value: withValue(config, ["switchboard", ...keys], value) as never,
    },
  ];
}

/** Background workers and the search thread, in each switchboard's own settings. */
function workerOptions(member: Member, members: Member[]): HostOption[] {
  const options: HostOption[] = WORKER_COUNTS.map((count) => ({
    id: `${member.path}:workers:${count}`,
    group: "workers",
    value: String(count),
    label: count === 0 ? "Off" : String(count),
    member: member.path,
    setters: settingSetters(
      member,
      members,
      ["workers", "executor", "count"],
      count,
    ),
  }));
  for (const on of [false, true]) {
    options.push({
      id: `${member.path}:projectionWorker:${on ? "on" : "off"}`,
      group: "projectionWorker",
      value: on ? "on" : "off",
      label: on ? "On" : "Off",
      member: member.path,
      setters: settingSetters(
        member,
        members,
        ["workers", "projection", "enabled"],
        on,
      ),
    });
  }
  return options;
}

function memberOptions(member: Member, members: Member[]): HostOption[] {
  const options =
    member.role === "switchboard"
      ? [...switchboardOptions(member), ...workerOptions(member, members)]
      : [];
  for (const backend of member.backends) {
    if (backend.mode !== "browser") continue;
    const prefix = `${member.path}:storage:${backend.name}`;
    for (const kind of ["idb", "memory", "path", "postgres"]) {
      options.push({
        id: `${prefix}:${kind}`,
        group: "storage",
        value: kind,
        label: STORAGE_LABELS[kind],
        member: member.path,
        backend: backend.at,
        setters: storageSetters(backend.at, kind, undefined),
      });
    }
    for (const kind of ["in-process", "worker"]) {
      options.push({
        id: `${member.path}:backendKind:${backend.name}:${kind}`,
        group: "backendKind",
        value: kind,
        label: kind === "worker" ? "In a background worker" : "In the page",
        member: member.path,
        backend: backend.at,
        setters: [{ path: `${backend.at}.kind`, value: kind }],
      });
    }
  }
  return options;
}

/** The first member folder run by this kind of runner, if the project has one. */
function folderFor(envelope: HostExport, role: "switchboard" | "connect") {
  const members = isRecord(envelope.members) ? envelope.members : {};
  const suffix =
    role === "switchboard" ? "/runners/switchboard" : "/runners/connect";
  return Object.keys(members).find((folder) => {
    const body = members[folder];
    if (!isRecord(body) || isRecord(body.children)) return false;
    const runner: Record<string, unknown> = isRecord(body.runner)
      ? body.runner
      : {};
    return typeof runner.module === "string" && runner.module.endsWith(suffix);
  });
}

/** Access control as the host already has it (BUILDER decision 2). */
function hostProtocol(members: Member[]): Record<string, unknown> {
  const protocol = members[0]?.reactor?.protocol;
  return isRecord(protocol)
    ? structuredClone(protocol)
    : { featureFlags: effectiveFlags(undefined).flags };
}

/**
 * A new child. A second Connect of one folder gets its own reactor block; a
 * second switchboard gets its own block, folders and port.
 */
function addMemberOption(
  draft: HostDraft,
  members: Member[],
  role: "switchboard" | "connect",
): HostOption {
  const option: HostOption = {
    id: `host:add:${role}`,
    group: "add",
    value: role,
    label: role === "switchboard" ? "Switchboard" : "Connect",
    setters: [],
  };
  const host = draft.envelope.host as unknown;
  const folder = folderFor(draft.envelope, role);
  if (!isRecord(host) || !isRecord(host.children) || folder === undefined) {
    return option;
  }
  const key = freshKey(Object.keys(host.children), role);
  const wrapper: Record<string, unknown> = { host: folder };
  if (
    role === "connect" &&
    members.some((member) => member.folder === folder)
  ) {
    wrapper.reactor = {
      protocol: hostProtocol(members),
      backends: { main: { kind: "worker", storage: { kind: "idb" } } },
    };
  }
  if (
    role === "switchboard" &&
    members.some((member) => member.role === "switchboard")
  ) {
    wrapper.runner = { port: 0 };
    wrapper.reactor = {
      protocol: hostProtocol(members),
      backends: {
        main: {
          kind: "in-process",
          storage: { kind: "path", dataDir: `.ph/${key}/reactor-storage` },
          readModel: { url: `.ph/${key}/read-storage` },
        },
      },
    };
  }
  option.setters = [{ path: `host.children.${key}`, value: wrapper as never }];
  return option;
}

/**
 * A browser reactor saved beside a Connect that keeps none, else beside the
 * first switchboard: Connect runs one reactor in the browser.
 */
function addBrowserOption(members: Member[]): HostOption {
  const option: HostOption = {
    id: "host:add:browser",
    group: "add",
    value: "browser",
    label: "Reactor in the browser",
    setters: [],
  };
  const reaches = connectReaches(members);
  const owner =
    reaches.find((reach) => reach.local.length === 0)?.member ??
    members.find((member) => member.role === "switchboard");
  if (!owner) {
    if (reaches.length > 0) option.blocked = REACH_REASONS.oneLocal;
    return option;
  }
  const taken = owner.backends.map((backend) => backend.name);
  const at = `${owner.reactorAt}.backends`;
  // A switchboard without backends would take the new one as its own store.
  if (owner.role === "switchboard" && taken.length === 0) {
    option.setters.push({ path: `${at}.main`, value: { kind: "in-process" } });
    taken.push("main");
  }
  option.setters.push({
    path: `${at}.${freshKey(taken, "tab")}`,
    value: { kind: "in-process", storage: { kind: "memory" } },
  });
  return option;
}

/** Every option the builder can offer for this draft, not yet judged. */
export function hostOptionList(
  draft: HostDraft,
  context: Pick<HostRulesContext, "verb"> = {},
): HostOption[] {
  const members = membersOf(draft, context);
  const host = draft.envelope.host as unknown;
  const compound = isRecord(host) && isRecord(host.children);
  return [
    ...accessOptions(members),
    ...members.flatMap((member) => memberOptions(member, members)),
    ...reachOptions(members, compound),
    ...members.flatMap((member) => routerOptions(member, members)),
    addMemberOption(draft, members, "switchboard"),
    addMemberOption(draft, members, "connect"),
    addBrowserOption(members),
  ];
}

/** The draft with an option chosen, or why it cannot be written. */
export function applyOption(
  draft: HostDraft,
  option: HostOption,
): { draft: HostDraft; refused?: string } {
  for (const setter of option.setters) {
    const verdict = checkSetter(setter, draft.envelope);
    if (!verdict.ok) return { draft, refused: verdict.reason };
  }
  const applied = applySetters(draft.envelope, option.setters);
  if (applied.issues.length > 0) {
    return { draft, refused: applied.issues[0].message };
  }
  return { draft: { ...draft, envelope: applied.envelope } };
}

function isSelected(
  option: HostOption,
  members: Member[],
  env: HostEnv,
): boolean {
  const member = members.find((candidate) => candidate.path === option.member);
  const backend = member?.backends.find(
    (candidate) => candidate.at === option.backend,
  );
  switch (option.group) {
    case "access":
      return (
        members.length > 0 &&
        members.every((candidate) => {
          const protocol = candidate.reactor?.protocol;
          const flags =
            isRecord(protocol) && isRecord(protocol.featureFlags)
              ? protocol.featureFlags
              : {};
          return LADDER.every(
            (flag, index) =>
              (flags[flag] === true) === index < Number(option.value),
          );
        })
      );
    case "storage": {
      const fallback =
        member?.role === "switchboard" && (!backend || backend.primary)
          ? "path"
          : undefined;
      return (backend?.storage ?? fallback) === option.value;
    }
    case "backendKind":
      return backend?.kind === option.value;
    case "hotReload":
      return member?.dev === (option.value === "on");
    case "workers":
      return (
        member !== undefined &&
        workerSettings(member, env).count.value === Number(option.value)
      );
    case "projectionWorker":
      return (
        member !== undefined &&
        workerSettings(member, env).projection.value === (option.value === "on")
      );
    case "placement":
      return placementSelected(option, members);
    case "newDrives":
    case "requestTimeout":
    case "breaker":
    case "realtime":
    case "probeTimeout":
    case "provisionalRoute":
      return routerOptionSelected(option, members);
    case "add":
    case "reach":
      return false;
  }
}

function addReason(
  option: HostOption,
  draft: HostDraft,
  controller: boolean,
): string | undefined {
  const host = draft.envelope.host as unknown;
  const compound = isRecord(host) && isRecord(host.children);
  if (option.value === "browser") {
    return option.setters.length > 0 ? undefined : ADD_REASONS.owner;
  }
  if (!compound) return ADD_REASONS.single;
  if (option.value === "switchboard" && !controller) {
    return REASONS.noController;
  }
  if (option.setters.length === 0) {
    return option.value === "switchboard"
      ? ADD_REASONS.noSwitchboard
      : ADD_REASONS.noConnect;
  }
  return undefined;
}

/** A worker option the host's env overrides, so choosing it changes nothing. */
function setByEnv(
  option: HostOption,
  members: Member[],
  env: HostEnv,
): boolean {
  if (option.group !== "workers" && option.group !== "projectionWorker") {
    return false;
  }
  const member = members.find((candidate) => candidate.path === option.member);
  if (!member) return false;
  const settings = workerSettings(member, env);
  return option.group === "workers"
    ? settings.count.fromEnv
    : settings.projection.fromEnv;
}

function issueKey(issue: HostRuleIssue): string {
  return `${issue.path}\0${issue.message}`;
}

const HOT_RELOAD_WORDING: Record<string, string> = {
  [REASONS.workersDev]: HOT_RELOAD_REASONS.workers,
  [REASONS.projectionDev]: HOT_RELOAD_REASONS.projection,
};

function reasonFor(option: HostOption, issue: HostRuleIssue): string {
  if (option.group === "hotReload") {
    return HOT_RELOAD_WORDING[issue.message] ?? issue.message;
  }
  // Said of the host this option would make, not of the one shown.
  if (issue.message === ROUTER_REASONS.newDrives) {
    return ROUTER_REASONS.newDrivesFirst;
  }
  return issue.message;
}

/** Each option, enabled or not; `reason` names the first new problem it causes. */
export function hostOptions(
  draft: HostDraft,
  contextInput: HostRulesContext,
): OptionStatus[] {
  const context = hostRulesContextSchema.parse(contextInput);
  const base = validateDraft(draft, context);
  const before = new Set(base.issues.map(issueKey));
  const devHost = hostVerb(draft.envelope, context) === "dev";
  return hostOptionList(draft, context).map((option) =>
    judge(option, draft, context, base, before, devHost),
  );
}

/** "Add a drive to <switchboard>" for a name the user typed. */
export function addDriveStatus(
  draft: HostDraft,
  contextInput: HostRulesContext,
  switchboard: string,
  name: string,
): OptionStatus | undefined {
  const context = hostRulesContextSchema.parse(contextInput);
  const base = validateDraft(draft, context);
  const member = base.members.find(
    (candidate) =>
      candidate.path === switchboard && candidate.role === "switchboard",
  );
  if (!member) return undefined;
  const option = addDriveOption(member, base.members, name);
  return judge(
    option,
    draft,
    context,
    base,
    new Set(base.issues.map(issueKey)),
    hostVerb(draft.envelope, context) === "dev",
  );
}

/** Saving a Router move: the drive `slug` opens on the Connect's `backend`. */
export function placementStatus(
  draft: HostDraft,
  contextInput: HostRulesContext,
  connect: string,
  slug: string,
  backend: string,
): OptionStatus | undefined {
  const context = hostRulesContextSchema.parse(contextInput);
  const base = validateDraft(draft, context);
  const member = base.members.find(
    (candidate) => candidate.path === connect && candidate.role === "connect",
  );
  if (!member) return undefined;
  const option = placementSaveOption(
    connectReach(member, base.members),
    slug,
    backend,
  );
  const placed = placedOn(member, slug);
  const target = member.backends.find(
    (candidate) => candidate.name === backend,
  );
  const already =
    option.value === "copy"
      ? placed === undefined || (target !== undefined && placed === target.name)
      : placed === backend;
  if (option.blocked) {
    return {
      ...option,
      selected: false,
      enabled: false,
      reason: option.blocked,
    };
  }
  if (already) return { ...option, selected: true, enabled: true };
  return judge(
    option,
    draft,
    context,
    base,
    new Set(base.issues.map(issueKey)),
    hostVerb(draft.envelope, context) === "dev",
  );
}

function judge(
  option: HostOption,
  draft: HostDraft,
  context: z.output<typeof hostRulesContextSchema>,
  base: Validation,
  before: Set<string>,
  devHost: boolean,
): OptionStatus {
  const selected = isSelected(option, base.members, draft.env ?? {});
  if (selected) return { ...option, selected, enabled: true };
  const ruled =
    option.blocked ??
    (option.group === "add"
      ? addReason(option, draft, context.controller)
      : option.group === "hotReload" && option.value === "off" && devHost
        ? HOT_RELOAD_REASONS.hostWide
        : setByEnv(option, base.members, draft.env ?? {})
          ? SETTING_REASONS.fromEnv
          : undefined);
  if (ruled) return { ...option, selected, enabled: false, reason: ruled };
  const candidate = applyOption(draft, option);
  if (candidate.refused) {
    return { ...option, selected, enabled: false, reason: candidate.refused };
  }
  const added = validateDraft(candidate.draft, context).issues.filter(
    (issue) => !before.has(issueKey(issue)),
  );
  return added.length > 0
    ? {
        ...option,
        selected,
        enabled: false,
        reason: reasonFor(option, added[0]),
      }
    : { ...option, selected, enabled: true };
}
