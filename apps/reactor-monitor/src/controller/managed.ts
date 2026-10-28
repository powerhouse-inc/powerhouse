import { switchboardOfDrive } from "@powerhousedao/host-core/schema";
import type { ReactorDescriptor } from "@powerhousedao/reactor-monitor";
import { remoteHeaders } from "../provisioning.js";
import type { Instance, InstanceOutputs } from "./api.js";

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

/** A browser reactor a builder copy brought along; it goes when the copy does. */
export interface OwnedBy {
  instanceId: string;
}

export function ownerOf(descriptor: ReactorDescriptor): string | undefined {
  if (descriptor.kind === "remote") return undefined;
  const marker = (descriptor as { ownedBy?: unknown }).ownedBy;
  if (typeof marker !== "object" || marker === null) return undefined;
  const { instanceId } = marker as Record<string, unknown>;
  return typeof instanceId === "string" ? instanceId : undefined;
}

export function withOwner(
  descriptor: ReactorDescriptor,
  instanceId: string,
): ReactorDescriptor {
  return { ...descriptor, ownedBy: { instanceId } } as ReactorDescriptor;
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

/** Whether the instance still serves the switchboard the descriptor links to. */
export function servesDescriptor(
  instance: Instance,
  descriptor: ManagedDescriptor,
): boolean {
  const graphql = managedUrl(instance, descriptor.managedBy);
  return (
    graphql !== undefined &&
    graphql === switchboardOfDrive(descriptor.remote.url)?.graphql
  );
}

/** The switchboard's link: its first drive by slug. */
function driveAddressOf(outputs: InstanceOutputs): string | undefined {
  const slug = Object.keys(outputs.drives).sort().at(0);
  return slug === undefined ? undefined : outputs.drives[slug].url;
}

/** One remote descriptor per switchboard a running instance serves; a
 * switchboard that reports no drive has no address to link by. */
export function managedDescriptors(
  instance: Instance,
  taken: Iterable<string>,
): ManagedDescriptor[] {
  if (instance.status !== "running") return [];
  const targets: [member: string | undefined, url: string | undefined][] = [];
  if (instance.outputs) {
    targets.push([undefined, driveAddressOf(instance.outputs)]);
  }
  for (const [member, entry] of Object.entries(instance.members ?? {})) {
    if (entry.outputs) targets.push([member, driveAddressOf(entry.outputs)]);
  }
  const names = new Set(taken);
  return targets.flatMap(([member, url]) => {
    if (url === undefined) return [];
    const name = managedName(instance, names, member);
    names.add(name);
    return [
      {
        kind: "remote",
        name,
        remote: { url, headers: () => remoteHeaders(url) },
        managedBy: {
          instanceId: instance.id,
          project: instance.project,
          host: instance.host,
          ...(member === undefined ? {} : { member }),
        },
      },
    ];
  });
}
