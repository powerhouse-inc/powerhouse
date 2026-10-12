/**
 * Ported from
 * packages/design-system/src/connect/components/processors-inspector/processors-inspector.tsx
 * for the same reason as QueueTab.tsx (see its header comment): the source
 * depends on the design-system's private `#design-system` Icon import and
 * Tailwind theme classes. This keeps the prop contract (poll + retry) in
 * plain CSS.
 */
import type {
  IInspectorAdmin,
  InspectorProcessorInfo,
} from "@powerhousedao/reactor";
import type { MonitorInspector } from "@powerhousedao/reactor-monitor";
import { useCallback, useEffect, useState } from "react";
import {
  ADMIN_ALLOWED,
  AdminGateNote,
  type AdminGate,
} from "../components/AdminGate.js";

export type ProcessorsTabProps = {
  readonly inspector: MonitorInspector;
  /** Processor retry; absent where the reactor serves no levers. */
  readonly levers?: IInspectorAdmin;
  readonly admin?: AdminGate;
};

const POLL_INTERVAL_MS = 2000;

export function ProcessorsTab({
  inspector,
  levers,
  admin = ADMIN_ALLOWED,
}: ProcessorsTabProps) {
  const [processors, setProcessors] = useState<InspectorProcessorInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setProcessors(await inspector.getProcessors());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [inspector]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks-extra/set-state-in-effect
    void load();
    const interval = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const handleRetry = useCallback(
    async (processorId: string) => {
      if (!levers) {
        return;
      }
      setRetryingId(processorId);
      try {
        await levers.retryProcessor(processorId);
        setRetryError(null);
      } catch (e) {
        setRetryError(e instanceof Error ? e.message : String(e));
      } finally {
        setRetryingId(null);
      }
      await load();
    },
    [levers, load],
  );

  const activeCount = processors.filter((p) => p.status === "active").length;
  const erroredCount = processors.filter((p) => p.status === "errored").length;

  return (
    <div className="rm-tab">
      <AdminGateNote gate={admin} />
      <div className="rm-tab-header">
        <h2>Processors</h2>
        <button
          className="rm-btn"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            void load();
          }}
          type="button"
        >
          Refresh
        </button>
      </div>

      <div className="rm-stat-bar">
        <span>
          Total: <strong>{processors.length}</strong>
        </span>
        <span>
          <span className="rm-dot rm-dot-ok" /> Active:{" "}
          <strong>{activeCount}</strong>
        </span>
        <span>
          <span className="rm-dot rm-dot-error" /> Errored:{" "}
          <strong>{erroredCount}</strong>
        </span>
      </div>

      {error ? (
        <p className="rm-error">Failed to load processors: {error}</p>
      ) : null}
      {retryError ? (
        <p className="rm-error" role="alert">
          Retry failed: {retryError}
        </p>
      ) : null}

      <div className="rm-table-wrap">
        <table className="rm-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Processor ID</th>
              <th>Factory ID</th>
              <th>Drive ID</th>
              <th>Index</th>
              <th>Last Ordinal</th>
              <th>Error</th>
              <th>Error At</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {processors.length === 0 ? (
              <tr>
                <td className="rm-table-empty" colSpan={9}>
                  {loading ? "Loading..." : "No processors registered"}
                </td>
              </tr>
            ) : (
              processors.map((processor) => (
                <tr
                  key={processor.processorId}
                  className={
                    processor.status === "errored" ? "rm-row-error" : undefined
                  }
                >
                  <td>
                    <span
                      className={
                        processor.status === "active"
                          ? "rm-badge rm-badge-ok"
                          : "rm-badge rm-badge-error"
                      }
                    >
                      {processor.status}
                    </span>
                  </td>
                  <td title={processor.processorId}>{processor.processorId}</td>
                  <td title={processor.factoryId}>{processor.factoryId}</td>
                  <td title={processor.driveId}>{processor.driveId}</td>
                  <td>{processor.processorIndex}</td>
                  <td>{processor.lastOrdinal}</td>
                  <td title={processor.lastError}>
                    {processor.lastError ?? "-"}
                  </td>
                  <td>
                    {processor.lastErrorTimestamp
                      ? processor.lastErrorTimestamp.toLocaleString()
                      : "-"}
                  </td>
                  <td>
                    {processor.status === "errored" ? (
                      <button
                        className="rm-btn rm-btn-warn"
                        disabled={
                          retryingId === processor.processorId ||
                          !admin.enabled ||
                          !levers
                        }
                        onClick={() => void handleRetry(processor.processorId)}
                        type="button"
                      >
                        Retry
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ProcessorsTab;
