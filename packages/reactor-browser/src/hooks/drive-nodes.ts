import type { IDriveReadClient } from "@powerhousedao/reactor";
import type { Node } from "@powerhousedao/shared/document-drive";
import { logger } from "document-model";
import { useEffect } from "react";
import { listAllDriveNodes } from "../utils/nodes.js";
import { makePHEventFunctions } from "./make-ph-event-functions.js";
import type { PHStore } from "./ph-store.js";
import { getActivePHStore, getPHStore, usePHStore } from "./ph-store.js";

/** One drive's cached nodes, read through `read.drives`. */
export type DriveNodesEntry = {
  readonly byId: ReadonlyMap<string, Node>;
  /** "all" once a full listing landed; "partial" holds single fetches or a
   * listing being refreshed. */
  readonly loaded: "none" | "partial" | "all";
  /** The drive's nodes from the last full listing, kept while it refreshes. */
  readonly nodes?: Node[];
  readonly loading?: Promise<Node[]>;
  /** The drive changed while `loading` was in flight: that listing may miss
   * the change, so another one follows as soon as it lands. */
  readonly stale?: true;
  /** The last full listing failed; hooks do not retry until invalidated. */
  readonly error?: unknown;
};

/** Node caches by drive id; replaced, never mutated, so hooks see changes. */
export type DriveNodesCache = ReadonlyMap<string, DriveNodesEntry>;

export type DriveNodesOptions = {
  /** Skip the cache and read through `read.drives`. */
  refresh?: boolean;
  store?: PHStore;
};

const driveNodesEventFunctions = makePHEventFunctions("driveNodes");
/** Returns the per-drive node caches */
export const useDriveNodesCache = driveNodesEventFunctions.useValue;

/** Adds an event handler for the drive node cache */
export const addDriveNodesEventHandler =
  driveNodesEventFunctions.addEventHandler;

const mounted = new Map<string, number>();

function retain(driveId: string) {
  mounted.set(driveId, (mounted.get(driveId) ?? 0) + 1);
  return () => {
    const count = (mounted.get(driveId) ?? 1) - 1;
    if (count > 0) mounted.set(driveId, count);
    else mounted.delete(driveId);
  };
}

function driveReader(store: PHStore | undefined): IDriveReadClient {
  const read = store?.reactorClient?.read;
  if (read) return read.drives;
  throw new Error("The reactor client is not initialized");
}

function entryOf(store: PHStore | undefined, driveId: string) {
  return store?.driveNodes?.get(driveId);
}

function setEntry(
  store: PHStore | undefined,
  driveId: string,
  entry: DriveNodesEntry | undefined,
) {
  if (!store) return;
  const next = new Map(store.driveNodes);
  if (entry) next.set(driveId, entry);
  else next.delete(driveId);
  store.driveNodes = next;
  // A plain `window.ph` does not notify on assignment.
  if (
    !getActivePHStore() &&
    typeof window !== "undefined" &&
    store === window.ph
  ) {
    window.dispatchEvent(new CustomEvent("ph:driveNodesUpdated"));
  }
}

/** Loads every node of a drive into the cache, paging through
 * `read.drives.listNodes`; served from the cache once loaded. */
export function loadDriveNodes(
  driveId: string,
  options: DriveNodesOptions = {},
): Promise<Node[]> {
  const store = options.store ?? getPHStore();
  const current = entryOf(store, driveId);
  if (current?.loading) {
    // A refresh asked for during a listing lists again once it lands: the
    // one in flight may predate the change that asked for it.
    if (options.refresh && !current.stale) {
      setEntry(store, driveId, { ...current, stale: true });
    }
    return current.loading;
  }
  if (!options.refresh && current?.loaded === "all" && current.nodes) {
    return Promise.resolve(current.nodes);
  }
  const read = store?.reactorClient?.read;
  if (!read) {
    return Promise.reject(new Error("The reactor client is not initialized"));
  }
  const reader: IDriveReadClient = read.drives;
  const loading = listAllDriveNodes(reader, driveId);
  setEntry(store, driveId, {
    byId: current?.byId ?? new Map(),
    nodes: current?.nodes,
    loaded: current?.byId.size ? "partial" : "none",
    loading,
  });
  loading.then(
    (nodes) => {
      const settled = entryOf(store, driveId);
      if (settled?.loading !== loading) return;
      setEntry(store, driveId, {
        byId: new Map(nodes.map((n) => [n.id, n])),
        nodes,
        loaded: "all",
      });
      if (settled.stale) {
        if (mounted.has(driveId)) {
          loadDriveNodes(driveId, { store, refresh: true }).catch(
            (error: unknown) =>
              logger.error("Reloading drive nodes failed: @error", error),
          );
        } else {
          setEntry(store, driveId, undefined);
        }
      }
    },
    (error: unknown) => {
      const entry = entryOf(store, driveId);
      if (entry?.loading !== loading) return;
      setEntry(store, driveId, { ...entry, loading: undefined, error });
    },
  );
  return loading;
}

/** A node from the cache, else read through `read.drives.getNode`;
 * undefined when the drive does not hold it. */
