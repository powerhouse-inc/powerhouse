/**
 * The drives (collections) a reactor holds, with their remote URL, drive-state
 * summary and node counts, plus an on-demand integrity check (multi-reactor
 * §1). Reads the inspection surface's `listDrives` / `checkDriveIntegrity`, so
 * it works for local, worker and remote reactors alike.
 *
 * The remote URLs are JOINED from the sync manager's already-served remote list
 * rather than re-fetched: a remote's `meta.collectionId` names the drive and
 * branch it synchronizes, and its `channelConfig.parameters.url` is the URL. A
 * drive synced to more than one remote shows ALL of them, never one picked as
 * authoritative.
 *
 * Plain CSS and a poll loop, forked from QueueTab/SyncTab (see QueueTab's
 * header note); large drives are paged the way SyncTab pages dead letters.
 */
import type {
  IInspector,
  InspectableSyncManager,
  InspectorDriveInfo,
  InspectorDriveIntegrity,
  Remote,
} from "@powerhousedao/reactor";
import { useCallback, useEffect, useState } from "react";

export type DrivesTabProps = {
  readonly inspector: IInspector;
  readonly syncManager: InspectableSyncManager | undefined;
};

const POLL_INTERVAL_MS = 2000;
const PAGE_SIZE = 25;

function collectionKey(driveId: string, branch: string): string {
  return `${driveId}::${branch}`;
}

function remoteUrl(remote: Remote): string | undefined {
  const url = remote.meta.channelConfig.parameters.url;
  return typeof url === "string" ? url : undefined;
}

function IntegrityResult({ result }: { result: InspectorDriveIntegrity }) {
  return (
    <div className="rm-kv rm-kv-compact" data-testid="drive-integrity-result">
      <dt>Checked file nodes</dt>
      <dd>
        {result.checkedNodeCount} of {result.totalFileNodeCount}
      </dd>
      <dt>Missing documents</dt>
      <dd data-testid="drive-integrity-missing">
        {result.missingDocuments.length === 0
          ? "none"
          : result.missingDocuments
              .map((ref) => `${ref.id} (${ref.documentType})`)
              .join(", ")}
      </dd>
      <dt>Unsupported types</dt>
      <dd data-testid="drive-integrity-unsupported">
        {result.unsupportedTypes.length === 0
          ? "none"
          : result.unsupportedTypes
              .map((ref) => `${ref.id} (${ref.documentType})`)
              .join(", ")}
      </dd>
    </div>
  );
}

