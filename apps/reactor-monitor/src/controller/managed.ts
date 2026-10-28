import type { ReactorDescriptor } from "@powerhousedao/reactor-monitor";
import { remoteHeaders } from "../provisioning.js";
import type { Instance } from "./api.js";

/** Marks a remote descriptor whose switchboard the controller runs. */
export interface ManagedBy {
  instanceId: string;
  project: string;
  host: string;
  /** A compound's member, by child key; absent for a standalone host. */
  member?: string;
}

export type ManagedDescriptor = ReactorDescriptor & {
  kind: "remote";
  remote: NonNullable<ReactorDescriptor["remote"]>;
  managedBy: ManagedBy;
};

export function managedByOf(
  descriptor: ReactorDescriptor,
): ManagedBy | undefined {
  if (descriptor.kind !== "remote" || !descriptor.remote) return undefined;
  const marker = (descriptor as { managedBy?: unknown }).managedBy;
  if (typeof marker !== "object" || marker === null) return undefined;
  const { instanceId, project, host, member } = marker as Record<
    string,
    unknown
  >;
  if (
    typeof instanceId !== "string" ||
    typeof project !== "string" ||
    typeof host !== "string" ||
    (member !== undefined && typeof member !== "string")
  ) {
    return undefined;
  }
  return { instanceId, project, host, ...(member ? { member } : {}) };
}

export function isManaged(
  descriptor: ReactorDescriptor,
): descriptor is ManagedDescriptor {
  return managedByOf(descriptor) !== undefined;
}

/** `<member or host>-<id prefix>`, suffixed until no name in `taken` collides. */
export function managedName(
  instance: Instance,
  taken: Iterable<string>,
  member?: string,
): string {
  const names = new Set(taken);
  const base = `${member ?? instance.host}-${instance.id.slice(0, 8)}`;
  let name = base;
  for (let n = 2; names.has(name); n++) name = `${base}-${n}`;
  return name;
}

/** The GraphQL URL the instance serves for this descriptor's member. */
export function managedUrl(
  instance: Instance,
  managedBy: Pick<ManagedBy, "member">,
): string | undefined {
  return managedBy.member === undefined
    ? instance.outputs?.graphql
    : instance.members?.[managedBy.member]?.outputs?.graphql;
}

/** One remote descriptor per switchboard a running instance serves. */
export function managedDescriptors(
  instance: Instance,
  taken: Iterable<string>,
): ManagedDescriptor[] {
  if (instance.status !== "running") return [];
  const targets: [member: string | undefined, url: string][] = [];
  if (instance.outputs) targets.push([undefined, instance.outputs.graphql]);
  for (const [member, entry] of Object.entries(instance.members ?? {})) {
    if (entry.outputs) targets.push([member, entry.outputs.graphql]);
  }
  const names = new Set(taken);
  return targets.map(([member, url]) => {
    const name = managedName(instance, names, member);
    names.add(name);
    return {
      kind: "remote",
      name,
      remote: { url, headers: () => remoteHeaders(url) },
      managedBy: {
        instanceId: instance.id,
        project: instance.project,
        host: instance.host,
        ...(member === undefined ? {} : { member }),
      },
    };
  });
}
