// A Connect's router and switchboard connection settings. Browser-safe.
import { connectReactorIssues } from "@powerhousedao/host-core/schema";
import {
  isRecord,
  valueAt,
  type Member,
  type MemberBackend,
} from "./members.ts";
import { blockOf, connectReach, targetOf } from "./reach.ts";
import type { Setter } from "./schema.ts";

export type BreakerSetting = { failures: number; openMs: number } | false;

/** The router's and the switchboard backend's own defaults. */
export const ROUTER_DEFAULTS = {
  requestTimeoutMs: 30_000,
  breaker: { failures: 3, openMs: 30_000 },
  realtime: true,
  probeTimeoutMs: 3_000,
  provisionalRouteMs: 30_000,
} as const;

export const REQUEST_TIMEOUTS = [10_000, 30_000, 120_000] as const;
export const BREAKERS: readonly BreakerSetting[] = [
  { failures: 3, openMs: 30_000 },
  { failures: 3, openMs: 120_000 },
  false,
];
export const PROBE_TIMEOUTS = [1_000, 3_000, 10_000] as const;
export const PROVISIONAL_ROUTES = [30_000, 300_000] as const;

export const ROUTER_REASONS = {
  noBrowser:
    "This app keeps no reactor in the browser, so new drives can't be created here.",
  primary:
    "Connect has no main backend. Remove this setting, and choose where new drives go instead.",
  newDrives:
    "This app keeps no reactor in the browser and opens drives on several switchboards. Choose where new drives go.",
} as const;

export function duration(ms: number): string {
  if (ms >= 60_000 && ms % 60_000 === 0) return `${ms / 60_000} min`;
  if (ms % 1_000 === 0) return `${ms / 1_000} s`;
  return `${ms} ms`;
}

const DEFAULT_MARK = " (default)";

export const ROUTER_LABELS = {
  inBrowser: "In this browser",
  onSwitchboard: (switchboard: string) => `On ${switchboard}`,
  waitUpTo: (ms: number) => `Wait up to ${duration(ms)}`,
  waitNoLimit: "Wait as long as it takes",
  breaker: (breaker: BreakerSetting) =>
    breaker === false
      ? "Never stop trying"
      : `Stop trying after ${breaker.failures} ${breaker.failures === 1 ? "failure" : "failures"}, try again in ${duration(breaker.openMs)}`,
  realtime: (on: boolean) => (on ? "Live updates on" : "Live updates off"),
  lookAgain: (ms: number) => `Look again after ${duration(ms)}`,
  setByHand: (what: string) => `Set in host.js: ${what}`,
  setToByHand: (ms: string) => `Set to ${ms} in host.js`,
} as const;

function sameBreaker(a: BreakerSetting, b: BreakerSetting): boolean {
  if (a === false || b === false) return a === b;
  return a.failures === b.failures && a.openMs === b.openMs;
}

/** A breaker as written, with the defaults filled in; undefined when invalid. */
export function breakerOf(raw: unknown): BreakerSetting | undefined {
  if (raw === undefined) return ROUTER_DEFAULTS.breaker;
  if (raw === false) return false;
  if (!isRecord(raw)) return undefined;
  const failures = raw.failures ?? ROUTER_DEFAULTS.breaker.failures;
  const openMs = raw.openMs ?? ROUTER_DEFAULTS.breaker.openMs;
  return typeof failures === "number" && typeof openMs === "number"
    ? { failures, openMs }
    : undefined;
}

function msOf(raw: unknown, fallback: number): number | undefined {
  if (raw === undefined) return fallback;
  return typeof raw === "number" ? raw : undefined;
}

function remoteBackends(member: Member): MemberBackend[] {
  return member.backends.filter((backend) => backend.kind === "remote");
}

export type ConnectionSettings = {
  /** The remote backend's name in the host config. */
  backend: string;
  /** The switchboard member it opens, when the link names one. */
  member?: string;
  /** The switchboard, by member key or address. */
  switchboard: string;
  requestTimeoutMs: number;
  breaker: BreakerSetting;
  realtime: boolean;
};

