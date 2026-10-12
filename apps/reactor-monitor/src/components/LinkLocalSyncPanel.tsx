import {
  LOCAL_CHANNEL_TYPE,
  type ManagedReactor,
  type ManagedReactorEntry,
} from "@powerhousedao/reactor-monitor";
import {
  useManagedReactors,
  useReactorMonitorRegistry,
} from "@powerhousedao/reactor-monitor/react";
import { useCallback, useMemo, useState } from "react";

export type LinkLocalSyncPanelProps = {
  /** The reactor whose Sync tab this panel sits in; one end of the link. */
  readonly reactorName: string;
};

function servesLocal(reactor: ManagedReactor): boolean {
  return (
    reactor.kind !== "remote" &&
    reactor.info.syncChannels.includes(LOCAL_CHANNEL_TYPE)
  );
}

/** Why this reactor cannot be an end of a brokered local link. */
function noLocalChannelReason(entry: ManagedReactorEntry | undefined): string {
  if (!entry || entry.status !== "ready") {
    return "This reactor is not ready, so there is no info to read yet; the link panel appears once it is.";
  }
  if (entry.reactor.kind === "remote") {
    return "This reactor is remote: the monitor reaches it only over its host's inspection subgraph, which cannot hand it a MessagePort.";
  }
  const channels = entry.reactor.info.syncChannels;
  if (channels.length === 0) {
    return 'This reactor was built with no sync module (sync.channelScheme: null), so it has nothing to adopt a brokered local peer into. Provision it with sync mode "local" or "connect" to link it.';
  }
  return `This reactor declares sync channels [${channels.join(", ")}] and no "local" one, so it cannot adopt a brokered local peer: a MessagePort reaches neither a reactor on the far side of a wire nor one whose own built configuration could not be read. Re-provision it to link it.`;
}

/**
 * Brokers a direct `LocalChannel` sync link from this reactor to another
 * monitor-owned reactor for a chosen drive. Both ends are gated on
 * `info.syncChannels`, read from the same registry subscription.
 */
export function LinkLocalSyncPanel({ reactorName }: LinkLocalSyncPanelProps) {
  const registry = useReactorMonitorRegistry();
  const entries = useManagedReactors();
  const [target, setTarget] = useState("");
  const [driveId, setDriveId] = useState("");
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linked, setLinked] = useState<string | null>(null);

  const self = useMemo(
    () => entries.find((entry) => entry.name === reactorName),
    [entries, reactorName],
  );
  const localLinks = self?.status === "ready" && servesLocal(self.reactor);

  // Only local-capable peers are offered: linkLocalSync refuses the others,
  // and it refuses them before opening a port, so listing them would only
  // invite the error.
  const targets = useMemo(
    () =>
      entries.filter(
        (entry) =>
          entry.status === "ready" &&
          entry.name !== reactorName &&
          servesLocal(entry.reactor),
      ),
    [entries, reactorName],
  );

  const handleLink = useCallback(async () => {
    const other = target.trim();
    const drive = driveId.trim();
    if (!other || !drive) {
      return;
    }
    // Said here rather than let through to the broker, which refuses it too:
    // the collection id key splits on its last dot, so a dotted drive id would
    // reach the peer as a different collection. See assertCollectionIdParts.
    if (drive.includes(".")) {
      setError(
        'A drive id for local sync cannot contain a "." -- the collection id format cannot carry it',
      );
      setLinked(null);
      return;
    }
    setLinking(true);
    setError(null);
    setLinked(null);
    try {
      const handle = await registry.linkLocalSync(reactorName, other, {
        driveId: drive,
      });
      setLinked(`${handle.remoteNameA} <-> ${handle.remoteNameB}`);
      setDriveId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLinking(false);
    }
  }, [registry, reactorName, target, driveId]);

  return (
    <section className="rm-link-local-sync" data-testid="link-local-sync">
      <h3>Link local sync</h3>
      {!localLinks ? (
        <p className="rm-placeholder" data-testid="link-local-sync-unavailable">
          {noLocalChannelReason(self)}
        </p>
      ) : targets.length === 0 ? (
        <p className="rm-placeholder">
          Provision another ready local-capable reactor to link this one to it
          directly.
        </p>
      ) : (
        <form
          className="rm-form rm-form-inline"
          onSubmit={(e) => {
            e.preventDefault();
            void handleLink();
          }}
        >
          <label>
            Peer reactor
            <select onChange={(e) => setTarget(e.target.value)} value={target}>
              <option value="">select a reactor</option>
              {targets.map((entry) => (
                <option key={entry.name} value={entry.name}>
                  {entry.name}
                </option>
              ))}
            </select>
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
          <button
            className="rm-btn"
            disabled={linking || !target || !driveId.trim()}
            type="submit"
          >
            Link local sync
          </button>
        </form>
      )}
      {error ? (
        <p
          className="rm-error"
          data-testid="link-local-sync-error"
          role="alert"
        >
          Link failed: {error}
        </p>
      ) : null}
      {linked ? (
        <p className="rm-note" data-testid="link-local-sync-ok">
          Linked: {linked}
        </p>
      ) : null}
    </section>
  );
}

export default LinkLocalSyncPanel;
