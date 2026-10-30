import {
  formatCount,
  formatDuration,
  type InspectorProcessorTiming,
  type InspectorProcessorTimingReport,
  type ProcessorTimingCounters,
} from "@powerhousedao/reactor";
import { Fragment, useMemo, useState } from "react";

/** Which numbers the view's columns show. */
export type TimingHorizon = "window" | "total" | "current";
/** Which delivery path they cover. */
export type TimingPath = "both" | "live" | "replay";
export type TimingGrouping = "factory" | "drive" | "none";

type Numbers = Omit<
  ProcessorTimingCounters,
  "slotWaitMs" | "pauseMs" | "pages" | "opsMatched"
> & { busyMs: number };

const NO_NUMBERS: Numbers = {
  batches: 0,
  opsDelivered: 0,
  opsScanned: 0,
  handlerMs: 0,
  maxBatchMs: 0,
  readMs: 0,
  lookupMs: 0,
  fillMs: 0,
  errors: 0,
  busyMs: 0,
};

function fromCounters(counters: ProcessorTimingCounters): Numbers {
  return {
    batches: counters.batches,
    opsDelivered: counters.opsDelivered,
    opsScanned: counters.opsScanned,
    handlerMs: counters.handlerMs,
    maxBatchMs: counters.maxBatchMs,
    readMs: counters.readMs,
    lookupMs: counters.lookupMs,
    fillMs: counters.fillMs,
    errors: counters.errors,
    busyMs:
      counters.handlerMs +
      counters.readMs +
      counters.lookupMs +
      counters.fillMs,
  };
}

function added(a: Numbers, b: Numbers): Numbers {
  return {
    batches: a.batches + b.batches,
    opsDelivered: a.opsDelivered + b.opsDelivered,
    opsScanned: a.opsScanned + b.opsScanned,
    handlerMs: a.handlerMs + b.handlerMs,
    maxBatchMs: Math.max(a.maxBatchMs, b.maxBatchMs),
    readMs: a.readMs + b.readMs,
    lookupMs: a.lookupMs + b.lookupMs,
    fillMs: a.fillMs + b.fillMs,
    errors: a.errors + b.errors,
    busyMs: a.busyMs + b.busyMs,
  };
}

/** One row's numbers for a horizon and path. A run is replay only. */
export function numbersOf(
  row: InspectorProcessorTiming,
  horizon: TimingHorizon,
  path: TimingPath,
): Numbers {
  if (horizon === "current") {
    const counters = row.currentRun?.counters;
    return counters && path !== "live" ? fromCounters(counters) : NO_NUMBERS;
  }
  const numbers = row[horizon];
  if (!numbers) return NO_NUMBERS;
  if (path === "live") return fromCounters(numbers.live);
  if (path === "replay") return fromCounters(numbers.replay);
  return added(fromCounters(numbers.live), fromCounters(numbers.replay));
}

type SortKey =
  | "busyWindow"
  | "busyTotal"
  | "handler"
  | "read"
  | "fill"
  | "lookup"
  | "batches"
  | "avg"
  | "max"
  | "delivered"
  | "rate"
  | "queue"
  | "behind"
  | "eta"
  | "errors";

const COLUMNS: readonly { key: SortKey; label: string; title?: string }[] = [
  { key: "busyWindow", label: "Busy (window)" },
  { key: "busyTotal", label: "Busy (total)" },
  { key: "handler", label: "Handler" },
  { key: "read", label: "Read", title: "Includes waiting for the store" },
  { key: "fill", label: "Fill" },
  { key: "lookup", label: "Lookup" },
  { key: "batches", label: "Batches" },
  { key: "avg", label: "Avg ms" },
  { key: "max", label: "Max ms" },
  {
    key: "delivered",
    label: "Delivered / Scanned",
    title: "A low share means the log is read mostly to be filtered out",
  },
  { key: "rate", label: "op/s" },
  { key: "queue", label: "Queue" },
  { key: "behind", label: "Behind" },
  { key: "eta", label: "ETA" },
  { key: "errors", label: "Errors" },
];

