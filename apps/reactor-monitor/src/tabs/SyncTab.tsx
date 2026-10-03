import {
  DriveCollectionId,
  type ISyncManager,
  type Remote,
} from "@powerhousedao/reactor";
import { useCallback, useEffect, useState } from "react";
import { isConnectionLying } from "../lib/sync-health.js";
import { timeSince } from "../lib/time.js";

export type SyncTabProps = {
  readonly syncManager: ISyncManager | undefined;
};

const POLL_INTERVAL_MS = 2000;

function channelUrl(remote: Remote): string | undefined {
  const url = remote.meta.channelConfig.parameters.url;
  return typeof url === "string" ? url : undefined;
}

function RemoteRow({
  remote,
  onTriggerPull,
}: {
  remote: Remote;
  onTriggerPull: (name: string) => void;
}) {
  const snapshot = remote.channel.getConnectionState();
  const lying = isConnectionLying(snapshot);

  return (
    <li className={lying ? "rm-remote rm-remote-warning" : "rm-remote"}>
      <div className="rm-remote-header">
        <strong>{remote.meta.name}</strong>
        <span className="rm-badge">{remote.meta.channelConfig.type}</span>
        <span
          className={
            snapshot.state === "connected" && !lying
              ? "rm-badge rm-badge-ok"
              : snapshot.state === "error"
                ? "rm-badge rm-badge-error"
                : "rm-badge"
          }
        >
          {snapshot.state}
        </span>
        <button
          className="rm-btn"
          onClick={() => onTriggerPull(remote.meta.name)}
          type="button"
        >
          Trigger pull
        </button>
      </div>

      {lying ? (
        <p className="rm-warning-banner" role="alert">
          Reporting &quot;connected&quot; but{" "}
          {snapshot.lastSuccessUtcMs === 0
            ? "has never completed a successful poll since boot"
            : `its last success was ${timeSince(snapshot.lastSuccessUtcMs)} — this looks like a dead poll loop`}
          .
        </p>
      ) : null}

      <dl className="rm-kv rm-kv-compact">
        <dt>Collection</dt>
        <dd>
          {remote.meta.collectionId.driveId} ({remote.meta.collectionId.branch})
        </dd>
        {channelUrl(remote) ? (
          <>
            <dt>URL</dt>
            <dd>{channelUrl(remote)}</dd>
          </>
        ) : null}
        <dt>Last success</dt>
        <dd>{timeSince(snapshot.lastSuccessUtcMs)}</dd>
        <dt>Last failure</dt>
        <dd>{timeSince(snapshot.lastFailureUtcMs)}</dd>
        <dt>Failure count</dt>
        <dd>{snapshot.failureCount}</dd>
        <dt>Push blocked</dt>
        <dd>
          {snapshot.pushBlocked
            ? `yes (${snapshot.pushFailureCount} failures)`
            : "no"}
        </dd>
        <dt>Requires auth</dt>
        <dd>{snapshot.requiresAuth ? "yes" : "no"}</dd>
      </dl>
    </li>
  );
}

export function SyncTab({ syncManager }: SyncTabProps) {
  const [remotes, setRemotes] = useState<Remote[]>([]);
  const [name, setName] = useState("");
  const [driveId, setDriveId] = useState("");
  const [url, setUrl] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(() => {
    if (syncManager) {
      setRemotes(syncManager.list());
    }
  }, [syncManager]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks-extra/set-state-in-effect
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleAdd = useCallback(async () => {
    if (!syncManager) {
      return;
    }
    const trimmedName = name.trim();
    const trimmedDriveId = driveId.trim();
    const trimmedUrl = url.trim();
    if (!trimmedName || !trimmedDriveId || !trimmedUrl) {
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      await syncManager.add(
        trimmedName,
        DriveCollectionId.forDrive(trimmedDriveId),
        {
          type: "gql",
          parameters: { url: trimmedUrl },
        },
      );
      setName("");
      setDriveId("");
      setUrl("");
      refresh();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  }, [syncManager, name, driveId, url, refresh]);

  const handleTriggerPull = useCallback(
    (remoteName: string) => {
      syncManager?.triggerPull(remoteName);
    },
    [syncManager],
  );

  if (!syncManager) {
    return (
      <div className="rm-tab">
        <h2>Sync</h2>
        <p className="rm-placeholder">
          This reactor has no sync module (built with channelScheme: null).
        </p>
      </div>
    );
  }

  return (
    <div className="rm-tab">
      <h2>Sync / Remotes</h2>

      <form
        className="rm-form rm-form-inline"
        onSubmit={(e) => {
          e.preventDefault();
          void handleAdd();
        }}
      >
        <label>
          Remote name
          <input
            onChange={(e) => setName(e.target.value)}
            placeholder="my-remote"
            type="text"
            value={name}
          />
        </label>
        <label>
          Drive ID
          <input
            onChange={(e) => setDriveId(e.target.value)}
            placeholder="drive id to sync"
            type="text"
            value={driveId}
          />
        </label>
        <label>
          GraphQL URL
          <input
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://.../graphql"
            type="text"
            value={url}
          />
        </label>
        <button className="rm-btn" disabled={adding} type="submit">
          Add remote
        </button>
      </form>
      {addError ? (
        <p className="rm-error">Failed to add remote: {addError}</p>
      ) : null}

      {remotes.length === 0 ? (
        <p className="rm-placeholder" data-testid="sync-empty-state">
          No remotes configured.
        </p>
      ) : (
        <ul className="rm-remote-list">
          {remotes.map((remote) => (
            <RemoteRow
              key={remote.meta.id}
              onTriggerPull={handleTriggerPull}
              remote={remote}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export default SyncTab;
