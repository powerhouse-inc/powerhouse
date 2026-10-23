/**
 * Ported from
 * packages/design-system/src/connect/components/processors-inspector/processors-inspector.tsx
 * for the same reason as QueueTab.tsx (see its header comment): the source
 * depends on the design-system's private `#design-system` Icon import and
 * Tailwind theme classes. This keeps the prop contract (poll + retry) in
 * plain CSS.
 */
import {
  computeProgress,
  type CatchUpStatus,
  type FactoryProgress,
  type InspectorProcessorInfo,
  type ProcessorPhase,
  type ProcessorProgress,
} from "@powerhousedao/reactor";
import type {
  MonitorInspector,
  ProcessorLevers,
} from "@powerhousedao/reactor-monitor";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  ADMIN_ALLOWED,
  AdminGateNote,
  type AdminGate,
} from "../components/AdminGate.js";
import {
  percentOf,
  ProgressBar,
  type ProgressTone,
} from "../components/ProgressBar.js";
import { withHead } from "../lib/catch-up.js";

export type ProcessorsTabProps = {
  readonly inspector: MonitorInspector;
  /** Processor retry and rerun; absent where the reactor serves no levers. */
  readonly levers?: ProcessorLevers;
  readonly admin?: AdminGate;
};

type RerunOptions = Parameters<ProcessorLevers["rerunProcessor"]>[1];

/** One processor to rerun, and how. */
export type RerunRequest = {
  readonly processorId: string;
  readonly options: RerunOptions;
};

const POLL_INTERVAL_MS = 2000;
const COLUMNS = 8;

const PHASE_TONE: Record<ProcessorPhase, ProgressTone> = {
  "catching-up": "active",
  live: "done",
  errored: "error",
};

/** What a factory's and a processor's progress have in common. */
type Measured = {
  readonly phase: ProcessorPhase;
  readonly fraction: number;
  readonly done: number;
  readonly total: number;
};

function valueOf({ phase, fraction }: Measured): string {
  if (phase === "errored") return "errored";
  if (phase === "live") return "done";
  return `${percentOf(fraction)}%`;
}

