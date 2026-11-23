import { probeHostsFolder } from "@powerhousedao/host-core";
import {
  DEV_HOST,
  LEGACY_DEV_HOST,
} from "@powerhousedao/shared/clis/constants";

/** A host `ph dev` runs: the compound over a switchboard and a Connect. */
export type DevHost = typeof DEV_HOST | typeof LEGACY_DEV_HOST;

export const isDevHost = (host: string): host is DevHost =>
  host === DEV_HOST || host === LEGACY_DEV_HOST;

/**
 * The host `ph dev` and `ph mcp` run in this project: hosts/dev, or
 * hosts/vetra in a project that has it and no hosts/dev.
 */
export function devHostOf(projectRoot: string): DevHost {
  const probe = probeHostsFolder(projectRoot);
  return probe.kind === "present" &&
    probe.hosts.includes(LEGACY_DEV_HOST) &&
    !probe.hosts.includes(DEV_HOST)
    ? LEGACY_DEV_HOST
    : DEV_HOST;
}
