import type {
  ManagedReactor,
  ManagedWorkerReactor,
  ReactorCapabilities,
} from "@powerhousedao/reactor-monitor";
import { useCallback, useEffect, useState } from "react";
import type { WorkerInspectorInfo } from "@powerhousedao/reactor-browser/rpc";

export type OverviewTabProps = {
  readonly reactor: ManagedReactor;
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
            : "Already-running reactor behind HTTP/GraphQL (stage 3).",
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
        ? "May run the workflow engine."
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
            ? "Proxy over a message port: only what the dispatch layer models crosses."
            : "No inspection surface (W3.2 serves IInspector remotely).",
    },
    {
      label: "Sync channels",
      value:
        capabilities.syncChannels.length > 0
          ? capabilities.syncChannels.join(", ")
          : "none",
      tone: capabilities.syncChannels.length > 0 ? "neutral" : "off",
      note: capabilities.syncChannels.includes("local")
        ? "Brokered-MessagePort LocalChannel peers; linkable from the Sync tab."
        : capabilities.syncChannels.includes("gql")
          ? "Connect/Switchboard GraphQL channels; add a remote from the Sync tab."
          : "No sync module was built: this reactor is an island.",
    },
    {
      label: "Self-heal",
      ...yesNo(capabilities.selfHeal),
      note: capabilities.selfHeal
        ? "A poisoned PGlite session is recreated in place against the same store."
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

export function OverviewTab({ reactor }: OverviewTabProps) {
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