function sortValue(
  row: InspectorProcessorTiming,
  key: SortKey,
  horizon: TimingHorizon,
  path: TimingPath,
): number {
  const numbers = numbersOf(row, horizon, path);
  switch (key) {
    case "busyWindow":
      return numbersOf(row, "window", path).busyMs;
    case "busyTotal":
      return numbersOf(row, "total", path).busyMs;
    case "handler":
      return numbers.handlerMs;
    case "read":
      return numbers.readMs;
    case "fill":
      return numbers.fillMs;
    case "lookup":
      return numbers.lookupMs;
    case "batches":
      return numbers.batches;
    case "avg":
      return numbers.batches > 0 ? numbers.handlerMs / numbers.batches : 0;
    case "max":
      return numbers.maxBatchMs;
    case "delivered":
      return numbers.opsDelivered;
    case "rate":
      return row.opsPerSecond;
    case "queue":
      return row.queueDepth.ops;
    case "behind":
      return row.ordinalsBehind;
    case "eta":
      return row.etaMs ?? 0;
    case "errors":
      return numbers.errors;
  }
}

/** Rows ordered by a column, largest first unless `ascending`. */
export function sortTiming(
  rows: readonly InspectorProcessorTiming[],
  key: SortKey,
  ascending: boolean,
  horizon: TimingHorizon,
  path: TimingPath,
): InspectorProcessorTiming[] {
  const direction = ascending ? 1 : -1;
  return [...rows].sort(
    (a, b) =>
      direction *
        (sortValue(a, key, horizon, path) - sortValue(b, key, horizon, path)) ||
      a.processorId.localeCompare(b.processorId),
  );
}

function shortFactory(factoryId: string): string {
  return factoryId.split(/[\\/]/).filter(Boolean).at(-1) ?? factoryId;
}

