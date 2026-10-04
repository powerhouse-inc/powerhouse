import {
  GQL_CHANNEL_TYPE,
  LOCAL_CHANNEL_TYPE,
  POLLING_CHANNEL_TYPE,
  type ManagedReactor,
  type ManagedRemoteReactor,
  type ManagedWorkerReactor,
  type ReactorCapabilities,
  type ReactorSyncChannel,
} from "@powerhousedao/reactor-monitor";
import { useCallback, useEffect, useState } from "react";
import type { WorkerInspectorInfo } from "@powerhousedao/reactor-browser/rpc";

export type OverviewTabProps = {
  readonly reactor: ManagedReactor;
  /**
   * Re-reads a REMOTE reactor's reported facts. Wired to the "Re-check server"
   * button on the Remote host block, which is how an operator who just
   * restarted that host with `PH_INSPECTION_ADMIN=true` gets the levers without
   * waiting for the client's TTL. Inert for a local reactor, which has no far
   * side to ask.
   */
  readonly onRecheckServer?: () => void;
  readonly rechecking?: boolean;
  /** Why the last re-check failed; empty when it did not. */
  readonly recheckError?: string;
};

/** Worker-only lifecycle info, fetched once and refreshable. */
function AdminInfo({ reactor }: { reactor: ManagedWorkerReactor }) {
  const [info, setInfo] = useState<WorkerInspectorInfo | undefined>();
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(async () => {
    try {
      setInfo(await reactor.adminInfo());
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [reactor]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks-extra/set-state-in-effect
    void load();
  }, [load]);

  if (error) {
    return <p className="rm-error">Failed to load admin info: {error}</p>;
  }
  if (!info) {
    return <p className="rm-placeholder">Loading worker info...</p>;
  }
  return (
    <dl className="rm-kv">
      <dt>Worker namespace</dt>
      <dd>{info.namespace}</dd>
      <dt>Owner id</dt>
      <dd>{info.ownerId}</dd>
      <dt>Booted at</dt>
      <dd>{new Date(info.bootedAtMs).toLocaleString()}</dd>
      <dt>Connected clients</dt>
      <dd>{info.connectedClients}</dd>
      <dt>App build id</dt>
      <dd>{info.appBuildId}</dd>
      <dt>RPC protocol version</dt>
      <dd>{info.rpcProtocolVersion}</dd>
      <dt>Feature flags</dt>
      <dd>
        {info.featureFlags && info.featureFlags.length > 0
          ? info.featureFlags
          : "(none)"}
      </dd>
    </dl>
  );
}

/**
 * One cell of the capability grid. `tone` carries whether the value is a
 * capability the reactor HAS (`ok`), one it LACKS (`off`), or a plain
 * classification with no better/worse to it (`neutral`) -- the whole point of
 * the grid is that worker and in-process differ, not that one is broken.
 */
type CapabilityCell = {
  readonly label: string;
  readonly value: string;
  readonly tone: "ok" | "off" | "neutral";
  readonly note: string;
};

function yesNo(enabled: boolean): Pick<CapabilityCell, "value" | "tone"> {
  return { value: enabled ? "yes" : "no", tone: enabled ? "ok" : "off" };
}

/** What one declared channel type means, and what can be done with it here. */
function channelNote(channel: ReactorSyncChannel): string {
  switch (channel) {
    case GQL_CHANNEL_TYPE:
      return "gql: Switchboard GraphQL remotes, added from the Sync tab.";
    case POLLING_CHANNEL_TYPE:
      return "polling: resolver-driven GraphQL channels, created by the peer that polls this reactor rather than added from here.";
    case LOCAL_CHANNEL_TYPE:
      return "local: brokered-MessagePort LocalChannel peers, linkable from the Sync tab.";
    default: {
      const unsupported: never = channel;
      throw new Error(`Unknown sync channel: ${JSON.stringify(unsupported)}`);
    }
  }
}

/**
 * The reason the sync-channel cell reads the way it does: one line per channel
 * the reactor declares.
 *
 * Composed per channel rather than written as an either/or, because a reactor
 * holding several is the normal case since W3.0 and an either/or note reported
 * one capability while hiding the other -- the opposite of what this grid is
 * for. Driven off the declared list, so a reactor whose scheme serves
 * `polling` is described as serving `polling`, not as whatever the nearest
 * hard-coded combination happened to be.
 */
function syncChannelNote(channels: readonly ReactorSyncChannel[]): string {
  if (channels.length === 0) {
    return "No sync module was built: this reactor is an island.";
  }
  return channels.map(channelNote).join(" ");
}

/**
 * Renders `ReactorCapabilities` field by field, each with the one-line reason
 * it reads the way it does -- this grid is where the plan's "capability
 * variance is a fact to model explicitly" becomes visible at a glance, so the
 * notes explain the variance rather than restating the value.
 */
function capabilityCells(
  capabilities: ReactorCapabilities,
): readonly CapabilityCell[] {
  const { storage } = capabilities;
  return [
    {
      label: "Hosting",
      value: capabilities.hosting,
      tone: "neutral",
      note:
        capabilities.hosting === "worker"
          ? "SharedWorker in this origin, reached over RPC."
          : capabilities.hosting === "in-process"
            ? "The calling thread; every component reachable directly."
            : "An already-running reactor attached over HTTP; nothing was built here.",
    },
    {
      label: "Storage",
      value: storage.kind,
      tone: storage.durable ? "ok" : "off",
      note: storage.durable
        ? "Durable: an acknowledged write outlives the host."
        : "Ephemeral: everything is gone when the host goes away.",
    },
    {
      label: "Processors",
      ...yesNo(capabilities.processors),
      note: capabilities.processors
        ? "Can host processor factories: factory and manager share a realm."
        : "Cannot host processor factories: a function does not survive postMessage.",
    },
    {
      label: "Workflows",
      ...yesNo(capabilities.workflows),
      note: capabilities.workflows
        ? "That host reported the workflow engine composed into it."
        : capabilities.hosting === "remote"
          ? "That host reported no workflow engine composed into it, so it fires no triggers."
          : "Browser host: the engine forks child processes, so it is Node-only.",
    },
    {
      label: "Inspection",
      value: capabilities.inspection,
      tone: capabilities.inspection === "none" ? "off" : "neutral",
      note:
        capabilities.inspection === "direct"
          ? "Live components: synchronous truth, nothing serialized."
          : capabilities.inspection === "rpc"
            ? "Over a transport, so only what the dispatch layer models crosses: a worker message port, or reactor-api's inspection subgraph for a remote reactor (W3.2)."
            : "No inspection surface at all: a router must not promise observability for this target.",
    },
    {
      label: "Sync channels",
      value:
        capabilities.syncChannels.length > 0
          ? capabilities.syncChannels.join(", ")
          : "none",
      tone: capabilities.syncChannels.length > 0 ? "neutral" : "off",
      note: syncChannelNote(capabilities.syncChannels),
    },
    {
      label: "Self-heal",
      ...yesNo(capabilities.selfHeal),
      note: capabilities.selfHeal
        ? "A poisoned PGlite session is recreated in place against the same store."
        : capabilities.hosting === "remote"
          ? "The store is on the far side of the wire and is not ours to reopen."
          : "A storage fault is terminal: there is no durable store to reopen.",
    },
  ];
}

function CapabilityGrid({
  capabilities,
}: {
  capabilities: ReactorCapabilities;
}) {
  return (
    <ul aria-label="Reactor capabilities" className="rm-cap-grid">
      {capabilityCells(capabilities).map((cell) => (
        <li className="rm-cap" key={cell.label}>
          <div className="rm-cap-head">
            <span className="rm-cap-label">{cell.label}</span>
            <span className={`rm-badge rm-badge-${cell.tone}`}>
              {cell.value}
            </span>
          </div>
          <p className="rm-cap-note">{cell.note}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * What the REMOTE reactor said about itself, beside the capability grid it was
 * derived from.
 *
 * Shown separately because two of these facts are not capabilities at all but
 * properties of the DEPLOYMENT -- which inspection tiers its host opted into
 * -- and they are what every disabled lever in the other tabs points back to.
 * The store class is here for the same reason: the contract records a remote
 * store as `remote` (not ours to open), which is the right answer for a router
 * and tells an operator nothing about what is actually behind it.
 */
function RemoteServerInfo({
  reactor,
  onRecheck,
  rechecking,
  recheckError,
}: {
  reactor: ManagedRemoteReactor;
  onRecheck?: () => void;
  rechecking: boolean;
  recheckError: string;
}) {
  const info = reactor.serverInfo;
  return (
    <>
      <div className="rm-form-inline">
        <button
          className="rm-btn"
          data-testid="remote-recheck"
          disabled={rechecking || !onRecheck}
          onClick={onRecheck}
          type="button"
        >
          {rechecking ? "Re-checking..." : "Re-check server"}
        </button>
        <span className="rm-cap-note">
          Asks that reactor for its reported facts again. The two tier rows
          below are its host&apos;s posture, not a property of the reactor: a
          restart with PH_INSPECTION_ADMIN=true turns the levers on under this
          same handle.
        </span>
      </div>
      {recheckError ? (
        <p className="rm-error" data-testid="remote-recheck-error" role="alert">
          Could not re-check {reactor.endpoint}: {recheckError}
        </p>
      ) : null}
      <dl className="rm-kv">
        <dt>Inspection endpoint</dt>
        <dd>{reactor.endpoint}</dd>
        <dt>Server store class</dt>
        <dd>{info.storageKind}</dd>
        <dt>Admin ops (PH_INSPECTION_ADMIN)</dt>
        <dd data-testid="remote-admin-enabled">
          {info.adminEnabled
            ? "enabled: pause/resume, retries, sweeps, rebuilds and sync repair levers are served"
            : "disabled: reads only, every state-changing lever is refused there"}
        </dd>
        <dt>Raw SQL (PH_INSPECTION_SQL)</dt>
        <dd data-testid="remote-sql-enabled">
          {info.sqlEnabled
            ? "enabled: the DB tab can query that reactor's store"
            : "disabled: the DB tab is unavailable"}
        </dd>
      </dl>
    </>
  );
}

export function OverviewTab({
  reactor,
  onRecheckServer,
  rechecking = false,
  recheckError = "",
}: OverviewTabProps) {
  return (
    <div className="rm-tab">
      <h2>Overview</h2>
      <dl className="rm-kv">
        <dt>Name</dt>
        <dd>{reactor.name}</dd>
        <dt>Kind</dt>
        <dd>{reactor.kind}</dd>
      </dl>

      <h3>Capabilities</h3>
      <p className="rm-note">
        Derived from the descriptor at provision time and static for the life of
        this reactor — the typed contract a multi-reactor router selects targets
        on (multi-reactor stage 2).
      </p>
      <CapabilityGrid capabilities={reactor.capabilities} />

      {reactor.kind === "worker" ? (
        <>
          <h3>Worker host</h3>
          <AdminInfo reactor={reactor} />
        </>
      ) : reactor.kind === "remote" ? (
        <>
          <h3>Remote host</h3>
          <p className="rm-note">
            Reported by that reactor over its inspection subgraph; the grid
            above is derived from it rather than from the URL this monitor was
            given (multi-reactor W3.2). The grid is frozen at provision time --
            a reactor built differently is a different reactor -- but the two
            tier rows are re-read, because they are the host&apos;s posture and
            an operator changes them with a restart.
          </p>
          <RemoteServerInfo
            onRecheck={onRecheckServer}
            reactor={reactor}
            recheckError={recheckError}
            rechecking={rechecking}
          />
        </>
      ) : (
        <p className="rm-note">
          In-process reactors have no admin lifecycle (restart/info) — those are
          worker-only affordances.
        </p>
      )}
    </div>
  );
}

export default OverviewTab;
