import type { ReactorDescriptor } from "@powerhousedao/reactor-monitor";
import { remoteHeaders } from "../provisioning.js";
import type { Instance } from "./api.js";

/** Marks a remote descriptor whose switchboard the controller runs. */
export interface ManagedBy {
  instanceId: string;
  project: string;
  host: string;
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
  const { instanceId, project, host } = marker as Record<string, unknown>;
  if (
    typeof instanceId !== "string" ||
    typeof project !== "string" ||
    typeof host !== "string"
  ) {
    return undefined;
  }
  return { instanceId, project, host };
}

export function isManaged(
  descriptor: ReactorDescriptor,
): descriptor is ManagedDescriptor {
  return managedByOf(descriptor) !== undefined;
}

/** `<host>-<id prefix>`, suffixed until no name in `taken` collides. */
export function managedName(
  instance: Instance,
  taken: Iterable<string>,
): string {
  const names = new Set(taken);
  const base = `${instance.host}-${instance.id.slice(0, 8)}`;
  let name = base;
  for (let n = 2; names.has(name); n++) name = `${base}-${n}`;
  return name;
}

/** The remote descriptor for a running instance with outputs. */
export function managedDescriptor(
  instance: Instance,
  taken: Iterable<string>,
): ManagedDescriptor | undefined {
  if (instance.status !== "running" || !instance.outputs) return undefined;
  const url = instance.outputs.graphql;
  return {
    kind: "remote",
    name: managedName(instance, taken),
    remote: { url, headers: () => remoteHeaders(url) },
    managedBy: {
      instanceId: instance.id,
      project: instance.project,
      host: instance.host,
    },
  };
}
