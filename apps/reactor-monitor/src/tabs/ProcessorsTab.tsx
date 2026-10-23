/**
 * Ported from
 * packages/design-system/src/connect/components/processors-inspector/processors-inspector.tsx
 * for the same reason as QueueTab.tsx (see its header comment): the source
 * depends on the design-system's private `#design-system` Icon import and
 * Tailwind theme classes. This keeps the prop contract (poll + retry) in
 * plain CSS.
 */
import type { InspectorProcessorInfo } from "@powerhousedao/reactor";
import type {
  MonitorInspector,
  ProcessorLevers,
} from "@powerhousedao/reactor-monitor";
import {
  Fragment,
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import {
  ADMIN_ALLOWED,
  AdminGateNote,
  type AdminGate,
} from "../components/AdminGate.js";

export type ProcessorsTabProps = {
  readonly inspector: MonitorInspector;
  /** Processor retry and rerun; absent where the reactor serves no levers. */
  readonly levers?: ProcessorLevers;
  readonly admin?: AdminGate;
};

type RerunOptions = Parameters<ProcessorLevers["rerunProcessor"]>[1];

const POLL_INTERVAL_MS = 2000;

/** Asks how to rerun one processor: cleared from its floor, or from an ordinal. */
function RerunForm({
  processor,
  onRerun,
  onCancel,
}: {
  readonly processor: InspectorProcessorInfo;
  readonly onRerun: (options: RerunOptions) => Promise<void>;
  readonly onCancel: () => void;
}) {
  const { floor, lastOrdinal, clearable } = processor;
  const [clear, setClear] = useState(clearable);
  const [from, setFrom] = useState(String(floor));
  const [pending, setPending] = useState(false);
  const fromOrdinal = Number(from);
  const inRange =
    from.trim() !== "" &&
    Number.isInteger(fromOrdinal) &&
    fromOrdinal >= floor &&
    fromOrdinal <= lastOrdinal;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!clear && !inRange) {
      return;
    }
    setPending(true);
    await onRerun({ clear, fromOrdinal: clear ? floor : fromOrdinal });
    setPending(false);
  };

  return (
    <form
      aria-label={`Rerun ${processor.processorId}`}
      className="rm-form rm-form-inline"
      data-testid="rerun-form"
      onSubmit={(event) => void submit(event)}
    >
      <label className="rm-check">
        <input
          checked={clear}
          disabled={!clearable}
          onChange={(event) => setClear(event.target.checked)}
          type="checkbox"
        />
        Clear its read model first
      </label>
      {clear ? (
        <p className="rm-note" data-testid="rerun-clear-note">
          Replays from ordinal {floor}. Processors of this drive that share its
          read model are cleared and replayed with it.
        </p>
      ) : (
        <label>
          Replay operations above ordinal ({floor}–{lastOrdinal})
          <input
            max={lastOrdinal}
            min={floor}
            onChange={(event) => setFrom(event.target.value)}
            step={1}
            type="number"
            value={from}
          />
        </label>
      )}
      {clearable ? null : (
        <p className="rm-note" data-testid="rerun-not-clearable">
          This processor cannot clear its read model, so a rerun only replays.
        </p>
      )}
      <button
        className="rm-btn rm-btn-warn"
        disabled={pending || (!clear && !inRange)}
        type="submit"
      >
        {pending ? "Rerunning…" : "Rerun"}
      </button>
      <button className="rm-btn" onClick={onCancel} type="button">
        Cancel
      </button>
    </form>
  );
}

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
  const [rerunId, setRerunId] = useState<string | null>(null);
  const [rerunError, setRerunError] = useState<string | null>(null);
  const [rerunNote, setRerunNote] = useState<string | null>(null);

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

  const handleRerun = useCallback(
    async (processorId: string, options: RerunOptions) => {
      if (!levers) {
        return;
      }
      try {
        await levers.rerunProcessor(processorId, options);
        setRerunError(null);
        setRerunNote(
          `Rerun of ${processorId} is under way; its last ordinal climbs as it replays.`,
        );
        setRerunId(null);
      } catch (e) {
        setRerunNote(null);
        setRerunError(e instanceof Error ? e.message : String(e));
      }
      await load();
    },
    [levers, load],
  );

  const leversOpen = admin.enabled && !!levers;
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
      {rerunError ? (
        <p className="rm-error" role="alert">
          Rerun failed: {rerunError}
        </p>
      ) : null}
      {rerunNote ? (
        <p className="rm-note" role="status">
          {rerunNote}
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
                <Fragment key={processor.processorId}>
                  <tr
                    className={
                      processor.status === "errored"
                        ? "rm-row-error"
                        : undefined
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
                    <td title={processor.processorId}>
                      {processor.processorId}
                    </td>
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
                            retryingId === processor.processorId || !leversOpen
                          }
                          onClick={() =>
                            void handleRetry(processor.processorId)
                          }
                          type="button"
                        >
                          Retry
                        </button>
                      ) : null}
                      <button
                        className="rm-btn"
                        disabled={!leversOpen}
                        onClick={() => {
                          setRerunError(null);
                          setRerunId(processor.processorId);
                        }}
                        type="button"
                      >
                        Rerun…
                      </button>
                    </td>
                  </tr>
                  {rerunId === processor.processorId ? (
                    <tr>
                      <td colSpan={9}>
                        <RerunForm
                          onCancel={() => setRerunId(null)}
                          onRerun={(options) =>
                            handleRerun(processor.processorId, options)
                          }
                          processor={processor}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ProcessorsTab;
