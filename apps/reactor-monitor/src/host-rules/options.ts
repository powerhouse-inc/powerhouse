import { FLAG_LABELS, LADDER, ladderFlags } from "./flags.js";
import { isRecord, membersOf, type Member } from "./members.js";
import { checkSetter } from "./policy.js";
import {
  hostRulesContextSchema,
  type HostDraft,
  type HostRuleIssue,
  type HostRulesContext,
  type MemberEnv,
  type Setter,
} from "./schema.js";
import { applySetters } from "./setters.js";
import { REASONS, validateDraft } from "./validate.js";

export type OptionGroup =
  | "access"
  | "storage"
  | "backendKind"
  | "workers"
  | "projectionWorker"
  | "add";

export type HostOption = {
  /** Stable: `<group>:<value>`, prefixed by the member or backend path. */
  id: string;
  group: OptionGroup;
  value: string;
  label: string;
  member?: string;
  backend?: string;
  /** What choosing it writes; empty for `add`, which the builder performs. */
  setters: Setter[];
  /** Env per member path; null removes the key. */
  env?: Record<string, Record<string, string | null>>;
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

export const SINGLE_HOST =
  "This host runs one reactor. Make it a host with several reactors to add more.";
export const NEEDS_OWNER =
  "Add a switchboard or Connect first. An in-browser reactor is saved with one of them.";

function accessOptions(members: Member[]): HostOption[] {
  const sites = [...new Set(members.map((member) => member.reactorAt))];
  return [0, 1, 2, 3, 4].map((level) => ({
    id: `access:${level}`,
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

function memberOptions(member: Member): HostOption[] {
  const options: HostOption[] = [];
  if (member.role === "switchboard") {
    const primary = member.backends.find((backend) => backend.primary);
    const at = primary?.at ?? `${member.reactorAt}.backends.main`;
    for (const kind of ["path", "memory", "postgres"]) {
      options.push({
        id: `${at}:storage:${kind}`,
        group: "storage",
        value: kind,
        label: STORAGE_LABELS[kind],
        member: member.path,
        backend: at,
        setters: storageSetters(at, kind, primary ? undefined : "in-process"),
      });
    }
    for (const count of WORKER_COUNTS) {
      options.push({
        id: `${member.path}:workers:${count}`,
        group: "workers",
        value: String(count),
        label: count === 0 ? "Off" : String(count),
        member: member.path,
        setters: [],
        env: {
          [member.path]: {
            REACTOR_WORKERS: count === 0 ? null : String(count),
          },
        },
      });
    }
    for (const on of [false, true]) {
      options.push({
        id: `${member.path}:projectionWorker:${on ? "on" : "off"}`,
        group: "projectionWorker",
        value: on ? "on" : "off",
        label: on ? "On" : "Off",
        member: member.path,
        setters: [],
        env: {
          [member.path]: { REACTOR_PROJECTION_WORKER: on ? "true" : null },
        },
      });
    }
  }
  for (const backend of member.backends) {
    if (backend.mode !== "browser") continue;
    for (const kind of ["idb", "memory", "path", "postgres"]) {
      options.push({
        id: `${backend.at}:storage:${kind}`,
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
        id: `${backend.at}:backendKind:${kind}`,
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

const ADD_OPTIONS: HostOption[] = [
  {
    id: "add:switchboard",
    group: "add",
    value: "switchboard",
    label: "Switchboard",
    setters: [],
  },
  {
    id: "add:connect",
    group: "add",
    value: "connect",
    label: "Connect",
    setters: [],
  },
  {
    id: "add:browser",
    group: "add",
    value: "browser",
    label: "Reactor in the browser",
    setters: [],
  },
];

/** Every option the builder can offer for this draft, not yet judged. */
export function hostOptionList(
  draft: HostDraft,
  context: Pick<HostRulesContext, "verb"> = {},
): HostOption[] {
  const members = membersOf(draft, context);
  return [
    ...accessOptions(members),
    ...members.flatMap(memberOptions),
    ...ADD_OPTIONS,
  ];
}

function applyEnv(
  env: MemberEnv | undefined,
  patch: HostOption["env"],
): MemberEnv {
  const next: MemberEnv = structuredClone(env ?? {});
  for (const [member, keys] of Object.entries(patch ?? {})) {
    const row = { ...next[member] };
    for (const [key, value] of Object.entries(keys)) {
      if (value === null) delete row[key];
      else row[key] = value;
    }
    next[member] = row;
  }
  return next;
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
  return {
    draft: { envelope: applied.envelope, env: applyEnv(draft.env, option.env) },
  };
}

function isSelected(option: HostOption, members: Member[]): boolean {
  const member = members.find((candidate) => candidate.path === option.member);
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
      const backend = member?.backends.find(
        (candidate) => candidate.at === option.backend,
      );
      const kind = backend
        ? (backend.storage ??
          (backend.mode === "controller" ? "path" : undefined))
        : member?.role === "switchboard"
          ? "path"
          : undefined;
      return kind === option.value;
    }
    case "backendKind":
      return (
        member?.backends.find((candidate) => candidate.at === option.backend)
          ?.kind === option.value
      );
    case "workers":
      return (member?.env.REACTOR_WORKERS ?? "0") === option.value;
    case "projectionWorker":
      return (
        (member?.env.REACTOR_PROJECTION_WORKER !== undefined) ===
        (option.value === "on")
      );
    case "add":
      return false;
  }
}

function addReason(
  option: HostOption,
  draft: HostDraft,
  members: Member[],
  controller: boolean,
): string | undefined {
  const host = draft.envelope.host as unknown;
  const compound = isRecord(host) && isRecord(host.children);
  if (option.value === "browser") {
    return members.some((member) => member.role !== "other")
      ? undefined
      : NEEDS_OWNER;
  }
  if (!compound && members.length > 0) return SINGLE_HOST;
  if (option.value === "switchboard" && !controller)
    return REASONS.noController;
  return undefined;
}

function issueKey(issue: HostRuleIssue): string {
  return `${issue.path}\0${issue.message}`;
}

/** Each option, enabled or not; `reason` names the first new problem it causes. */
export function hostOptions(
  draft: HostDraft,
  contextInput: HostRulesContext,
): OptionStatus[] {
  const context = hostRulesContextSchema.parse(contextInput);
  const base = validateDraft(draft, context);
  const before = new Set(base.issues.map(issueKey));
  return hostOptionList(draft, context).map((option): OptionStatus => {
    const selected = isSelected(option, base.members);
    if (option.group === "add") {
      const reason = addReason(option, draft, base.members, context.controller);
      return reason
        ? { ...option, selected, enabled: false, reason }
        : { ...option, selected, enabled: true };
    }
    if (selected) return { ...option, selected, enabled: true };
    const candidate = applyOption(draft, option);
    if (candidate.refused) {
      return { ...option, selected, enabled: false, reason: candidate.refused };
    }
    const added = validateDraft(candidate.draft, context).issues.filter(
      (issue) => !before.has(issueKey(issue)),
    );
    return added.length > 0
      ? { ...option, selected, enabled: false, reason: added[0].message }
      : { ...option, selected, enabled: true };
  });
}