export type RouterSettings = {
  /** The backend new drives are created on; undefined: this browser. */
  newDrives: string | undefined;
  probeTimeoutMs: number;
  provisionalRouteMs: number;
  connections: ConnectionSettings[];
};

/** The host config's values, else the defaults; the shape check reports a bad type. */
export function routerSettings(
  member: Member,
  members: readonly Member[],
): RouterSettings {
  const remotes = remoteBackends(member);
  const keepsCopy = connectReach(member, members).keepsCopy;
  const raw = valueAt(member.reactor, ["placement", "newDrives"]);
  const named = remotes.find((backend) => backend.name === raw);
  const newDrives =
    named?.name ??
    (!keepsCopy && remotes.length === 1 ? remotes[0].name : undefined);
  const router = (key: string, fallback: number) =>
    msOf(valueAt(member.reactor, ["router", key]), fallback) ?? fallback;
  return {
    newDrives,
    probeTimeoutMs: router("probeTimeoutMs", ROUTER_DEFAULTS.probeTimeoutMs),
    provisionalRouteMs: router(
      "provisionalRouteMs",
      ROUTER_DEFAULTS.provisionalRouteMs,
    ),
    connections: remotes.map((backend) => {
      const remote = isRecord(backend.body.remote) ? backend.body.remote : {};
      const target = targetOf(remote.url, members);
      return {
        backend: backend.name,
        ...(target.member ? { member: target.member } : {}),
        switchboard: target.label,
        requestTimeoutMs:
          msOf(remote.requestTimeoutMs, ROUTER_DEFAULTS.requestTimeoutMs) ??
          ROUTER_DEFAULTS.requestTimeoutMs,
        breaker: breakerOf(remote.breaker) ?? ROUTER_DEFAULTS.breaker,
        realtime:
          typeof remote.realtime === "boolean"
            ? remote.realtime
            : ROUTER_DEFAULTS.realtime,
      };
    }),
  };
}

/** One line per setting, for the Router view's "From the host config". */
export function routerSettingLines(settings: RouterSettings): string[] {
  const switchboardOf = (backend: string) =>
    settings.connections.find((entry) => entry.backend === backend)
      ?.switchboard ?? backend;
  return [
    `New drives: ${
      settings.newDrives === undefined
        ? "in this browser"
        : `on ${switchboardOf(settings.newDrives)}`
    }`,
    `Finding a document: ${
      settings.probeTimeoutMs === 0
        ? ROUTER_LABELS.waitNoLimit.toLowerCase()
        : ROUTER_LABELS.waitUpTo(settings.probeTimeoutMs).toLowerCase()
    } for each reactor`,
    `A document found on a switchboard: ${ROUTER_LABELS.lookAgain(
      settings.provisionalRouteMs,
    ).toLowerCase()}`,
    ...settings.connections.map(
      (connection) =>
        `Connection to ${connection.switchboard}: ${[
          ROUTER_LABELS.waitUpTo(connection.requestTimeoutMs),
          ROUTER_LABELS.breaker(connection.breaker),
          ROUTER_LABELS.realtime(connection.realtime),
        ]
          .map((part) => part.toLowerCase())
          .join(", ")}`,
    ),
  ];
}

/** host-core's Connect placement check, in the builder's words. */
export function connectRouterRule(
  members: readonly Member[],
  report: (path: string, message: string, hint: string) => void,
): void {
  for (const member of members) {
    if (member.role !== "connect") continue;
    for (const issue of connectReactorIssues({ reactor: member.reactor })) {
      const [, ...rest] = issue.path;
      const message =
        rest.at(-1) === "primary"
          ? ROUTER_REASONS.primary
          : ROUTER_REASONS.newDrives;
      report(
        [member.reactorAt, ...rest.map(String)].join("."),
        message,
        issue.message,
      );
    }
  }
}

const DELETE = { $delete: true } as const;

export type RouterGroup =
  | "newDrives"
  | "requestTimeout"
  | "breaker"
  | "realtime"
  | "probeTimeout"
  | "provisionalRoute";

export type RouterOption = {
  id: string;
  group: RouterGroup;
  value: string;
  label: string;
  member: string;
  backend?: string;
  setters: Setter[];
  blocked?: string;
};

