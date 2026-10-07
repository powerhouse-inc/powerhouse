import {
  LOCAL_CHANNEL_TYPE,
  supportsSyncChannel,
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

/**
 * Why this reactor cannot be an end of a brokered local link, diagnosed from
 * its capability contract.
 *
 * The three reasons are genuinely different, and the earlier single
 * hard-coded island message mis-told two of them: a reactor that declares
 * channels but not `"local"` has a sync module and is syncing, it just cannot
 * be handed a `MessagePort` (a `remote` reactor is on the far side of a wire,
 * and a worker whose built configuration could not be read is not taken to
 * serve local peers on a guess) -- telling its operator to pick a sync mode
 * would be advice for a problem they do not have.
 */
function noLocalChannelReason(entry: ManagedReactorEntry | undefined): string {
  if (!entry || entry.status !== "ready") {
    return "This reactor is not ready, so there is no capability contract to read yet; the link panel appears once it is.";
  }
  const channels = entry.reactor.capabilities.syncChannels;
  if (channels.length === 0) {
    return 'This reactor was built with no sync module (sync.channelScheme: null), so it has nothing to adopt a brokered local peer into. Provision it with sync mode "local" or "connect" to link it.';
  }
  return `This reactor declares sync channels [${channels.join(", ")}] and no "local" one, so it cannot adopt a brokered local peer: a MessagePort reaches neither a reactor on the far side of a wire nor one whose own built configuration could not be read. Re-provision it to link it.`;
}

/**
 * Brokers a direct `LocalChannel` sync link from this reactor to another
 * monitor-owned reactor for a chosen drive -- no Switchboard, no GraphQL
 * (multi-reactor W1.2). The resulting `local` remote then shows up in each
 * reactor's Sync tab below, with its connection state and cursors.
 *
 * Both ends are gated on the capability contract, not on how they were
 * spelled: a connect-mode reactor is a valid end of a local link since W3.0,
 * and only a reactor that does not declare the channel is not. THIS end is
 * read from the registry here rather than passed in -- the panel already
 * subscribes to it for the target list, so a prop would be a second path to
 * the same fact, and the two could disagree.
 */
export function LinkLocalSyncPanel({ reactorName }: LinkLocalSyncPanelProps) {
  const registry = useReactorMonitorRegistry();
  const entries = useManagedReactors();
  const [target, setTarget] = useState("");
  const [driveId, setDriveId] = useState("");
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linked, setLinked] = useState<string | null>(null);

  // This end's own contract, from the same subscription the target list reads.
  const self = useMemo(
    () => entries.find((entry) => entry.name === reactorName),
    [entries, reactorName],
  );
  const localLinks =
    self?.status === "ready" &&
    supportsSyncChannel(self.reactor.capabilities, LOCAL_CHANNEL_TYPE);

  // Only local-capable peers are offered: linkLocalSync refuses the others,
  // and it refuses them before opening a port, so listing them would only
  // invite the error.
  const targets = useMemo(
    () =>
      entries.filter(
        (entry) =>
          entry.status === "ready" &&
          entry.name !== reactorName &&
          supportsSyncChannel(entry.reactor.capabilities, LOCAL_CHANNEL_TYPE),
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
