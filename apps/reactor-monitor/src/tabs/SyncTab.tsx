import {
  DriveCollectionId,
  type DeadLetterRecord,
  type IInspector,
  type InspectableSyncManager,
  type Remote,
  type RemoteSyncInspection,
  type StorageHealth,
} from "@powerhousedao/reactor";
import { useCallback, useEffect, useState } from "react";
import { isConnectionLying } from "../lib/sync-health.js";
import { timeSince } from "../lib/time.js";

export type SyncTabProps = {
  readonly syncManager: InspectableSyncManager | undefined;
  readonly inspector?: IInspector;
  /**
   * Whether this reactor can form gql remotes, i.e. whether its capability
   * contract declares the `"gql"` sync channel.
   *
   * False for a local-ONLY reactor (`sync.local`): it wires a single
   * `LocalChannelFactory`, so the "Add remote" form below cannot work -- the
   * factory rejects a `{ type: "gql" }` config. True for a connect-mode
   * reactor, which since W3.0 serves gql remotes AND brokered local peers, so
   * both this form and the link panel above are live on it. Required rather
   * than defaulted, because either silent default puts a form that cannot work
   * in front of the user.
   */
  readonly gqlRemotes: boolean;
};

const POLL_INTERVAL_MS = 2000;
const DEAD_LETTER_PAGE_SIZE = 25;

function channelUrl(remote: Remote): string | undefined {
  const url = remote.meta.channelConfig.parameters.url;
  return typeof url === "string" ? url : undefined;
}

function StorageHealthPanel({ health }: { health: StorageHealth | undefined }) {
  if (!health) {
    return null;
  }
  const className = health.healthy
    ? "rm-kv rm-kv-compact"
    : "rm-kv rm-kv-compact rm-remote-warning";
  return (
    <section className="rm-storage-health">
      <h3>Storage health</h3>
      {!health.healthy ? (
        <p className="rm-warning-banner" role="alert">
          The reactor&apos;s PGlite session was reported poisoned and has not
          recovered. Reads and sync ingestion are dead until it recreates.
        </p>
      ) : null}
      <dl className={className}>
        <dt>Session</dt>
        <dd>{health.healthy ? "healthy" : "unhealthy"}</dd>
        <dt>Ever recreated</dt>
        <dd>
          {health.everRecreated ? `yes (${health.recreateCount}x)` : "no"}
        </dd>
        {health.lastRecreated ? (
          <>
            <dt>Last recreate</dt>
            <dd>
              {timeSince(health.lastRecreated.timestampUtcMs)} — attempt{" "}
              {health.lastRecreated.attempt}: {health.lastRecreated.reason}
            </dd>
          </>
        ) : null}
      </dl>
    </section>
  );
}

function DeadLetterRow({
  remoteName,
  record,
  onRequeue,
  onClear,
}: {
  remoteName: string;
  record: DeadLetterRecord;
  onRequeue: (remoteName: string, id: string) => void;
  onClear: (remoteName: string, id: string) => void;
}) {
  return (
    <li className="rm-dead-letter" data-testid="sync-dead-letter">
      <div className="rm-dead-letter-header">
        <span className="rm-badge rm-badge-error">{record.errorType}</span>
        <span className="rm-badge">{record.errorSource}</span>
        <code>{record.documentId}</code>
        <button
          className="rm-btn"
          onClick={() => onRequeue(remoteName, record.id)}
          type="button"
        >
          Requeue
        </button>
        <button
          className="rm-btn"
          onClick={() => onClear(remoteName, record.id)}
          type="button"
        >
          Clear
        </button>
      </div>
      <p className="rm-dead-letter-error">{record.errorMessage}</p>
    </li>
  );
}

