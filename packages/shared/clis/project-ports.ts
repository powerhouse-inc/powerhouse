import fnv1a from "@sindresorhus/fnv1a";
import {
  PROJECT_PORT_BAND_SIZE,
  PROJECT_PORT_BAND_STUDIO,
  PROJECT_PORT_BAND_SWITCHBOARD,
  PROJECT_PORT_BAND_VETRA_CONNECT,
} from "./constants.js";

export type ProjectPorts = {
  switchboardPort: number;
  studioPort: number;
  vetraConnectPort: number;
};

const BANDS = [
  PROJECT_PORT_BAND_SWITCHBOARD,
  PROJECT_PORT_BAND_STUDIO,
  PROJECT_PORT_BAND_VETRA_CONNECT,
] as const;

function inclusive(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/**
 * Offsets whose derived port would land on something a developer machine
 * plausibly already holds. Skipped rather than assigned, so a project never
 * starts life needing a port override.
 *
 * Two sources: ports the Powerhouse repos themselves reference inside these
 * bands, and well-known services. Being generous here is nearly free — the
 * whole list costs 83 of 1000 offsets.
 */
export const PROJECT_PORT_DENYLIST: ReadonlySet<number> = new Set<number>([
  // 2000 band
  2000, // Cisco SCCP
  2049, // NFS
  2181, // ZooKeeper
  2222, // alternate SSH
  2375,
  2376,
  2377, // Docker daemon and Swarm
  2483,
  2484, // Oracle DB
  // 6000 band
  ...inclusive(6000, 6063), // X11 TCP listeners
  6006, // Storybook / TensorBoard
  6060, // Go pprof
  6100,
  6200,
  6300,
  6500, // referenced elsewhere in the Powerhouse repos
  6379, // Redis
  6443, // Kubernetes API server
  6666,
  6667, // IRC
  // 7000 band
  7000,
  7001, // macOS AirPlay receiver / Cassandra
  7077, // Spark
  7474,
  7687, // Neo4j HTTP and Bolt
  7777, // referenced elsewhere in the Powerhouse repos
]);

function portsForOffset(offset: number): ProjectPorts {
  return {
    switchboardPort: PROJECT_PORT_BAND_SWITCHBOARD + offset,
    studioPort: PROJECT_PORT_BAND_STUDIO + offset,
    vetraConnectPort: PROJECT_PORT_BAND_VETRA_CONNECT + offset,
  };
}

/**
 * Derive a project's dev-server port triple from its package name.
 *
 * Name-derived rather than path-derived on purpose: the switchboard port is
 * written literally into the project's committed `.mcp.json`, because an MCP
 * client resolves that file at session start and cannot read the project
 * config or `.env`. A path-derived value would differ on every machine that
 * clones the repo.
 *
 * The three ports share one offset, so a project's numbers end in the same
 * three digits (`my-package` gets 7834 / 6834 / 2834). When any of the three
 * would hit {@link PROJECT_PORT_DENYLIST}, the offset advances deterministically
 * until all three are clear — so the result stays reproducible from the name
 * alone.
 */
export function deriveProjectPorts(projectName: string): ProjectPorts {
  if (!projectName.trim()) {
    throw new Error("A project name is required to derive project ports.");
  }
  const start = Number(
    fnv1a(projectName, { size: 32 }) % BigInt(PROJECT_PORT_BAND_SIZE),
  );
  for (let step = 0; step < PROJECT_PORT_BAND_SIZE; step++) {
    const offset = (start + step) % PROJECT_PORT_BAND_SIZE;
    const ports = portsForOffset(offset);
    if (!Object.values(ports).some((port) => PROJECT_PORT_DENYLIST.has(port))) {
      return ports;
    }
  }
  // Unreachable: the denylist covers far fewer offsets than the band holds.
  throw new Error(
    `No free port offset for project "${projectName}" — every offset in the ` +
      `${PROJECT_PORT_BAND_SIZE}-wide band is denied.`,
  );
}

/** Every port this scheme can hand out, for cross-checking against other tools. */
export function projectPortBands(): { from: number; to: number }[] {
  return BANDS.map((base) => ({
    from: base,
    to: base + PROJECT_PORT_BAND_SIZE - 1,
  }));
}