/** The option value a millisecond setting selects. */
function msChoice(
  raw: unknown,
  fallback: number,
  presets: readonly number[],
): string | undefined {
  const value = raw ?? fallback;
  if (typeof value !== "number") return undefined;
  return presets.includes(value) ? String(value) : "custom";
}

function breakerValue(breaker: BreakerSetting): string {
  return breaker === false ? "never" : `${breaker.failures}/${breaker.openMs}`;
}

/** The default preset removes the key; a hand-set value shows read-only. */
function msOptions(
  base: Omit<RouterOption, "id" | "value" | "label" | "setters">,
  prefix: string,
  presets: readonly number[],
  fallback: number,
  raw: unknown,
  path: string,
  copy: Setter[],
  label: (ms: number) => string,
): RouterOption[] {
  const options: RouterOption[] = presets.map((ms) => ({
    ...base,
    id: `${prefix}:${ms}`,
    value: String(ms),
    label: `${label(ms)}${ms === fallback ? DEFAULT_MARK : ""}`,
    setters: [...copy, { path, value: ms === fallback ? DELETE : ms }],
  }));
  if (typeof raw === "number" && !presets.includes(raw)) {
    options.push({
      ...base,
      id: `${prefix}:custom`,
      value: "custom",
      label: ROUTER_LABELS.setToByHand(raw === 0 ? "no limit" : duration(raw)),
      setters: [],
    });
  }
  return options;
}

function newDrivesOptions(
  member: Member,
  members: readonly Member[],
  at: string,
  copy: Setter[],
): RouterOption[] {
  const reach = connectReach(member, members);
  const settings = routerSettings(member, members);
  const prefix = `${member.path}:newDrives`;
  const clearPrimary: Setter[] =
    valueAt(member.reactor, ["placement", "primary"]) === undefined
      ? []
      : [{ path: `${at}.placement.primary`, value: DELETE }];
  return [
    {
      id: `${prefix}:browser`,
      group: "newDrives",
      value: "browser",
      label: ROUTER_LABELS.inBrowser,
      member: member.path,
      setters: [
        ...copy,
        { path: `${at}.placement.newDrives`, value: DELETE },
        ...clearPrimary,
      ],
      ...(reach.keepsCopy ? {} : { blocked: ROUTER_REASONS.noBrowser }),
    },
    ...settings.connections.map((connection): RouterOption => ({
      id: `${prefix}:${connection.backend}`,
      group: "newDrives",
      value: connection.backend,
      label: ROUTER_LABELS.onSwitchboard(connection.switchboard),
      member: member.path,
      setters: [
        ...copy,
        { path: `${at}.placement.newDrives`, value: connection.backend },
        ...clearPrimary,
      ],
    })),
  ];
}

function connectionOptions(
  member: Member,
  backend: MemberBackend,
  at: string,
  copy: Setter[],
): RouterOption[] {
  const remote = isRecord(backend.body.remote) ? backend.body.remote : {};
  const base = { member: member.path, backend: backend.at };
  const prefix = (group: RouterGroup) =>
    `${member.path}:${group}:${backend.name}`;
  const path = (key: string) => `${at}.backends.${backend.name}.remote.${key}`;
  const options = msOptions(
    { ...base, group: "requestTimeout" },
    prefix("requestTimeout"),
    REQUEST_TIMEOUTS,
    ROUTER_DEFAULTS.requestTimeoutMs,
    remote.requestTimeoutMs,
    path("requestTimeoutMs"),
    copy,
    ROUTER_LABELS.waitUpTo,
  );
  for (const breaker of BREAKERS) {
    const isDefault = sameBreaker(breaker, ROUTER_DEFAULTS.breaker);
    options.push({
      ...base,
      group: "breaker",
      id: `${prefix("breaker")}:${breakerValue(breaker)}`,
      value: breakerValue(breaker),
      label: `${ROUTER_LABELS.breaker(breaker)}${isDefault ? DEFAULT_MARK : ""}`,
      setters: [
        ...copy,
        { path: path("breaker"), value: isDefault ? DELETE : breaker },
      ],
    });
  }
  const current = breakerOf(remote.breaker);
  if (
    current !== undefined &&
    !BREAKERS.some((preset) => sameBreaker(preset, current))
  ) {
    options.push({
      ...base,
      group: "breaker",
      id: `${prefix("breaker")}:custom`,
      value: "custom",
      label: ROUTER_LABELS.setByHand(
        ROUTER_LABELS.breaker(current).toLowerCase(),
      ),
      setters: [],
    });
  }
  for (const on of [true, false]) {
    options.push({
      ...base,
      group: "realtime",
      id: `${prefix("realtime")}:${on ? "on" : "off"}`,
      value: on ? "on" : "off",
      label: `${ROUTER_LABELS.realtime(on)}${on ? DEFAULT_MARK : ""}`,
      setters: [
        ...copy,
        { path: path("realtime"), value: on ? DELETE : false },
      ],
    });
  }
  return options;
}

