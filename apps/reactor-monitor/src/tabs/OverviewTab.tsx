import {
  GQL_CHANNEL_TYPE,
  LOCAL_CHANNEL_TYPE,
  POLLING_CHANNEL_TYPE,
  type ManagedReactor,
  type ManagedRemoteReactor,
  type ManagedWorkerReactor,
  type MonitorReach,
  type MonitorReactorInfo,
} from "@powerhousedao/reactor-monitor";
import { useCallback, useEffect, useState } from "react";
import type { WorkerInspectorInfo } from "@powerhousedao/reactor-browser/rpc";

export type OverviewTabProps = {
  readonly reactor: ManagedReactor;
  /** Re-reads a remote reactor's `info`; inert for a local one. */
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
 * One cell of the capability grid. `ok` is a capability the reactor has, `off`
 * one it lacks, `neutral` a classification.
 */
export type CapabilityCell = {
  readonly label: string;
  readonly value: string;
  readonly tone: "ok" | "off" | "neutral";
  readonly note: string;
};

function yesNo(enabled: boolean): Pick<CapabilityCell, "value" | "tone"> {
  return { value: enabled ? "yes" : "no", tone: enabled ? "ok" : "off" };
}

const CHANNEL_NOTES: Readonly<Record<string, string>> = {
  [GQL_CHANNEL_TYPE]:
    "gql: Switchboard GraphQL remotes, added from the Sync tab.",
  [POLLING_CHANNEL_TYPE]:
    "polling: resolver-driven GraphQL channels, created by the peer that polls this reactor rather than added from here.",
  [LOCAL_CHANNEL_TYPE]:
    "local: brokered-MessagePort LocalChannel peers, linkable from the Sync tab.",
};

function syncChannelNote(channels: readonly string[]): string {
  if (channels.length === 0) {
    return "No sync module was built: this reactor is an island.";
  }
  return channels
    .map((channel) => CHANNEL_NOTES[channel] ?? `${channel}: served.`)
    .join(" ");
}

function accessCell(info: MonitorReactorInfo): CapabilityCell {
  const { access } = info;
  if (access === null) {
    return {
      label: "Access",
      value: "reads only",
      tone: "off",
      note: "Not an operator of that host: its operational reads require an admin caller (ADMINS); add a bearer.",
    };
  }
  const tiers = [access.admin ? "admin" : "", access.sql ? "sql" : ""].filter(
    Boolean,
  );
  return {
    label: "Access",
    value: tiers.length > 0 ? tiers.join(", ") : "operator",
    tone: tiers.length > 0 ? "ok" : "neutral",
    note:
      tiers.length > 0
        ? "Levers and raw SQL are served to this monitor."
        : "Operational reads are served; this host's inspection subgraph serves no levers and no SQL.",
  };
}

/** The grid's cells, from the handle's reach and the reactor's reported info. */
export function capabilityCells(
  reach: MonitorReach,
  info: MonitorReactorInfo,
): readonly CapabilityCell[] {
  const { storage } = info;
  return [
    {
      label: "Hosting",
      value: reach.hosting,
      tone: "neutral",
      note:
        reach.hosting === "worker"
          ? "SharedWorker in this origin, reached over RPC."
          : reach.hosting === "in-process"
            ? "The calling thread; every component reachable directly."
            : "An already-running reactor attached over HTTP; nothing was built here.",
    },
    {
      label: "Inspection",
      value: reach.inspection,
      tone: reach.inspection === "none" ? "off" : "neutral",
      note:
        reach.inspection === "direct"
          ? "Live components, nothing serialized."
          : reach.inspection === "rpc"
            ? "Over a transport: a worker message port, or reactor-api's inspection subgraph for a remote reactor."
            : "No inspection surface.",
    },
    {
      label: "Storage",
      value: `${storage.engine} / ${storage.persistence}`,
      tone: "neutral",
      note:
        storage.persistence === "unknown"
          ? "The reactor could not report its store."
          : `A ${storage.engine} store kept in ${storage.persistence}.`,
    },
    {
      label: "Durable",
      ...yesNo(storage.durable),
      note: storage.durable
        ? "An acknowledged write outlives the host."
        : "Everything is gone when the host goes away.",
    },
    {
      label: "Workflows",
      ...yesNo(info.workflows),
      note: info.workflows
        ? "The workflow engine is composed into this reactor."
        : reach.hosting === "remote"
          ? "That host reports no workflow engine; re-check the server if it has since composed one."
          : "Browser host: the engine forks child processes, so it is Node-only.",
    },
    {
      label: "Sync channels",
      value:
        info.syncChannels.length > 0 ? info.syncChannels.join(", ") : "none",
      tone: info.syncChannels.length > 0 ? "neutral" : "off",
      note: syncChannelNote(info.syncChannels),
    },
    accessCell(info),
  ];
}

function CapabilityGrid({
  reach,
  info,
}: {
  readonly reach: MonitorReach;
  readonly info: MonitorReactorInfo;
}) {
  return (
    <ul aria-label="Reactor capabilities" className="rm-cap-grid">
      {capabilityCells(reach, info).map((cell) => (
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

function RemoteHost({
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
          Asks that reactor for its info again.
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
        <dt>Caller</dt>
        <dd data-testid="remote-operator">
          {reactor.info.access === null
            ? "not an operator. Queue, processors, catch-up, sync and attachments: requires an admin caller (ADMINS); add a bearer"
            : "operator: operational reads are served"}
        </dd>
        <dt>Levers and SQL</dt>
        <dd data-testid="remote-levers">
          not served: this host&apos;s inspection subgraph serves reads only
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
        The handle&apos;s reach and the reactor&apos;s own info: what a router
        places collections on.
      </p>
      <CapabilityGrid info={reactor.info} reach={reactor.reach} />

      {reactor.kind === "worker" ? (
        <>
          <h3>Worker host</h3>
          <AdminInfo reactor={reactor} />
        </>
      ) : reactor.kind === "remote" ? (
        <>
          <h3>Remote host</h3>
          <RemoteHost
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
