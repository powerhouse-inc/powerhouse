import { DriveCollectionId } from "@powerhousedao/reactor";
import type {
  PHConnectCollection,
  PHConnectRemoteBackend,
  PHConnectRuntimeDefaultDrive,
} from "@powerhousedao/shared/clis";
import { switchboardOfDrive } from "@powerhousedao/shared/host-tokens";
import { logger } from "document-model";

/** A drive the host opens on a switchboard, with no copy in this browser. */
export type PlacedDrive = { backend: string; url: string };

/** A placed drive with the names callers reach it by. */
export type ResolvedPlacedDrive = PlacedDrive & { id?: string; slug?: string };

type PlacementConfig = {
  drives?: { defaultDrives?: readonly PHConnectRuntimeDefaultDrive[] };
  instance?: {
    remoteBackends?: readonly PHConnectRemoteBackend[];
    collections?: Record<string, PHConnectCollection>;
  };
};

export function keepsLocalCopy(drive: PHConnectRuntimeDefaultDrive): boolean {
  return !("url" in drive) || drive.sync !== false;
}

/** `sync: false` default drives, then `sync: false` collections. */
export function placedDrives(config: PlacementConfig): PlacedDrive[] {
  const placed: PlacedDrive[] = [];
  for (const drive of config.drives?.defaultDrives ?? []) {
    if ("url" in drive && drive.sync === false && drive.backend) {
      placed.push({ backend: drive.backend, url: drive.url });
    }
  }
  const remotes = config.instance?.remoteBackends ?? [];
  for (const [slug, entry] of Object.entries(
    config.instance?.collections ?? {},
  )) {
    if (entry.sync !== false) continue;
    const remote = remotes.find((r) => r.name === entry.backend);
    const base = remote && switchboardOfDrive(remote.url)?.base;
    if (!base) continue;
    placed.push({
      backend: entry.backend,
      url: `${base}/d/${encodeURIComponent(slug)}`,
    });
  }
  return placed;
}

/** An unreachable drive keeps only the slug in its address. */
export async function resolvePlacedDrives(
  placed: readonly PlacedDrive[],
  fetchInfo: (url: string) => Promise<{ id: string; slug: string }>,
  timeoutMs = 5_000,
): Promise<ResolvedPlacedDrive[]> {
  return Promise.all(
    placed.map(async (drive) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`no answer in ${timeoutMs} ms`)),
          timeoutMs,
        );
      });
      try {
        const { id, slug } = await Promise.race([
          fetchInfo(drive.url),
          deadline,
        ]);
        return { ...drive, id, slug };
      } catch (error) {
        logger.warn(
          "Could not read placed drive @url; routing it by its address only: @error",
          drive.url,
          error,
        );
        const slug = switchboardOfDrive(drive.url)?.slug;
        return slug === undefined ? drive : { ...drive, slug };
      } finally {
        clearTimeout(timer);
      }
    }),
  );
}

/** Router `collections` overrides, under both the id and the served slug. */
export function placementCollections(
  resolved: readonly ResolvedPlacedDrive[],
): Record<string, string> {
  const collections: Record<string, string> = {};
  for (const drive of resolved) {
    if (drive.id) collections[drive.id] = drive.backend;
    if (drive.slug) collections[drive.slug] = drive.backend;
  }
  return collections;
}

type SyncRemotes = {
  list(): readonly {
    meta: { name: string; collectionId: DriveCollectionId };
  }[];
  remove(name: string): Promise<void>;
};

/** Drops the sync remote of every placed drive; its local data is left unread. */
export async function removeLocalCopies(
  sync: SyncRemotes,
  resolved: readonly ResolvedPlacedDrive[],
): Promise<void> {
  for (const drive of resolved) {
    if (!drive.id) continue;
    const collectionId = DriveCollectionId.forDrive(drive.id);
    const remotes = sync
      .list()
      .filter((remote) => remote.meta.collectionId.equals(collectionId));
    for (const remote of remotes) {
      await sync.remove(remote.meta.name);
    }
  }
}
