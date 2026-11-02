// What "Route this app's reactors" opens the Router view with, after Start.
import {
  applySetters,
  connectReach,
  isRecord,
  membersOf,
  routerSettingLines,
  routerSettings,
  targetOf,
  valueAt,
  type HostRulesContext,
  type Member,
} from "../host-rules/index.js";
import type { RemoteSettings, RouteSeed } from "../lib/route-seed.js";
import { ROUTE_COPY } from "./copy.js";
import type { BuilderDraft } from "./draft.js";
import type { BuilderRun } from "./run.js";

function isPath(value: unknown, path: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.length === path.length &&
    path.every((segment, at) => value[at] === segment)
  );
}

/** The switchboard a `$map` list opens whole, by its own slugs and urls. */
function mappedSwitchboard(
  member: Member,
  members: readonly Member[],
): string | undefined {
  const map = valueAt(member.reactor, ["drives", "$map"]);
  if (!isRecord(map) || !isRecord(map.over)) return undefined;
  // Unnamed, or named by `as`: host-core reads both the same.
  const bound = (name: unknown) =>
    name === true || (typeof map.as === "string" && name === map.as);
  const item = valueAt(map, ["to", "remote", "url", "$item"]);
  const url = isRecord(item)
    ? bound(item.as) && isPath(item.path, ["url"])
    : isPath(item, ["url"]);
  if (
    !isPath(valueAt(map.over, ["$output", "path"]), ["drives"]) ||
    !url ||
    !bound(valueAt(map, ["to", "slug", "$key"]))
  ) {
    return undefined;
  }
  return targetOf(map.over, members).member;
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

  // As Connect: its primary first; new drives on newDrives, else the primary.
  const settings = routerSettings(member, members);
  const primary = member.backends.find((backend) => backend.primary)?.name;
  const first = primary === undefined ? undefined : reactorOf.get(primary);
  backends.sort(
    (a, b) => Number(b.reactor === first) - Number(a.reactor === first),
  );
  const home = settings.newDrives ?? primary;
  const newDrives = home === undefined ? undefined : reactorOf.get(home);
  const blocked =
    newDrives === undefined
      ? ROUTE_COPY.newDrivesUnreachable(
          settings.connections.find((entry) => entry.backend === home)
            ?.switchboard ?? ROUTE_COPY.browserReactor,
        )
      : undefined;
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
  const listed = reach.mappedDrives
    ? mappedSwitchboard(member, members)
    : undefined;
  const mapped =
    listed !== undefined && [...switchboardOf.values()].includes(listed)
      ? listed
      : undefined;
  const collections: Record<string, string> = {};
  const drives: Record<string, string> = {};
  const placed = valueAt(member.reactor, ["placement", "drives"]);
  const placement = isRecord(placed) ? placed : {};
  for (const [slug, backend] of Object.entries(placement)) {
    if (typeof backend !== "string") continue;
    const reactor = reactorOf.get(backend);
    if (reactor === undefined) continue;
    const link = reach.links.find((candidate) => candidate.slug === slug);
    const key = keyOf(
      slug,
      switchboardOf.get(backend) ?? link?.member ?? mapped,
    );
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
  // A mapped list is every drive its switchboard reports at start.
  if (mapped !== undefined) {
    const served = run.reactors.find(
      (reactor) => reactor.name === mapped,
    )?.drives;
    for (const [slug, drive] of Object.entries(served ?? {})) {
      drives[drive.id] ??= slug;
    }
  }
  const copies: Record<string, string> = {};
  // The monitor's browser reactor holds none of these until they are created.
  if (browser !== undefined) {
    for (const [key, slug] of Object.entries(drives)) {
      if (!Object.hasOwn(placement, slug)) copies[key] = browser;
    }
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
    copies,
    router: {
      ...(newDrives === undefined ? {} : { defaultBackend: newDrives }),
      probeTimeoutMs: settings.probeTimeoutMs,
      provisionalRouteMs: settings.provisionalRouteMs,
    },
    connections,
    settings: [
      ...routerSettingLines(settings),
      ...(blocked === undefined ? [] : [blocked]),
    ],
    ...(blocked === undefined ? {} : { newDrivesBlocked: blocked }),
  };
}
