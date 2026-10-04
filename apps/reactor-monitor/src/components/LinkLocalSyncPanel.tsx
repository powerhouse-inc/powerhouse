import {
  useManagedReactors,
  useReactorMonitorRegistry,
} from "@powerhousedao/reactor-monitor/react";
import { useCallback, useMemo, useState } from "react";

export type LinkLocalSyncPanelProps = {
  /** The reactor whose Sync tab this panel sits in; one end of the link. */
  readonly reactorName: string;
};

/**
 * Brokers a direct `LocalChannel` sync link from this reactor to another
 * monitor-owned reactor for a chosen drive -- no Switchboard, no GraphQL
 * (multi-reactor W1.2). The resulting `local` remote then shows up in each
 * reactor's Sync tab below, with its connection state and cursors.
 */
export function LinkLocalSyncPanel({ reactorName }: LinkLocalSyncPanelProps) {
  const registry = useReactorMonitorRegistry();
  const entries = useManagedReactors();
  const [target, setTarget] = useState("");
  const [driveId, setDriveId] = useState("");
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linked, setLinked] = useState<string | null>(null);

  const targets = useMemo(
    () =>
      entries.filter(
        (entry) => entry.status === "ready" && entry.name !== reactorName,
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
      {targets.length === 0 ? (
        <p className="rm-placeholder">
          Provision another ready reactor to link this one to it directly.
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
