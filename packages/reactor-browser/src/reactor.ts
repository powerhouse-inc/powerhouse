import type {
  DocumentChangeEvent,
  IReactorReadClient,
} from "@powerhousedao/reactor";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import {
  invalidateDriveNodes,
  takeLocalDriveWrite,
} from "./hooks/drive-nodes.js";
import { setDrives } from "./hooks/drives.js";
import { getPHStore } from "./hooks/ph-store.js";
import { DOCUMENT_CHANGE_TYPE } from "./reactor-interop.js";
import { getDrive, getDrives, listDriveIds } from "./utils/drives.js";

export type ReactorDefaultDrivesConfig = {
  defaultDrivesUrl?: string[];
};

export type RefreshReactorDataConfig = {
  debounceDelayMs?: number;
  immediateThresholdMs?: number;
};

const DEFAULT_DEBOUNCE_DELAY_MS = 200;
const DEFAULT_IMMEDIATE_THRESHOLD_MS = 1000;

async function _refreshReactorData(reactor: IReactorReadClient) {
  const drives = await getDrives(reactor);

  setDrives(drives);
}

async function _refreshReactorDataClient(
  reactor: IReactorReadClient | undefined,
) {
  if (!reactor) return;

  setDrives(await getDrives(reactor));
}

function createDebouncedRefreshReactorData(
  debounceDelayMs = DEFAULT_DEBOUNCE_DELAY_MS,
  immediateThresholdMs = DEFAULT_IMMEDIATE_THRESHOLD_MS,
) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let lastRefreshTime = 0;

  return (reactor: IReactorReadClient, immediate = false) => {
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshTime;

    if (timeout !== null) {
      clearTimeout(timeout);
    }

    if (immediate || timeSinceLastRefresh >= immediateThresholdMs) {
      lastRefreshTime = now;
      return _refreshReactorData(reactor);
    }

    return new Promise<void>((resolve) => {
      timeout = setTimeout(() => {
        lastRefreshTime = Date.now();
        void _refreshReactorData(reactor).then(resolve);
      }, debounceDelayMs);
    });
  };
}

function createDebouncedRefreshReactorDataClient(
  debounceDelayMs = DEFAULT_DEBOUNCE_DELAY_MS,
  immediateThresholdMs = DEFAULT_IMMEDIATE_THRESHOLD_MS,
) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let lastRefreshTime = 0;

  return (reactor: IReactorReadClient | undefined, immediate = false) => {
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshTime;

    if (timeout !== null) {
      clearTimeout(timeout);
    }

    if (immediate || timeSinceLastRefresh >= immediateThresholdMs) {
      lastRefreshTime = now;
      return _refreshReactorDataClient(reactor);
    }

    return new Promise<void>((resolve) => {
      timeout = setTimeout(() => {
        lastRefreshTime = Date.now();
        void _refreshReactorDataClient(reactor).then(resolve);
      }, debounceDelayMs);
    });
  };
}

export const refreshReactorData = createDebouncedRefreshReactorData();
export const refreshReactorDataClient =
  createDebouncedRefreshReactorDataClient();

/** How often one drive is re-read while it keeps changing (a drive being filled). */
const DEFAULT_DRIVE_REFRESH_MIN_INTERVAL_MS = 10_000;

function currentDrives(): DocumentDriveDocument[] | undefined {
  return getPHStore()?.drives;
}

/**
 * Re-reads one drive and replaces it in the drives store. Only that drive
 * crosses the wire: the list used to be re-fetched whole on any drive change,
 * every drive's node tree included, which on a large mail drive was ten
 * megabytes per change. Without a store (before init) the whole list loads.
 */
export async function refreshDrive(
  reactor: IReactorReadClient,
  driveId: string,
): Promise<void> {
  const drives = currentDrives();
  if (!drives) return _refreshReactorDataClient(reactor);
  const fresh = await getDrive(reactor, driveId);
  if (!fresh) {
    setDrives(drives.filter((d) => d.header.id !== driveId));
    return;
  }
  const at = drives.findIndex((d) => d.header.id === driveId);
  setDrives(
    at < 0 ? [...drives, fresh] : drives.map((d, i) => (i === at ? fresh : d)),
  );
}

/**
 * Brings the drives store in line with which drives exist: ids come from a
 * headers-only listing, a drive not held yet is loaded on its own, and a drive
 * no longer listed is dropped. Drives already held are kept as they are.
 */
export async function refreshDriveMembership(
  reactor: IReactorReadClient,
): Promise<void> {
  const drives = currentDrives();
  if (!drives) return _refreshReactorDataClient(reactor);
  const ids = await listDriveIds(reactor);
  const known = new Map(drives.map((d) => [d.header.id, d]));
  const added = await Promise.all(
    ids.filter((id) => !known.has(id)).map((id) => getDrive(reactor, id)),
  );
  const loaded = new Map(
    added
      .filter((d): d is DocumentDriveDocument => d !== undefined)
      .map((d) => [d.header.id, d]),
  );
  setDrives(
    ids
      .map((id) => known.get(id) ?? loaded.get(id))
      .filter((d): d is DocumentDriveDocument => d !== undefined),
  );
}

export type DriveChangeHandlerOptions = {
  /** The least time between two re-reads of the same drive; default 10 s. */
  minIntervalMs?: number;
  onError?: (error: unknown) => void;
};

/**
 * Routes a drive-type document change to the smallest refresh: an update
 * re-reads that one drive and invalidates its node cache, at most once per
 * `minIntervalMs` while it keeps changing (at once after a write from this
 * tab, see `markLocalDriveWrite`); a creation or deletion refreshes the
 * membership and loads only what is new.
 */
export function createDriveChangeHandler(
  reactor: IReactorReadClient,
  options: DriveChangeHandlerOptions = {},
): (event: DocumentChangeEvent) => void {
  const minIntervalMs =
    options.minIntervalMs ?? DEFAULT_DRIVE_REFRESH_MIN_INTERVAL_MS;
  const onError = options.onError ?? (() => undefined);
  const lastAt = new Map<string, number>();
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  const run = (driveId: string) => {
    lastAt.set(driveId, Date.now());
    const timer = pending.get(driveId);
    if (timer !== undefined) clearTimeout(timer);
    pending.delete(driveId);
    refreshDrive(reactor, driveId)
      .then(() => invalidateDriveNodes(driveId))
      .catch(onError);
  };
  const schedule = (driveId: string) => {
    if (takeLocalDriveWrite(driveId)) {
      run(driveId);
      return;
    }
    if (pending.has(driveId)) return;
    const wait = (lastAt.get(driveId) ?? 0) + minIntervalMs - Date.now();
    if (wait <= 0) {
      run(driveId);
      return;
    }
    pending.set(
      driveId,
      setTimeout(() => run(driveId), wait),
    );
  };

  return (event) => {
    if (event.type === DOCUMENT_CHANGE_TYPE.Updated) {
      for (const document of event.documents) schedule(document.header.id);
      return;
    }
    refreshDriveMembership(reactor).catch(onError);
  };
}