export async function getDriveNode(
  driveId: string,
  nodeId: string,
  options: DriveNodesOptions = {},
): Promise<Node | undefined> {
  const store = options.store ?? getPHStore();
  const current = entryOf(store, driveId);
  if (!options.refresh && current) {
    const cached = current.byId.get(nodeId);
    if (cached || current.loaded === "all") return cached;
  }
  const reader = driveReader(store);
  let node: Node;
  try {
    node = await reader.getNode(driveId, nodeId);
  } catch {
    return undefined;
  }
  const entry = entryOf(store, driveId);
  const byId = new Map(entry?.byId);
  byId.set(node.id, node);
  setEntry(store, driveId, {
    ...entry,
    byId,
    nodes: entry?.nodes && replaceNode(entry.nodes, node),
    loaded: entry?.loaded === "all" ? "all" : "partial",
  });
  return node;
}

function replaceNode(nodes: Node[], node: Node) {
  const at = nodes.findIndex((n) => n.id === node.id);
  if (at < 0) return [...nodes, node];
  return nodes.map((n, i) => (i === at ? node : n));
}

/** A node from the cache only, without reading; for synchronous callers. */
export function peekDriveNode(
  driveId: string,
  nodeId: string,
  store: PHStore | undefined = getPHStore(),
): Node | undefined {
  return entryOf(store, driveId)?.byId.get(nodeId);
}

/** Drops a drive's cached nodes; while a hook shows them, they reload and
 * the old nodes stay visible until the new listing lands. */
export function invalidateDriveNodes(
  driveId: string,
  store: PHStore | undefined = getPHStore(),
) {
  const current = entryOf(store, driveId);
  if (!current) return;
  if (current.loading) {
    // The listing in flight may predate this change; another follows it.
    if (!current.stale) setEntry(store, driveId, { ...current, stale: true });
    return;
  }
  if (!mounted.has(driveId)) {
    setEntry(store, driveId, undefined);
    return;
  }
  setEntry(store, driveId, {
    byId: current.byId,
    nodes: current.nodes,
    loaded: "partial",
  });
  loadDriveNodes(driveId, { store }).catch((error: unknown) =>
    logger.error("Reloading drive nodes failed: @error", error),
  );
}

/** Drives this tab has just written to; their next change is read at once. */
const localDriveWrites = new Set<string>();

/**
 * Notes that this tab wrote to a drive, so the drive change handler re-reads
 * it on the change that follows instead of waiting out its interval: the
 * person who added, renamed or removed a node expects to see it, while a
 * drive being filled by someone else can wait.
 */
export function markLocalDriveWrite(driveId: string): void {
  localDriveWrites.add(driveId);
}

/** Spends a drive's local-write mark; true when one was set. */
export function takeLocalDriveWrite(driveId: string): boolean {
  return localDriveWrites.delete(driveId);
}

/** Takes a node out of a drive's cache after this tab removed it, so the
 * listing drops it at once instead of after the next drive refresh. */
export function dropDriveNode(
  driveId: string,
  nodeId: string,
  store: PHStore | undefined = getPHStore(),
) {
  const entry = entryOf(store, driveId);
  if (!entry?.byId.has(nodeId)) return;
  const byId = new Map(entry.byId);
  byId.delete(nodeId);
  setEntry(store, driveId, {
    ...entry,
    byId,
    nodes: entry.nodes?.filter((n) => n.id !== nodeId),
  });
}

function useDriveNodesEntry(driveId: string | null | undefined) {
  const store = usePHStore() ?? getPHStore();
  const cache = useDriveNodesCache();
  return [store, driveId ? cache?.get(driveId) : undefined] as const;
}

/** Every node of a drive, loaded on first use; undefined until loaded. */
export function useDriveNodes(
  driveId: string | null | undefined,
): Node[] | undefined {
  const [store, entry] = useDriveNodesEntry(driveId);
  const needsLoad =
    !!driveId && !entry?.loading && !entry?.error && entry?.loaded !== "all";

  useEffect(() => {
    if (!driveId) return;
    return retain(driveId);
  }, [driveId]);

  useEffect(() => {
    if (!driveId || !needsLoad) return;
    loadDriveNodes(driveId, { store }).catch((error: unknown) =>
      logger.error("Loading drive nodes failed: @error", error),
    );
  }, [driveId, needsLoad, store]);

  return entry?.nodes;
}

/** One node of a drive, from the cache or read on its own. */
export function useDriveNode(
  driveId: string | null | undefined,
  nodeId: string | null | undefined,
): Node | undefined {
  const [store, entry] = useDriveNodesEntry(driveId);
  const node = nodeId ? entry?.byId.get(nodeId) : undefined;
  const needsFetch =
    !!driveId &&
    !!nodeId &&
    !node &&
    entry?.loaded !== "all" &&
    !entry?.loading;

  useEffect(() => {
    if (!driveId) return;
    return retain(driveId);
  }, [driveId]);

  useEffect(() => {
    if (!driveId || !nodeId || !needsFetch) return;
    getDriveNode(driveId, nodeId, { store }).catch((error: unknown) =>
      logger.error("Loading drive node failed: @error", error),
    );
  }, [driveId, nodeId, needsFetch, store]);

  return node;
}