function detailOf(measured: Measured): string {
  const ordinals = `${measured.done} of ${measured.total} ordinals`;
  if (measured.phase === "live") return "done";
  if (measured.phase === "errored") {
    return `errored at ${percentOf(measured.fraction)}%, ${ordinals}`;
  }
  return `${percentOf(measured.fraction)}%, ${ordinals}`;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function processorName(row: ProcessorProgress, perDrive: boolean): string {
  return perDrive ? row.driveId : `${row.driveId} #${row.processorIndex}`;
}

/** A checkbox for a set of processors: checked when all are, mixed when some are. */
function SelectBox({
  label,
  ids,
  selected,
  onChange,
  disabled,
}: {
  readonly label: string;
  readonly ids: readonly string[];
  readonly selected: ReadonlySet<string>;
  readonly onChange: (ids: readonly string[], checked: boolean) => void;
  readonly disabled: boolean;
}) {
  const chosen = ids.filter((id) => selected.has(id)).length;
  const all = ids.length > 0 && chosen === ids.length;
  return (
    <input
      aria-label={label}
      checked={all}
      disabled={disabled || ids.length === 0}
      onChange={(event) => onChange(ids, event.target.checked)}
      ref={(element) => {
        if (element) element.indeterminate = chosen > 0 && !all;
      }}
      type="checkbox"
    />
  );
}

/** Asks how to rerun the selected processors: cleared from their floors, or replayed. */
function RerunForm({
  processors,
  onRerun,
  onCancel,
}: {
  readonly processors: readonly InspectorProcessorInfo[];
  readonly onRerun: (requests: RerunRequest[]) => Promise<void>;
  readonly onCancel: () => void;
}) {
  const unclearable = processors.filter((p) => !p.clearable).length;
  const single = processors.length === 1 ? processors[0] : undefined;
  const [clear, setClear] = useState(unclearable === 0);
  const [from, setFrom] = useState(String(single?.floor ?? 0));
  const [pending, setPending] = useState(false);
  const fromOrdinal = Number(from);
  const inRange =
    single === undefined ||
    (from.trim() !== "" &&
      Number.isInteger(fromOrdinal) &&
      fromOrdinal >= single.floor &&
      fromOrdinal <= single.lastOrdinal);
  const count = plural(processors.length, "processor", "processors");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!clear && !inRange) {
      return;
    }
    setPending(true);
    await onRerun(
      processors.map((processor) => ({
        processorId: processor.processorId,
        options: {
          clear,
          fromOrdinal: single && !clear ? fromOrdinal : processor.floor,
        },
      })),
    );
    setPending(false);
  };

  return (
    <form
      aria-label={`Rerun ${count}`}
      className="rm-form rm-form-inline rm-rerun-form"
      data-testid="rerun-form"
      onSubmit={(event) => void submit(event)}
    >
      <label className="rm-check">
        <input
          checked={clear}
          disabled={unclearable > 0}
          onChange={(event) => setClear(event.target.checked)}
          type="checkbox"
        />
        Clear {single ? "its read model" : "their read models"} first
      </label>
      {clear ? (
        <p className="rm-note" data-testid="rerun-clear-note">
          {single
            ? `Replays from ordinal ${single.floor}.`
            : "Replays each from its first ordinal."}{" "}
          Processors of the same drive that share a read model are cleared and
          replayed with it.
        </p>
      ) : single ? (
        <label>
          Replay operations above ordinal ({single.floor}–{single.lastOrdinal})
          <input
            max={single.lastOrdinal}
            min={single.floor}
            onChange={(event) => setFrom(event.target.value)}
            step={1}
            type="number"
            value={from}
          />
        </label>
      ) : (
        <p className="rm-note" data-testid="rerun-replay-note">
          Replays each from its first ordinal, keeping what it already holds.
        </p>
      )}
      {unclearable > 0 ? (
        <p className="rm-note" data-testid="rerun-not-clearable">
          {single
            ? "This processor cannot clear its read model, so a rerun only replays."
            : `${plural(unclearable, "of these cannot", "of these cannot")} clear a read model, so this rerun only replays.`}
        </p>
      ) : null}
      <button
        className="rm-btn rm-btn-warn"
        disabled={pending || (!clear && !inRange)}
        type="submit"
      >
        {pending ? "Rerunning…" : `Rerun ${count}`}
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
  const [catchUp, setCatchUp] = useState<CatchUpStatus | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [rerunOpen, setRerunOpen] = useState(false);
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
    // The head only scales the bars; without it they fall back to the cursors.
    try {
      setCatchUp(withHead(await inspector.getCatchUpStatus()));
    } catch {
      setCatchUp(undefined);
    }
  }, [inspector]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks-extra/set-state-in-effect
    void load();
    const interval = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const byId = useMemo(
    () => new Map(processors.map((p) => [p.processorId, p])),
    [processors],
  );
  // A processor that went away is no longer selected.
  const chosen = useMemo(
    () => processors.filter((p) => selected.has(p.processorId)),
    [processors, selected],
  );
  const progress = useMemo(
    () => computeProgress(processors, catchUp),
    [processors, catchUp],
  );

  const select = useCallback((ids: readonly string[], checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

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
    async (requests: RerunRequest[]) => {
      if (!levers) {
        return;
      }
      const results = await Promise.allSettled(
        requests.map((request) =>
          levers.rerunProcessor(request.processorId, request.options),
        ),
      );
      const failures = results.flatMap((result, index) =>
        result.status === "rejected"
          ? [
              `${requests[index]!.processorId}: ${
                result.reason instanceof Error
                  ? result.reason.message
                  : String(result.reason)
              }`,
            ]
          : [],
      );
      const started = requests.length - failures.length;
      setRerunError(failures.length > 0 ? failures.join("; ") : null);
      setRerunNote(
        started > 0
          ? `Rerun of ${plural(started, "processor", "processors")} is under way; the bars show how far each has got.`
          : null,
      );
      if (failures.length === 0) {
        setRerunOpen(false);
        setSelected(new Set());
      }
      await load();
    },
    [levers, load],
  );

  const leversOpen = admin.enabled && !!levers;
  const activeCount = processors.filter((p) => p.status === "active").length;
  const erroredCount = processors.filter((p) => p.status === "errored").length;
  const allIds = processors.map((p) => p.processorId);

  const factoryRow = (factory: FactoryProgress) => {
    const ids = factory.processors.map((row) => row.processorId);
    const label = `${factory.label} (${plural(factory.driveCount, "drive", "drives")})`;
    return (
      <tr className="rm-factory-row" key={`factory:${factory.factoryId}`}>
        <td>
          <SelectBox
            disabled={!leversOpen}
            ids={ids}
            label={`Select every processor of ${factory.label}`}
            onChange={select}
            selected={selected}
          />
        </td>
        <td colSpan={2} title={factory.factoryId}>
          <strong>{label}</strong>
        </td>
        <td className="rm-progress-cell">
          <ProgressBar
            detail={detailOf(factory)}
            fraction={factory.fraction}
            hideLabel
            label={label}
            tone={PHASE_TONE[factory.phase]}
            value={valueOf(factory)}
          />
        </td>
        <td colSpan={COLUMNS - 4} />
      </tr>
    );
  };

  const processorRow = (row: ProcessorProgress, perDrive: boolean) => {
    const processor = byId.get(row.processorId);
    if (!processor) return null;
    const name = processorName(row, perDrive);
    return (
      <tr
        className={processor.status === "errored" ? "rm-row-error" : undefined}
        key={row.processorId}
      >
        <td>
          <input
            aria-label={`Select ${processor.processorId}`}
            checked={selected.has(processor.processorId)}
            disabled={!leversOpen}
            onChange={(event) =>
              select([processor.processorId], event.target.checked)
            }
            type="checkbox"
          />
        </td>
        <td className="rm-processor-name" title={processor.processorId}>
          {name}
        </td>
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
        <td className="rm-progress-cell">
          <ProgressBar
            detail={detailOf(row)}
            fraction={row.fraction}
            hideLabel
            label={processor.processorId}
            tone={PHASE_TONE[row.phase]}
            value={valueOf(row)}
          />
        </td>
        <td>{processor.lastOrdinal}</td>
        <td title={processor.lastError}>{processor.lastError ?? "-"}</td>
        <td>
          {processor.lastErrorTimestamp
            ? processor.lastErrorTimestamp.toLocaleString()
            : "-"}
        </td>
        <td>
          {processor.status === "errored" ? (
            <button
              className="rm-btn rm-btn-warn"
              disabled={retryingId === processor.processorId || !leversOpen}
              onClick={() => void handleRetry(processor.processorId)}
              type="button"
            >
              Retry
            </button>
          ) : null}
        </td>
      </tr>
    );
  };

  return (
    <div className="rm-tab">
      <AdminGateNote gate={admin} />
      <div className="rm-tab-header">
        <h2>Processors</h2>
        <div className="rm-actions">
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
          <button
            className="rm-btn rm-btn-warn"
            disabled={!leversOpen || chosen.length === 0}
            onClick={() => {
              setRerunError(null);
              setRerunOpen((open) => !open);
            }}
            type="button"
          >
            Rerun {plural(chosen.length, "processor", "processors")}
          </button>
        </div>
      </div>

      {rerunOpen && chosen.length > 0 ? (
        <RerunForm
          key={chosen.map((p) => p.processorId).join("|")}
          onCancel={() => setRerunOpen(false)}
          onRerun={handleRerun}
          processors={chosen}
        />
      ) : null}

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
      {processors.length > 0 && !progress.headKnown ? (
        <p className="rm-note" data-testid="progress-head-unknown">
          The head is unknown here, so progress is measured against the highest
          processor cursor.
        </p>
      ) : null}

      <div className="rm-table-wrap">
        <table className="rm-table" data-testid="processor-progress">
          <thead>
            <tr>
              <th>
                <SelectBox
                  disabled={!leversOpen}
                  ids={allIds}
                  label="Select every processor"
                  onChange={select}
                  selected={selected}
                />
              </th>
              <th>Processor</th>
              <th>Status</th>
              <th>Progress</th>
              <th>Last Ordinal</th>
              <th>Error</th>
              <th>Error At</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {processors.length === 0 ? (
              <tr>
                <td className="rm-table-empty" colSpan={COLUMNS}>
                  {loading ? "Loading..." : "No processors registered"}
                </td>
              </tr>
            ) : (
              progress.factories.map((factory) => {
                const perDrive =
                  factory.processors.length === factory.driveCount;
                return (
                  <Fragment key={factory.factoryId}>
                    {factoryRow(factory)}
                    {factory.processors.map((row) =>
                      processorRow(row, perDrive),
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ProcessorsTab;
