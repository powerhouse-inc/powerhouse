/**
 * Ported from
 * packages/design-system/src/connect/components/catch-up-inspector/catch-up-inspector.tsx
 * for the same reason as QueueTab.tsx (see its header comment).
 */
import type { CatchUpStatus, IInspector } from "@powerhousedao/reactor";
import { useCallback, useEffect, useState } from "react";
import {
  ADMIN_ALLOWED,
  AdminGateNote,
  type AdminGate,
} from "../components/AdminGate.js";

export type CatchUpTabProps = {
  readonly inspector: IInspector;
  /** Whether an on-demand sweep is served for this reactor. */
  readonly admin?: AdminGate;
};

const POLL_INTERVAL_MS = 2000;

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export function CatchUpTab({
  inspector,
  admin = ADMIN_ALLOWED,
}: CatchUpTabProps) {
  const [status, setStatus] = useState<CatchUpStatus | undefined>();
  const [loading, setLoading] = useState(true);
  const [sweeping, setSweeping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number | undefined>();

  const load = useCallback(async () => {
    try {
      setStatus(await inspector.getCatchUpStatus());
      setNow(Date.now());
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

  const handleSweepNow = useCallback(async () => {
    setSweeping(true);
    try {
      await inspector.sweepCatchUp();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSweeping(false);
    }
    await load();
  }, [inspector, load]);

  const watermark = status?.watermark;
  const consumers = status?.consumers ?? [];
  const settledThrough = watermark?.settledThrough ?? 0;
  const blockedCount = consumers.filter((c) => c.blockedAt).length;

  return (
    <div className="rm-tab">
      <AdminGateNote gate={admin} />
      <div className="rm-tab-header">
        <h2>Catch-up</h2>
        <div className="rm-actions">
          <button
            className="rm-btn"
            disabled={sweeping || !admin.enabled}
            onClick={() => void handleSweepNow()}
            type="button"
          >
            Sweep now
          </button>
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
      </div>

      {watermark ? (
        <div className="rm-stat-bar">
          <span>
            Head: <strong>{watermark.head}</strong>
          </span>
          <span>
            Settled through: <strong>{watermark.settledThrough}</strong>
          </span>
          <span>
            Lag: <strong>{watermark.head - watermark.settledThrough}</strong>
          </span>
          <span>
            Waiting on:{" "}
            <strong>{watermark.waitingOn.join(", ") || "none"}</strong>
          </span>
          {watermark.stalledSinceUtcMs !== undefined && now !== undefined ? (
            <span className="rm-warning-inline">
              Stalled for {formatDuration(now - watermark.stalledSinceUtcMs)}
            </span>
          ) : null}
          <span>
            Blocked: <strong>{blockedCount}</strong>
          </span>
        </div>
      ) : null}

      {error ? (
        <p className="rm-error">Catch-up request failed: {error}</p>
      ) : null}

      <div className="rm-table-wrap">
        <table className="rm-table">
          <thead>
            <tr>
              <th>Consumer</th>
              <th>Thread</th>
              <th>Applied Through</th>
              <th>Lag</th>
              <th>Tracked Above</th>
              <th>Last Advance</th>
              <th>Blocked At</th>
              <th>Document</th>
              <th>Type</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {consumers.length === 0 ? (
              <tr>
                <td className="rm-table-empty" colSpan={10}>
                  {loading && !status ? "Loading..." : "No catch-up consumers"}
                </td>
              </tr>
            ) : (
              consumers.map((consumer) => {
                const blocked = consumer.blockedAt;
                return (
                  <tr
                    key={consumer.consumerId}
                    className={blocked ? "rm-row-error" : undefined}
                  >
                    <td title={consumer.consumerId}>{consumer.consumerId}</td>
                    <td>{consumer.thread}</td>
                    <td>{consumer.appliedThrough}</td>
                    <td>{settledThrough - consumer.appliedThrough}</td>
                    <td>{consumer.trackedAbove}</td>
                    <td>
                      {new Date(consumer.lastAdvanceUtcMs).toLocaleString()}
                    </td>
                    <td>{blocked ? blocked.ordinal : "-"}</td>
                    <td title={blocked?.documentId}>
                      {blocked ? blocked.documentId : "-"}
                    </td>
                    <td>{blocked ? blocked.type : "-"}</td>
                    <td title={blocked?.error}>
                      {blocked ? blocked.error : "-"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default CatchUpTab;
