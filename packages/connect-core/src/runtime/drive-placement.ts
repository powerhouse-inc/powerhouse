import { DriveCollectionId } from "@powerhousedao/reactor";
import type {
  PHConnectCollection,
  PHConnectRemoteBackend,
  PHConnectRuntimeDefaultDrive,
} from "@powerhousedao/shared/clis";
import { switchboardOfDrive } from "@powerhousedao/shared/host-tokens";
import { logger } from "document-model";

/** The router backend of the reactor in this browser. */
export const LOCAL_BACKEND_NAME = "connect-local";

/** A drive the host keeps on a switchboard, and where its config opens it. */
export type SwitchboardDrive = {
  /** The host's name for it: its address's slug, or a collection's key. */
  slug: string;
  url: string;
  /** The switchboard's backend. */
  remote: string;
  /** `remote` (no copy here) or `LOCAL_BACKEND_NAME` (a synced copy). */
  configured: string;
  /** Not a default drive: its address may not be the one it is served at. */
  collection: boolean;
};

/** A switchboard drive with the names callers reach it by. */
export type ResolvedSwitchboardDrive = SwitchboardDrive & {
  id?: string;
  servedSlug?: string;
};

/** A drive this browser moved away from its host config. */
export type PlacementEntry = {
  slug: string;
  backend: string;
  configWas: string;
};

type PlacementConfig = {
  drives?: { defaultDrives?: readonly PHConnectRuntimeDefaultDrive[] };
  instance?: {
    remoteBackends?: readonly PHConnectRemoteBackend[];
    collections?: Record<string, PHConnectCollection>;
  };
};

/** The config's local default drives, placed on this browser so a
 * switchboard `newDrives` doesn't take them. */
export function localDrivePlacements(
  defaultDrives: readonly PHConnectRuntimeDefaultDrive[],
): Record<string, string> {
  return Object.fromEntries(
    defaultDrives.flatMap((drive) =>
      !("url" in drive) && drive.id ? [[drive.id, LOCAL_BACKEND_NAME]] : [],
    ),
  );
}

export function keepsLocalCopy(drive: PHConnectRuntimeDefaultDrive): boolean {
  return !("url" in drive) || drive.sync !== false;
}

/** Remote default drives with a backend, then collections. */
export function switchboardDrives(config: PlacementConfig): SwitchboardDrive[] {
  const drives: SwitchboardDrive[] = [];
  for (const drive of config.drives?.defaultDrives ?? []) {
    if (!("url" in drive) || !drive.backend) continue;
    const slug = switchboardOfDrive(drive.url)?.slug;
    if (slug === undefined) continue;
    drives.push({
      slug,
      url: drive.url,
      remote: drive.backend,
      configured: drive.sync === false ? drive.backend : LOCAL_BACKEND_NAME,
      collection: false,
    });
  }
  const remotes = config.instance?.remoteBackends ?? [];
  for (const [slug, entry] of Object.entries(
    config.instance?.collections ?? {},
  )) {
    const remote = remotes.find((r) => r.name === entry.backend);
    const base = remote && switchboardOfDrive(remote.url)?.base;
    if (!base || drives.some((drive) => drive.slug === slug)) continue;
    drives.push({
      slug,
      url: `${base}/d/${encodeURIComponent(slug)}`,
      remote: entry.backend,
      configured: entry.sync === false ? entry.backend : LOCAL_BACKEND_NAME,
      collection: true,
    });
  }
  return drives;
}

/** Stale: no such drive, a backend it can't open on, back to config, or a changed config value. */
export function applyPlacementEntries(
  drives: readonly SwitchboardDrive[],
  entries: readonly PlacementEntry[],
): { applied: PlacementEntry[]; stale: PlacementEntry[] } {
  const applied: PlacementEntry[] = [];
  const stale: PlacementEntry[] = [];
  for (const entry of entries) {
    const drive = drives.find((d) => d.slug === entry.slug);
    const holds =
      drive !== undefined &&
      entry.configWas === drive.configured &&
      entry.backend !== drive.configured &&
      (entry.backend === drive.remote || entry.backend === LOCAL_BACKEND_NAME);
    (holds ? applied : stale).push(entry);
  }
  return { applied, stale };
}

/** A served slug names a declared one as is, or hashed (`<slug>-<8 hex>`). */
export function servesSlug(declared: string, served: string): boolean {
  return (
    served === declared ||
    (served.startsWith(`${declared}-`) &&
      /^[0-9a-f]{8}$/.test(served.slice(declared.length + 1)))
  );
}

type DriveNames = { id: string; slug: string };

function withinDeadline<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`no answer in ${timeoutMs} ms`)),
      timeoutMs,
    );
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

export type ResolveSwitchboardDrivesOptions = {
  timeoutMs?: number;
  /** A collection whose address does not answer: find it among its switchboard's drives. */
  findServed?: (drive: SwitchboardDrive) => Promise<DriveNames | undefined>;
};

/** An unreachable drive keeps only the slug in its address. */
export async function resolveSwitchboardDrives(
  drives: readonly SwitchboardDrive[],
  fetchInfo: (url: string) => Promise<DriveNames>,
  { timeoutMs = 5_000, findServed }: ResolveSwitchboardDrivesOptions = {},
): Promise<ResolvedSwitchboardDrive[]> {
  return Promise.all(
    drives.map(async (drive): Promise<ResolvedSwitchboardDrive> => {
      try {
        const { id, slug } = await withinDeadline(
          fetchInfo(drive.url),
          timeoutMs,
        );
        return { ...drive, id, servedSlug: slug };
      } catch (error) {
        if (drive.collection && findServed) {
          try {
            const served = await withinDeadline(findServed(drive), timeoutMs);
            if (served) {
              return { ...drive, id: served.id, servedSlug: served.slug };
            }
          } catch (findError) {
            logger.warn(
              "Could not find drive @slug on @remote: @error",
              drive.slug,
              drive.remote,
              findError,
            );
          }
        }
        logger.warn(
          "Could not read drive @url; routing it by its address only: @error",
          drive.url,
          error,
        );
        const slug = switchboardOfDrive(drive.url)?.slug;
        return slug === undefined ? drive : { ...drive, servedSlug: slug };
      }
    }),
  );
}

/** The address the drive is served at. */
export function servedUrl(drive: ResolvedSwitchboardDrive): string {
  const at = switchboardOfDrive(drive.url);
  return at && drive.servedSlug && drive.servedSlug !== at.slug
    ? `${at.base}/d/${encodeURIComponent(drive.servedSlug)}`
    : drive.url;
}

/** The keys a placement is installed under: the id and the served slug. */
export function placementKeys(drive: ResolvedSwitchboardDrive): string[] {
  return [drive.id, drive.servedSlug].filter(
    (key): key is string => key !== undefined && key !== "",
  );
}

export type SyncRemotes = {
  list(): readonly {
    meta: { name: string; collectionId: DriveCollectionId };
  }[];
  remove(name: string): Promise<void>;
};

/** Drops the sync remote of every given drive; its local data is left unread. */
export async function removeLocalCopies(
  sync: SyncRemotes,
  resolved: readonly { id?: string }[],
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