/** Groups in first-seen order, so a sort also orders the groups. */
export function groupTiming(
  rows: readonly InspectorProcessorTiming[],
  grouping: TimingGrouping,
): { key: string; label: string; rows: InspectorProcessorTiming[] }[] {
  if (grouping === "none") return [{ key: "", label: "", rows: [...rows] }];
  const groups = new Map<
    string,
    { key: string; label: string; rows: InspectorProcessorTiming[] }
  >();
  for (const row of rows) {
    const key = grouping === "factory" ? row.factoryId : row.driveId;
    const label =
      grouping === "factory" ? shortFactory(row.factoryId) : row.driveLabel;
    const group = groups.get(key) ?? { key, label, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function deliveredCell(numbers: Numbers): string {
  const share =
    numbers.opsScanned > 0
      ? ` (${Math.round((numbers.opsDelivered / numbers.opsScanned) * 100)}%)`
      : "";
  return `${formatCount(numbers.opsDelivered)} / ${formatCount(numbers.opsScanned)}${share}`;
}

function lastRunCell(row: InspectorProcessorTiming): string {
  return row.lastRun
    ? `${formatDuration(row.lastRun.durationMs)}, ${formatCount(row.lastRun.opsDelivered)} ops`
    : "-";
}

function NumberCells({
  numbers,
  windowBusy,
  totalBusy,
}: {
  readonly numbers: Numbers;
  readonly windowBusy: number;
  readonly totalBusy: number;
}) {
  return (
    <>
      <td>{formatDuration(windowBusy)}</td>
      <td>{formatDuration(totalBusy)}</td>
      <td>{formatDuration(numbers.handlerMs)}</td>
      <td>{formatDuration(numbers.readMs)}</td>
      <td>{formatDuration(numbers.fillMs)}</td>
      <td>{formatDuration(numbers.lookupMs)}</td>
      <td>{formatCount(numbers.batches)}</td>
      <td>
        {numbers.batches > 0
          ? Math.round(numbers.handlerMs / numbers.batches)
          : "-"}
      </td>
      <td>{Math.round(numbers.maxBatchMs)}</td>
      <td>{deliveredCell(numbers)}</td>
    </>
  );
}

function sumNumbers(
  rows: readonly InspectorProcessorTiming[],
  horizon: TimingHorizon,
  path: TimingPath,
): Numbers {
  return rows.reduce(
    (sum, row) => added(sum, numbersOf(row, horizon, path)),
    NO_NUMBERS,
  );
}

export type ProcessorTimingViewProps = {
  readonly report: InspectorProcessorTimingReport;
};

/** Every processor's time, sortable, per horizon and delivery path. */
export function ProcessorTimingView({ report }: ProcessorTimingViewProps) {
  const [horizon, setHorizon] = useState<TimingHorizon>("window");
  const [path, setPath] = useState<TimingPath>("both");
  const [grouping, setGrouping] = useState<TimingGrouping>("none");
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean }>({
    key: "busyWindow",
    ascending: false,
  });

  const groups = useMemo(
    () =>
      groupTiming(
        sortTiming(report.processors, sort.key, sort.ascending, horizon, path),
        grouping,
      ),
    [report, sort, horizon, path, grouping],
  );

  const windowLabel = `Last ${Math.round(report.windowMs / 1000)} s`;
  const allWindowBusy = sumNumbers(report.processors, "window", path).busyMs;
  const wallShare = report.windowMs > 0 ? allWindowBusy / report.windowMs : 0;

  const groupCells = (rows: readonly InspectorProcessorTiming[]) => (
    <>
      <NumberCells
        numbers={sumNumbers(rows, horizon, path)}
        totalBusy={sumNumbers(rows, "total", path).busyMs}
        windowBusy={sumNumbers(rows, "window", path).busyMs}
      />
      <td>
        {formatCount(rows.reduce((sum, row) => sum + row.opsPerSecond, 0))}
      </td>
      <td>
        {formatCount(rows.reduce((sum, row) => sum + row.queueDepth.ops, 0))}
      </td>
      <td colSpan={3} />
      <td>{sumNumbers(rows, horizon, path).errors}</td>
    </>
  );

  return (
    <>
      <div className="rm-actions" data-testid="timing-controls">
        <label className="rm-priority-control">
          Horizon
          <select
            aria-label="Horizon"
            onChange={(event) =>
              setHorizon(event.target.value as TimingHorizon)
            }
            value={horizon}
          >
            <option value="window">{windowLabel}</option>
            <option value="total">Since start</option>
            <option value="current">Current run</option>
          </select>
        </label>
        <label className="rm-priority-control">
          Path
          <select
            aria-label="Path"
            onChange={(event) => setPath(event.target.value as TimingPath)}
            value={path}
          >
            <option value="both">Both</option>
            <option value="live">Live</option>
            <option value="replay">Replay</option>
          </select>
        </label>
        <label className="rm-priority-control">
          Group by
          <select
            aria-label="Group by"
            onChange={(event) =>
              setGrouping(event.target.value as TimingGrouping)
            }
            value={grouping}
          >
            <option value="none">None</option>
            <option value="factory">Factory</option>
            <option value="drive">Drive</option>
          </select>
        </label>
      </div>
      <p className="rm-note">
        Wall-clock time the queues awaited, not CPU. Processors run at once, so
        the busy times can add up to more than the window. Read time includes
        waiting for the store.
      </p>
      <div className="rm-table-wrap">
        <table className="rm-table" data-testid="processor-timing">
          <thead>
            <tr>
              <th>Processor</th>
              {COLUMNS.map((column) => (
                <th
                  aria-sort={
                    sort.key === column.key
                      ? sort.ascending
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                  key={column.key}
                  title={column.title}
                >
                  <button
                    className="rm-factory-toggle"
                    onClick={() =>
                      setSort((current) => ({
                        key: column.key,
                        ascending:
                          current.key === column.key && !current.ascending,
                      }))
                    }
                    type="button"
                  >
                    {column.label}
                  </button>
                </th>
              ))}
              <th>Last run</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Fragment key={group.key}>
                {grouping === "none" ? null : (
                  <tr className="rm-factory-row">
                    <td title={group.key}>
                      <strong>{group.label}</strong>
                    </td>
                    {groupCells(group.rows)}
                    <td />
                  </tr>
                )}
                {group.rows.map((row) => {
                  const numbers = numbersOf(row, horizon, path);
                  return (
                    <tr key={row.processorId}>
                      <td className="rm-processor-name" title={row.processorId}>
                        {row.name} · {row.driveLabel}
                      </td>
                      <NumberCells
                        numbers={numbers}
                        totalBusy={numbersOf(row, "total", path).busyMs}
                        windowBusy={numbersOf(row, "window", path).busyMs}
                      />
                      <td>{formatCount(row.opsPerSecond)}</td>
                      <td>
                        {row.queueDepth.tasks} /{" "}
                        {formatCount(row.queueDepth.ops)}
                      </td>
                      <td>{formatCount(row.ordinalsBehind)}</td>
                      <td>
                        {row.etaMs === null ? "-" : formatDuration(row.etaMs)}
                      </td>
                      <td>{numbers.errors}</td>
                      <td>{lastRunCell(row)}</td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="rm-factory-row" data-testid="timing-totals">
              <td>
                <strong>Total</strong> (wall share {wallShare.toFixed(1)}×)
              </td>
              {groupCells(report.processors)}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
