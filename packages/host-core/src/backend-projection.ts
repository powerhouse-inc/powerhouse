import type {
  ReactorBackend,
  ReactorBackendKind,
  ReactorConfig,
  ReactorProtocol,
} from "./host-schemas.js";

/**
 * Phase 4 (track R): project named host backends onto reactor-monitor's
 * `ReactorDescriptor` shape — the input `provision()` takes. Pure and
 * dependency-free; a type-assignability test pins the output to the real
 * `ReactorDescriptor` so an upstream field rename fails this package's tests
 * instead of silently drifting (D2.b: aligned locally, upstreaming not
 * blocked on).
 */

/** The browser-provisionable storage union — reactor-monitor's
 * `ReactorStorageConfig` shape. `postgres` is the SERVER extension (D2.b): a
 * switchboard backend's storage, never a provisioned browser reactor's. */
export type ProjectedStorage =
  | { kind: "idb" }
  | { kind: "memory" }
  | { kind: "path"; dataDir: string };

export interface ProjectedDescriptor {
  kind: "in-process" | "worker" | "remote";
  name: string;
  storage?: ProjectedStorage;
  packages?: { cdnUrl?: string; specs?: string[]; dynamic?: boolean };
  featureFlags?: {
    documentDecisions?: boolean;
    authEnforcement?: boolean;
    authGroups?: boolean;
    authConditions?: boolean;
  };
  remote?: { url: string };
}

function projectStorage(
  name: string,
  storage: NonNullable<ReactorBackend["storage"]>,
): ProjectedStorage {
  switch (storage.kind) {
    case "idb":
      return { kind: "idb" };
    case "memory":
      return { kind: "memory" };
    case "path": {
      if (!storage.dataDir) {
        throw new Error(
          `Backend "${name}": storage kind "path" requires dataDir.`,
        );
      }
      return { kind: "path", dataDir: storage.dataDir };
    }
    case "postgres":
      throw new Error(
        `Backend "${name}": storage kind "postgres" is server-side only — ` +
          `a provisioned (in-process/worker) reactor cannot use it. Point a ` +
          `"remote" backend at the switchboard that owns that database instead.`,
      );
  }
}

/** One backend → one descriptor. The protocol's featureFlags ride every
 * descriptor (they are fleet consensus, not per-backend). A remote backend
 * must carry remote.url — provision() requires it. */
export function backendToDescriptor(
  name: string,
  backend: ReactorBackend,
  protocol?: ReactorProtocol,
): ProjectedDescriptor {
  const descriptor: ProjectedDescriptor = {
    kind: backend.kind,
    name,
  };
  if (descriptor.kind === "remote") {
    const url = backend.remote?.url;
    if (!url) {
      throw new Error(
        `Backend "${name}" is kind "remote" but has no remote.url — ` +
          `a remote descriptor attaches to an already-running reactor by URL.`,
      );
    }
    descriptor.remote = { url };
    // remote attaches; it builds nothing, so local-build fields do not apply
    return descriptor;
  }
  if (backend.storage) {
    descriptor.storage = projectStorage(name, backend.storage);
  }
  if (backend.packages) descriptor.packages = backend.packages;
  if (protocol?.featureFlags) descriptor.featureFlags = protocol.featureFlags;
  return descriptor;
}

/** All named backends, in placement-primary-first order (the order a
 * createReactorClients step would provision them). */
export function backendsToDescriptors(
  reactor: ReactorConfig | undefined,
): ProjectedDescriptor[] {
  const backends = reactor?.backends;
  if (!backends) return [];
  const names = Object.keys(backends);
  const primary = reactor.placement?.primary;
  const ordered =
    primary && names.includes(primary)
      ? [primary, ...names.filter((n) => n !== primary)]
      : names;
  return ordered.map((name) =>
    backendToDescriptor(name, backends[name], reactor.protocol),
  );
}

const LOCAL_KINDS = new Set<ReactorBackendKind>(["in-process", "worker"]);

/**
 * Structural multi-reactor (phase 4): true when the block names BOTH a local
 * backend (in-process/worker — the tab's own reactor) and a remote one. This
 * is the shape Connect's routing client serves; a lone remote backend is an
 * attach-only host (assistant/agent shape), not a routed tab.
 */
export function isStructuralMultiReactor(
  reactor: ReactorConfig | undefined,
): boolean {
  const backends = reactor?.backends;
  if (!backends) return false;
  const kinds = Object.values(backends).map((b) => b.kind);
  return (
    kinds.some((k) => LOCAL_KINDS.has(k)) && kinds.some((k) => k === "remote")
  );
}

/** The remote backends' drive addresses, placement order. */
export function remoteBackendUrls(
  reactor: ReactorConfig | undefined,
): string[] {
  return backendsToDescriptors(reactor)
    .filter((d) => d.kind === "remote")
    .map((d) => d.remote?.url)
    .filter((u): u is string => typeof u === "string");
}

/** A switchboard as Connect's served config names it, with its connection settings. */
export type ServedRemoteBackend = { name: string; url: string } & Omit<
  NonNullable<ReactorBackend["remote"]>,
  "url"
>;

/**
 * The remote backends by host key, placement order, each with the
 * connection settings it sets. A url that is not a string yet (an output
 * token, unresolved when a host builds) is skipped, as in remoteBackendUrls.
 */
export function remoteBackends(
  reactor: ReactorConfig | undefined,
): ServedRemoteBackend[] {
  return backendsToDescriptors(reactor).flatMap((d) => {
    const remote = reactor?.backends?.[d.name]?.remote;
    if (d.kind !== "remote" || typeof d.remote?.url !== "string" || !remote) {
      return [];
    }
    const { requestTimeoutMs, breaker, realtime } = remote;
    return [
      {
        name: d.name,
        url: d.remote.url,
        ...(requestTimeoutMs !== undefined ? { requestTimeoutMs } : {}),
        ...(breaker !== undefined ? { breaker } : {}),
        ...(realtime !== undefined ? { realtime } : {}),
      },
    ];
  });
}
