// What "Route this app's reactors" opens the Router view with, after Start.
import {
  applySetters,
  connectReach,
  membersOf,
  routerSettingLines,
  routerSettings,
  targetOf,
  valueAt,
  type HostRulesContext,
  type Member,
} from "../host-rules/index.js";
import type { RemoteSettings, RouteSeed } from "../lib/route-seed.js";
import type { BuilderDraft } from "./draft.js";
import type { BuilderRun } from "./run.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The members the copy runs, when it ran this draft's base; else `fallback`. */
export function startedMembers(
  draft: BuilderDraft,
  run: BuilderRun,
  fallback: readonly Member[],
): readonly Member[] {
  const source = run.source;
  if (!source?.setters || source.baseDigest !== draft.baseDigest) {
    return fallback;
  }
  return membersOf({
    envelope: applySetters(draft.base.export, source.setters).envelope,
  });
}

/** Undefined when the copy attached fewer than two of the app's reactors. */
export function routeSeedOf({
  id,
  member,
  members,
  run,
  context,
}: {
  id: string;
  member: Member;
  members: readonly Member[];
  run: BuilderRun;
  context: HostRulesContext;
}): RouteSeed | undefined {
  if (run.id === undefined || run.source === undefined) return undefined;
  const reach = connectReach(member, members);
  const backends: { reactor: string; backend: string }[] = [];
  const reactorOf = new Map<string, string>();
  const switchboardOf = new Map<string, string>();
  for (const local of reach.local) {
    const found = run.attached.browser.find(
      (entry) => entry.member === member.key && entry.backend === local.name,
    );
    if (!found) continue;
    backends.push({ reactor: found.name, backend: local.name });
    reactorOf.set(local.name, found.name);
  }
  const browser = backends.at(0)?.reactor;
  for (const backend of member.backends) {
    if (backend.kind !== "remote") continue;
    const target = targetOf(valueAt(backend.body, ["remote", "url"]), members);
    const found = run.attached.remote.find(
      (entry) => target.member !== undefined && entry.member === target.member,
    );
    if (!found || target.member === undefined) continue;
    switchboardOf.set(backend.name, target.member);
    reactorOf.set(backend.name, found.name);
    if (!backends.some((entry) => entry.reactor === found.name)) {
      backends.push({ reactor: found.name, backend: backend.name });
    }
  }
  if (backends.length < 2) return undefined;

  // The router Connect builds: new drives' backend, then the browser reactor.
  const settings = routerSettings(member, members);
  const newDrives =
    settings.newDrives === undefined
      ? browser
      : reactorOf.get(settings.newDrives);
  if (browser === undefined && newDrives !== undefined) {
    backends.sort(
      (a, b) =>
        Number(b.reactor === newDrives) - Number(a.reactor === newDrives),
    );
  }
  const connections: Record<string, RemoteSettings> = {};
  for (const connection of settings.connections) {
    const reactor = reactorOf.get(connection.backend);
    if (reactor === undefined) continue;
    connections[reactor] = {
      requestTimeoutMs: connection.requestTimeoutMs,
      breaker: connection.breaker,
      realtime: connection.realtime,
    };
  }

  // A switchboard drive is keyed by the id the copy's switchboard reports.
  const keyOf = (slug: string, switchboard: string | undefined) =>
    (switchboard === undefined
      ? undefined
      : run.reactors.find((reactor) => reactor.name === switchboard)?.drives?.[
          slug
        ]?.id) ?? slug;
  const collections: Record<string, string> = {};
  const drives: Record<string, string> = {};
  const placed = valueAt(member.reactor, ["placement", "drives"]);
  const placement = isRecord(placed) ? placed : {};
  for (const [slug, backend] of Object.entries(placement)) {
    if (typeof backend !== "string") continue;
    const reactor = reactorOf.get(backend);
    if (reactor === undefined) continue;
    const link = reach.links.find((candidate) => candidate.slug === slug);
    const key = keyOf(slug, switchboardOf.get(backend) ?? link?.member);
    collections[key] = reactor;
    drives[key] = slug;
  }
  // Every linked drive is named by slug, so a move survives the id changing.
  for (const link of reach.links) {
    if (!run.attached.remote.some((entry) => entry.member === link.member)) {
      continue;
    }
    drives[keyOf(link.slug, link.member)] = link.slug;
  }
  // The monitor's browser reactor holds none of these until they are created.
  if (browser !== undefined) {
    for (const slug of reach.ownDrives) {
      if (Object.hasOwn(placement, slug)) continue;
      collections[slug] = browser;
      drives[slug] = slug;
    }
  }
  return {
    id,
    app: member.key,
    member: member.path,
    instanceId: run.id,
    source: { project: run.source.project, host: run.source.host },
    context,
    backends,
    collections,
    drives,
    router: {
      ...(newDrives === undefined ? {} : { defaultBackend: newDrives }),
      probeTimeoutMs: settings.probeTimeoutMs,
      provisionalRouteMs: settings.provisionalRouteMs,
    },
    connections,
    settings: routerSettingLines(settings),
  };
}
