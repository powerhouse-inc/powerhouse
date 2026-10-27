import type { HostExport } from "@powerhousedao/host-core/schema";
import type { HostDraft, HostRulesContext } from "./schema.js";

const SWITCHBOARD_RUNNER = "/runners/switchboard";
const CONNECT_RUNNER = "/runners/connect";

export type MemberRole = "switchboard" | "connect" | "other";

/** controller: a switchboard's own store; browser: the monitor's; remote: a peer. */
export type BackendMode = "controller" | "browser" | "remote" | "unmanaged";

export type MemberBackend = {
  name: string;
  /** Envelope path of the backend. */
  at: string;
  kind: string | undefined;
  storage: string | undefined;
  primary: boolean;
  mode: BackendMode;
  body: Record<string, unknown>;
};

export type Member = {
  /** `host` standalone, else `host.children.<key>`. */
  path: string;
  key: string;
  folder: string;
  role: MemberRole;
  /** Effective runner: the member's own, key-merged under its wrapper's. */
  runner: Record<string, unknown>;
  /** Effective reactor block: a wrapper's replaces the member's. */
  reactor: Record<string, unknown> | undefined;
  /** Where that block lives (or would be written). */
  reactorAt: string;
  dev: boolean;
  env: Record<string, string>;
  backends: MemberBackend[];
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function roleOf(runner: Record<string, unknown>): MemberRole {
  const module = typeof runner.module === "string" ? runner.module : "";
  if (module.endsWith(SWITCHBOARD_RUNNER)) return "switchboard";
  if (module.endsWith(CONNECT_RUNNER)) return "connect";
  return "other";
}

/** host-core primaryBackend's pick, by name. */
export function primaryBackendName(
  reactor: Record<string, unknown> | undefined,
): string | undefined {
  if (!reactor || !isRecord(reactor.backends)) return undefined;
  const names = Object.keys(reactor.backends);
  if (names.length === 0) return undefined;
  const placement = isRecord(reactor.placement)
    ? reactor.placement.primary
    : undefined;
  if (typeof placement === "string") return placement;
  if (names.includes("main")) return "main";
  if (names.includes("local")) return "local";
  return names[0];
}

function modeOf(
  role: MemberRole,
  kind: unknown,
  primary: boolean,
): BackendMode {
  if (kind === "remote") return "remote";
  if (role === "switchboard") return primary ? "controller" : "browser";
  if (role === "connect") return "browser";
  return "unmanaged";
}

function backendsOf(
  role: MemberRole,
  reactor: Record<string, unknown> | undefined,
  reactorAt: string,
): MemberBackend[] {
  if (!reactor || !isRecord(reactor.backends)) return [];
  const primary = primaryBackendName(reactor);
  return Object.entries(reactor.backends).flatMap(([name, body]) => {
    if (!isRecord(body)) return [];
    const storage = isRecord(body.storage) ? body.storage.kind : undefined;
    const kind = typeof body.kind === "string" ? body.kind : undefined;
    return [
      {
        name,
        at: `${reactorAt}.backends.${name}`,
        kind,
        storage: typeof storage === "string" ? storage : undefined,
        primary: name === primary,
        mode: modeOf(role, kind, name === primary),
        body,
      },
    ];
  });
}

export function hostVerb(
  envelope: HostExport,
  context: Pick<HostRulesContext, "verb"> = {},
): string {
  if (context.verb) return context.verb;
  const host = envelope.host as unknown;
  const runner = isRecord(host) && isRecord(host.runner) ? host.runner : {};
  return typeof runner.defaultVerb === "string" ? runner.defaultVerb : "run";
}

function member(
  draft: HostDraft,
  fields: Omit<Member, "role" | "dev" | "env" | "backends">,
  verb: string,
): Member {
  const role = roleOf(fields.runner);
  return {
    ...fields,
    role,
    dev: verb === "dev" || fields.runner.dev === true,
    env: draft.env?.[fields.path] ?? {},
    backends: backendsOf(role, fields.reactor, fields.reactorAt),
  };
}

/** The reactors a host runs, as they will run; nested compounds are not walked. */
export function membersOf(
  draft: HostDraft,
  context: Pick<HostRulesContext, "verb"> = {},
): Member[] {
  const { envelope } = draft;
  const host = envelope.host as unknown;
  if (!isRecord(host)) return [];
  const verb = hostVerb(envelope, context);
  if (!isRecord(host.children)) {
    return [
      member(
        draft,
        {
          path: "host",
          key: envelope.name,
          folder: envelope.name,
          runner: isRecord(host.runner) ? host.runner : {},
          reactor: isRecord(host.reactor) ? host.reactor : undefined,
          reactorAt: "host.reactor",
        },
        verb,
      ),
    ];
  }
  const members = isRecord(envelope.members) ? envelope.members : {};
  return Object.entries(host.children).flatMap(([key, wrapper]) => {
    if (!isRecord(wrapper) || typeof wrapper.host !== "string") return [];
    const folder = wrapper.host;
    const body = Object.hasOwn(members, folder) ? members[folder] : undefined;
    if (!isRecord(body) || isRecord(body.children)) return [];
    const own = isRecord(body.runner) ? body.runner : {};
    const over = isRecord(wrapper.runner) ? wrapper.runner : {};
    const wrapped = wrapper.reactor !== undefined;
    return [
      member(
        draft,
        {
          path: `host.children.${key}`,
          key,
          folder,
          runner: { ...own, ...over },
          reactor: wrapped
            ? isRecord(wrapper.reactor)
              ? wrapper.reactor
              : undefined
            : isRecord(body.reactor)
              ? body.reactor
              : undefined,
          reactorAt: wrapped
            ? `host.children.${key}.reactor`
            : `members.${folder}.reactor`,
        },
        verb,
      ),
    ];
  });
}

/** The host file an envelope path lives in. */
export function fileOf(envelope: HostExport, path: string): string {
  const [root, folder] = path.split(".");
  if (root === "members" && folder) return `hosts/${folder}/host.js`;
  return `hosts/${envelope.name}/host.js`;
}