/** Router and connection options for a Connect that links a switchboard. */
export function routerOptions(
  member: Member,
  members: readonly Member[],
): RouterOption[] {
  if (member.role !== "connect") return [];
  const remotes = remoteBackends(member);
  if (remotes.length === 0) return [];
  const { at, copy } = blockOf(member);
  const base = { member: member.path };
  return [
    ...newDrivesOptions(member, members, at, copy),
    ...msOptions(
      { ...base, group: "probeTimeout" },
      `${member.path}:probeTimeout`,
      PROBE_TIMEOUTS,
      ROUTER_DEFAULTS.probeTimeoutMs,
      valueAt(member.reactor, ["router", "probeTimeoutMs"]),
      `${at}.router.probeTimeoutMs`,
      copy,
      ROUTER_LABELS.waitUpTo,
    ),
    ...msOptions(
      { ...base, group: "provisionalRoute" },
      `${member.path}:provisionalRoute`,
      PROVISIONAL_ROUTES,
      ROUTER_DEFAULTS.provisionalRouteMs,
      valueAt(member.reactor, ["router", "provisionalRouteMs"]),
      `${at}.router.provisionalRouteMs`,
      copy,
      ROUTER_LABELS.lookAgain,
    ),
    ...remotes.flatMap((backend) =>
      connectionOptions(member, backend, at, copy),
    ),
  ];
}

/** Whether a router option is what the Connect runs with now. */
export function routerOptionSelected(
  option: { group: string; value: string; member?: string; backend?: string },
  members: readonly Member[],
): boolean {
  const member = members.find((candidate) => candidate.path === option.member);
  if (!member) return false;
  const settings = routerSettings(member, members);
  const backend = member.backends.find(
    (candidate) => candidate.at === option.backend,
  );
  const remote =
    backend && isRecord(backend.body.remote) ? backend.body.remote : {};
  switch (option.group) {
    case "newDrives":
      if (settings.newDrives !== undefined) {
        return option.value === settings.newDrives;
      }
      return (
        option.value === "browser" && connectReach(member, members).keepsCopy
      );
    case "probeTimeout":
      return (
        option.value ===
        msChoice(
          valueAt(member.reactor, ["router", "probeTimeoutMs"]),
          ROUTER_DEFAULTS.probeTimeoutMs,
          PROBE_TIMEOUTS,
        )
      );
    case "provisionalRoute":
      return (
        option.value ===
        msChoice(
          valueAt(member.reactor, ["router", "provisionalRouteMs"]),
          ROUTER_DEFAULTS.provisionalRouteMs,
          PROVISIONAL_ROUTES,
        )
      );
    case "requestTimeout":
      return (
        option.value ===
        msChoice(
          remote.requestTimeoutMs,
          ROUTER_DEFAULTS.requestTimeoutMs,
          REQUEST_TIMEOUTS,
        )
      );
    case "breaker": {
      const current = breakerOf(remote.breaker);
      if (current === undefined) return false;
      return option.value === "custom"
        ? !BREAKERS.some((preset) => sameBreaker(preset, current))
        : option.value === breakerValue(current);
    }
    case "realtime":
      return (
        (option.value === "on") ===
        (typeof remote.realtime === "boolean"
          ? remote.realtime
          : ROUTER_DEFAULTS.realtime)
      );
    default:
      return false;
  }
}
