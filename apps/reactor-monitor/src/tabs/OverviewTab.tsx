import type {
  ManagedReactor,
  ManagedWorkerReactor,
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

      {reactor.kind === "worker" ? (
        <>
          <h3>Worker capabilities</h3>
          <p className="rm-note">
            Hosted in a SharedWorker and reached over RPC. The client, inspector
            and sync manager are proxies; raw SQL and inspection calls cross a
            message port. Admin lifecycle (restart, info) is only available on
            this kind.
          </p>
          <AdminInfo reactor={reactor} />
        </>
      ) : (
        <>
          <h3>In-process capabilities</h3>
          <p className="rm-note">
            Built on the calling thread: the client, inspector and sync manager
            are the live components directly, with no RPC hop. No admin
            lifecycle (restart/info) — those are worker-only affordances.
          </p>
        </>
      )}
    </div>
  );
}

export default OverviewTab;