export function DrivesTab({ inspector, syncManager }: DrivesTabProps) {
  const [drives, setDrives] = useState<InspectorDriveInfo[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [paged, setPaged] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [remoteUrls, setRemoteUrls] = useState<Map<string, string[]>>(
    new Map(),
  );
  const [integrity, setIntegrity] = useState<
    Map<string, InspectorDriveIntegrity>
  >(new Map());
  const [integrityError, setIntegrityError] = useState<Map<string, string>>(
    new Map(),
  );

  const refreshRemotes = useCallback(() => {
    if (!syncManager) {
      return;
    }
    const map = new Map<string, string[]>();
    for (const remote of syncManager.list()) {
      const url = remoteUrl(remote);
      if (!url) {
        continue;
      }
      const key = collectionKey(
        remote.meta.collectionId.driveId,
        remote.meta.collectionId.branch,
      );
      const urls = map.get(key);
      if (urls) {
        if (!urls.includes(url)) {
          urls.push(url);
        }
      } else {
        map.set(key, [url]);
      }
    }
    setRemoteUrls(map);
  }, [syncManager]);

  const loadFirst = useCallback(async () => {
    try {
      const page = await inspector.listDrives(undefined, PAGE_SIZE);
      setDrives(page.results);
      setNextCursor(page.nextCursor);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
    refreshRemotes();
  }, [inspector, refreshRemotes]);

  const loadMore = useCallback(async () => {
    if (nextCursor === undefined) {
      return;
    }
    setPaged(true);
    try {
      const page = await inspector.listDrives(nextCursor, PAGE_SIZE);
      setDrives((previous) => [...previous, ...page.results]);
      setNextCursor(page.nextCursor);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [inspector, nextCursor]);

  useEffect(() => {
    // Polling resets to the first page, so it is suspended once the operator
    // has paged into a large reactor -- the same tension SyncTab's dead-letter
    // paging resolves by not re-polling an expanded list.
    if (paged) {
      return;
    }
    // eslint-disable-next-line react-hooks-extra/set-state-in-effect
    void loadFirst();
    const interval = setInterval(() => void loadFirst(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadFirst, paged]);

  const runIntegrity = useCallback(
    async (driveId: string, branch: string) => {
      try {
        const result = await inspector.checkDriveIntegrity(driveId, branch);
        setIntegrity((previous) => {
          const next = new Map(previous);
          next.set(driveId, result);
          return next;
        });
        setIntegrityError((previous) => {
          if (!previous.has(driveId)) {
            return previous;
          }
          const next = new Map(previous);
          next.delete(driveId);
          return next;
        });
      } catch (e) {
        setIntegrityError((previous) => {
          const next = new Map(previous);
          next.set(driveId, e instanceof Error ? e.message : String(e));
          return next;
        });
      }
    },
    [inspector],
  );

  return (
    <div className="rm-tab">
      <div className="rm-tab-header">
        <h2>Drives</h2>
        <div className="rm-actions">
          <button
            className="rm-btn"
            disabled={loading}
            onClick={() => {
              setPaged(false);
              setLoading(true);
              void loadFirst();
            }}
            type="button"
          >
            Refresh
          </button>
        </div>
      </div>

      {error ? <p className="rm-error">{error}</p> : null}

      <div className="rm-stat-bar" data-testid="drives-counts">
        <span>
          Drives shown: <strong>{drives.length}</strong>
        </span>
      </div>

      <p className="rm-note" data-testid="drives-branch-note">
        Lists main-branch drives; the reactor enumerates collections by type on
        the main branch.
      </p>

      {loading && drives.length === 0 ? (
        <p className="rm-placeholder">Loading...</p>
      ) : drives.length === 0 ? (
        <p className="rm-placeholder" data-testid="drives-empty-state">
          No drives on this reactor.
        </p>
      ) : (
        <ul className="rm-remote-list">
          {drives.map((drive) => {
            const urls =
              remoteUrls.get(collectionKey(drive.driveId, drive.branch)) ?? [];
            const result = integrity.get(drive.driveId);
            const integrityMessage = integrityError.get(drive.driveId);
            return (
              <li
                className="rm-remote"
                data-testid="drives-row"
                key={drive.collectionId}
              >
                <div className="rm-remote-header">
                  <strong>{drive.name}</strong>
                  <span className="rm-badge">{drive.branch}</span>
                  <button
                    className="rm-btn"
                    onClick={() =>
                      void runIntegrity(drive.driveId, drive.branch)
                    }
                    type="button"
                  >
                    Check integrity
                  </button>
                </div>
                <dl className="rm-kv rm-kv-compact">
                  <dt>Drive ID</dt>
                  <dd>
                    <code>{drive.driveId}</code>
                  </dd>
                  <dt>Collection</dt>
                  <dd>
                    <code>{drive.collectionId}</code>
                  </dd>
                  <dt>Document type</dt>
                  <dd>{drive.documentType}</dd>
                  <dt>Remote URL{urls.length > 1 ? "s" : ""}</dt>
                  <dd data-testid="drive-remote-url">
                    {urls.length === 0
                      ? "none (local-only or not synced)"
                      : urls.length === 1
                        ? urls[0]
                        : `${urls.length} remotes: ${urls.join(", ")}`}
                  </dd>
                  <dt>Nodes</dt>
                  <dd>
                    {drive.nodeCount} ({drive.fileCount} files,{" "}
                    {drive.folderCount} folders
                    {drive.otherNodeCount > 0
                      ? `, ${drive.otherNodeCount} other`
                      : ""}
                    {drive.unreadableNodeCount > 0
                      ? `, ${drive.unreadableNodeCount} unreadable`
                      : ""}
                    )
                  </dd>
                </dl>
                {integrityMessage ? (
                  <p className="rm-error" role="alert">
                    Integrity check failed: {integrityMessage}
                  </p>
                ) : null}
                {result ? <IntegrityResult result={result} /> : null}
              </li>
            );
          })}
        </ul>
      )}

      {nextCursor !== undefined ? (
        <button
          className="rm-btn"
          data-testid="drives-load-more"
          onClick={() => void loadMore()}
          type="button"
        >
          Load more drives
        </button>
      ) : null}
    </div>
  );
}

export default DrivesTab;