function RemoteRow({
  remote,
  inspection,
  deadLetters,
  repairError,
  onTriggerPull,
  onResetChannel,
  onRewindInbox,
  onRequeue,
  onClear,
}: {
  remote: Remote;
  inspection: RemoteSyncInspection | undefined;
  deadLetters: DeadLetterRecord[];
  repairError: string | undefined;
  onTriggerPull: (name: string) => void;
  onResetChannel: (name: string) => void;
  onRewindInbox: (name: string, toOrdinal: number) => void;
  onRequeue: (name: string, id: string) => void;
  onClear: (name: string, id: string) => void;
}) {
  const snapshot =
    inspection?.connection.snapshot ?? remote.channel.getConnectionState();
  // The never-succeeded warning is driven by the first-class inspection flag;
  // staleness still comes from the shared helper on the raw snapshot.
  const neverSucceeded = inspection?.connection.neverSucceeded ?? false;
  const lying = neverSucceeded || isConnectionLying(snapshot);
  const [rewindTo, setRewindTo] = useState("0");
  // A rewind only ever moves the cursor backward, so the input is capped at the
  // furthest-ahead inbox position the manager will accept.
  const maxRewind = inspection
    ? Math.max(
        inspection.inboxCursor.cursorOrdinal,
        inspection.inboxCursor.liveAckOrdinal,
      )
    : undefined;

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
        <button
          className="rm-btn"
          onClick={() => onResetChannel(remote.meta.name)}
          type="button"
        >
          Reset channel
        </button>
      </div>

      {lying ? (
        <p className="rm-warning-banner" role="alert">
          Reporting &quot;connected&quot; but{" "}
          {neverSucceeded
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
        {inspection ? (
          <>
            <dt>Inbox cursor</dt>
            <dd data-testid="sync-inbox-cursor">
              stored {inspection.inboxCursor.cursorOrdinal} / live ack{" "}
              {inspection.inboxCursor.liveAckOrdinal} / latest{" "}
              {inspection.inboxCursor.liveLatestOrdinal}
            </dd>
            <dt>Outbox cursor</dt>
            <dd data-testid="sync-outbox-cursor">
              stored {inspection.outboxCursor.cursorOrdinal} / live ack{" "}
              {inspection.outboxCursor.liveAckOrdinal}
            </dd>
            <dt>Mailbox depths</dt>
            <dd data-testid="sync-mailbox-depths">
              inbox {inspection.mailboxDepths.inbox} · outbox{" "}
              {inspection.mailboxDepths.outbox} · dead-letter{" "}
              {inspection.mailboxDepths.deadLetter}
            </dd>
          </>
        ) : null}
      </dl>

      <div className="rm-repair rm-form-inline">
        <label>
          Rewind inbox to ordinal
          <input
            max={maxRewind}
            min={0}
            onChange={(e) => setRewindTo(e.target.value)}
            type="number"
            value={rewindTo}
          />
        </label>
        <button
          className="rm-btn"
          onClick={() =>
            onRewindInbox(remote.meta.name, Number.parseInt(rewindTo, 10) || 0)
          }
          type="button"
        >
          Rewind + re-pull
        </button>
      </div>

      {repairError ? (
        <p className="rm-error" data-testid="sync-repair-error" role="alert">
          Repair failed: {repairError}
        </p>
      ) : null}

      {deadLetters.length > 0 ? (
        <div className="rm-dead-letters">
          <h4>Dead letters ({deadLetters.length})</h4>
          <ul className="rm-dead-letter-list">
            {deadLetters.map((record) => (
              <DeadLetterRow
                key={record.id}
                onClear={onClear}
                onRequeue={onRequeue}
                record={record}
                remoteName={remote.meta.name}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

export function SyncTab({ syncManager, inspector, gqlRemotes }: SyncTabProps) {
  const [remotes, setRemotes] = useState<Remote[]>([]);
  const [inspections, setInspections] = useState<
    Map<string, RemoteSyncInspection>
  >(new Map());
  const [deadLetters, setDeadLetters] = useState<
    Map<string, DeadLetterRecord[]>
  >(new Map());
  const [storageHealth, setStorageHealth] = useState<StorageHealth | undefined>(
    undefined,
  );
  const [name, setName] = useState("");
  const [driveId, setDriveId] = useState("");
  const [url, setUrl] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [repairErrors, setRepairErrors] = useState<Map<string, string>>(
    new Map(),
  );

  const setRepairError = useCallback((remoteName: string, message: string) => {
    setRepairErrors((prev) => {
      const next = new Map(prev);
      next.set(remoteName, message);
      return next;
    });
  }, []);

  const clearRepairError = useCallback((remoteName: string) => {
    setRepairErrors((prev) => {
      if (!prev.has(remoteName)) {
        return prev;
      }
      const next = new Map(prev);
      next.delete(remoteName);
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!syncManager) {
      return;
    }
    setRemotes(syncManager.list());

    try {
      const inspected = await syncManager.inspectRemotes();
      setInspections(new Map(inspected.map((i) => [i.remoteName, i])));
      const nextDeadLetters = new Map<string, DeadLetterRecord[]>();
      // Skip the per-remote dead-letter fetch when the inspection already
      // reports an empty dead-letter mailbox, and run the rest concurrently
      // rather than awaiting each in series every poll.
      await Promise.all(
        inspected.map(async (i) => {
          if (i.mailboxDepths.deadLetter === 0) {
            nextDeadLetters.set(i.remoteName, []);
            return;
          }
          const page = await syncManager.listDeadLetters(
            i.remoteName,
            undefined,
            DEAD_LETTER_PAGE_SIZE,
          );
          nextDeadLetters.set(i.remoteName, page.results);
        }),
      );
      setDeadLetters(nextDeadLetters);
    } catch (e) {
      console.error("[reactor-monitor] sync inspection failed:", e);
    }

    if (inspector) {
      try {
        setStorageHealth(await inspector.getStorageHealth());
      } catch (e) {
        console.error("[reactor-monitor] storage health read failed:", e);
      }
    }
  }, [syncManager, inspector]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks-extra/set-state-in-effect
    void refresh();
    const interval = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleAdd = useCallback(async () => {
    // The form is disabled on a reactor with no gql factory; this is the belt
    // to that braces, so a submit that slips through cannot reach a factory
    // that will only reject it.
    if (!syncManager || !gqlRemotes) {
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
      void refresh();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  }, [syncManager, gqlRemotes, name, driveId, url, refresh]);

  const handleTriggerPull = useCallback(
    (remoteName: string) => {
      syncManager?.triggerPull(remoteName);
    },
    [syncManager],
  );

  // Every repair lever surfaces its failure per remote rather than dropping it
  // into an invisible unhandled rejection, and refreshes either way.
  const runRepair = useCallback(
    async (remoteName: string, action: () => Promise<void> | undefined) => {
      try {
        await action();
        clearRepairError(remoteName);
      } catch (e) {
        setRepairError(remoteName, e instanceof Error ? e.message : String(e));
      } finally {
        void refresh();
      }
    },
    [refresh, clearRepairError, setRepairError],
  );

  const handleResetChannel = useCallback(
    (remoteName: string) => {
      void runRepair(remoteName, () => syncManager?.resetChannel(remoteName));
    },
    [syncManager, runRepair],
  );

  const handleRewindInbox = useCallback(
    (remoteName: string, toOrdinal: number) => {
      void runRepair(remoteName, () =>
        syncManager?.rewindInboxCursor(remoteName, toOrdinal),
      );
    },
    [syncManager, runRepair],
  );

  const handleRequeue = useCallback(
    (remoteName: string, id: string) => {
      void runRepair(remoteName, () =>
        syncManager?.requeueDeadLetter(remoteName, id),
      );
    },
    [syncManager, runRepair],
  );

  const handleClear = useCallback(
    (remoteName: string, id: string) => {
      void runRepair(remoteName, () =>
        syncManager?.clearDeadLetter(remoteName, id),
      );
    },
    [syncManager, runRepair],
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

      <StorageHealthPanel health={storageHealth} />

      {gqlRemotes ? null : (
        <p className="rm-note" data-testid="sync-add-remote-unavailable">
          This reactor is provisioned local-only (sync.local), so it has a local
          channel factory and no GraphQL one; a gql remote cannot be added here.
          Use &quot;Link local sync&quot; above to sync it with another
          monitor-owned reactor, or provision a reactor with sync mode
          &quot;connect&quot;, which serves gql remotes and local links at once.
        </p>
      )}
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
            disabled={!gqlRemotes}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-remote"
            type="text"
            value={name}
          />
        </label>
        <label>
          Drive ID
          <input
            disabled={!gqlRemotes}
            onChange={(e) => setDriveId(e.target.value)}
            placeholder="drive id to sync"
            type="text"
            value={driveId}
          />
        </label>
        <label>
          GraphQL URL
          <input
            disabled={!gqlRemotes}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://.../graphql"
            type="text"
            value={url}
          />
        </label>
        <button
          className="rm-btn"
          disabled={adding || !gqlRemotes}
          type="submit"
        >
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
              deadLetters={deadLetters.get(remote.meta.name) ?? []}
              inspection={inspections.get(remote.meta.name)}
              key={remote.meta.id}
              onClear={handleClear}
              onRequeue={handleRequeue}
              onResetChannel={handleResetChannel}
              onRewindInbox={handleRewindInbox}
              onTriggerPull={handleTriggerPull}
              remote={remote}
              repairError={repairErrors.get(remote.meta.name)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export default SyncTab;
