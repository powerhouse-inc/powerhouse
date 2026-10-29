// What "Route this app's reactors" opens the Router view with, after Start.
import {
  connectReach,
  targetOf,
  valueAt,
  type HostRulesContext,
  type Member,
} from "../host-rules/index.js";
import type { RouteSeed } from "../lib/route-seed.js";
import type { BuilderRun } from "./run.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    source: run.source,
    context,
    backends,
    collections,
    drives,
  };
}
