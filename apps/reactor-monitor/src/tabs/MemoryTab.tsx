import type {
  GaugeGrowth,
  MemorySample,
  MemoryTelemetryReport,
} from "@powerhousedao/reactor";
import type {
  MemoryLevers,
  MonitorInspector,
} from "@powerhousedao/reactor-monitor";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ADMIN_ALLOWED,
  AdminGateNote,
  type AdminGate,
} from "../components/AdminGate.js";

export type MemoryTabProps = {
  readonly inspector: MonitorInspector;
  /** Absent where the reactor serves no levers. */
  readonly levers?: MemoryLevers;
  readonly admin?: AdminGate;
};

const SAMPLES_SHOWN = 720;
const POLL_FLOOR_MS = 2_000;
const MB = 1024 * 1024;

const CHART_WIDTH = 720;
const CHART_HEIGHT = 200;
const PADDING = { top: 10, right: 12, bottom: 22, left: 56 };

/** Categorical slots 1-3, in fixed order; a fourth store folds into "other". */
const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a"] as const;

type Series = {
  readonly name: string;
  readonly color: string;
  readonly values: readonly (number | null)[];
};

function timeOf(sample: MemorySample): string {
  return new Date(sample.t).toLocaleTimeString();
}

function mb(bytes: number): number {
  return bytes / MB;
}

/** Sizes in MB, past 1024 in GB. */
export function formatMb(value: number): string {
  return Math.abs(value) >= 1024
    ? `${(value / 1024).toFixed(2)} GB`
    : `${Math.round(value)} MB`;
}

function formatOps(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

function niceTop(max: number): number {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 5, 10]) {
    if (step * magnitude >= max) return step * magnitude;
  }
  return 10 * magnitude;
}

/** The series as one polyline per run of known values. */
function pathOf(
  values: readonly (number | null)[],
  xOf: (index: number) => number,
  yOf: (value: number) => number,
): string {
  let path = "";
  let drawing = false;
  values.forEach((value, index) => {
    if (value === null) {
      drawing = false;
      return;
    }
    path += `${drawing ? "L" : "M"}${xOf(index).toFixed(1)} ${yOf(value).toFixed(1)}`;
    drawing = true;
  });
  return path;
}

/** One line chart on one axis, with a crosshair and a tooltip on hover. */
function LineChart({
  title,
  series,
  labels,
  format,
}: {
  readonly title: string;
  readonly series: readonly Series[];
  readonly labels: readonly string[];
  readonly format: (value: number) => string;
}) {
  const [hover, setHover] = useState<number | undefined>();
  const count = labels.length;
  const top = niceTop(
    Math.max(0, ...series.flatMap((s) => s.values.map((v) => v ?? 0))),
  );
  const plotWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const xOf = (index: number) =>
    PADDING.left + (count > 1 ? (index / (count - 1)) * plotWidth : 0);
  const yOf = (value: number) =>
    PADDING.top + plotHeight - (value / top) * plotHeight;

  const onMove = (event: React.MouseEvent<SVGRectElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientX - rect.left) / rect.width;
    setHover(Math.round(fraction * Math.max(count - 1, 0)));
  };

  return (
    <figure className="rm-chart">
      <figcaption>{title}</figcaption>
      {series.length > 1 ? (
        <ul className="rm-chart-legend">
          {series.map((s) => (
            <li key={s.name}>
              <span
                aria-hidden
                className="rm-chart-swatch"
                style={{ background: s.color }}
              />
              {s.name}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="rm-chart-plot">
        <svg
          aria-label={title}
          role="img"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        >
          {[0, 0.5, 1].map((share) => (
            <g key={share}>
              <line
                className="rm-chart-grid"
                x1={PADDING.left}
                x2={CHART_WIDTH - PADDING.right}
                y1={yOf(top * share)}
                y2={yOf(top * share)}
              />
              <text
                className="rm-chart-tick"
                textAnchor="end"
                x={PADDING.left - 6}
                y={yOf(top * share) + 4}
              >
                {format(top * share)}
              </text>
            </g>
          ))}
          <text className="rm-chart-tick" x={PADDING.left} y={CHART_HEIGHT - 6}>
            {labels[0]}
          </text>
          <text
            className="rm-chart-tick"
            textAnchor="end"
            x={CHART_WIDTH - PADDING.right}
            y={CHART_HEIGHT - 6}
          >
            {labels.at(-1)}
          </text>
          {series.map((s) => (
            <path
              d={pathOf(s.values, xOf, yOf)}
              fill="none"
              key={s.name}
              stroke={s.color}
              strokeLinejoin="round"
              strokeWidth={2}
            />
          ))}
          {hover === undefined ? null : (
            <line
              className="rm-chart-crosshair"
              x1={xOf(hover)}
              x2={xOf(hover)}
              y1={PADDING.top}
              y2={PADDING.top + plotHeight}
            />
          )}
          <rect
            fill="transparent"
            height={plotHeight}
            onMouseLeave={() => setHover(undefined)}
            onMouseMove={onMove}
            width={plotWidth}
            x={PADDING.left}
            y={PADDING.top}
          />
        </svg>
        {hover === undefined ? null : (
          <div
            className="rm-chart-tooltip"
            style={{
              left: `${(xOf(hover) / CHART_WIDTH) * 100}%`,
              transform:
                xOf(hover) > CHART_WIDTH / 2 ? "translateX(-105%)" : undefined,
            }}
          >
            <strong>{labels[hover]}</strong>
            {series.map((s) => {
              const value = s.values[hover];
              return (
                <div key={s.name}>
                  {s.name}:{" "}
                  {value === null || value === undefined ? "-" : format(value)}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </figure>
  );
}

/** Every store's WASM, with stores past the third folded into "other stores". */
export function pgliteSeries(samples: readonly MemorySample[]): Series[] {
  const names = [
    ...new Set(
      samples.flatMap((sample) =>
        Object.entries(sample.workers)
          .filter(([, worker]) => worker.wasm !== undefined)
          .map(([name]) => name),
      ),
    ),
  ].sort();
  const shown = names.slice(
    0,
    SERIES_COLORS.length - (names.length > 3 ? 1 : 0),
  );
  const rest = names.filter((name) => !shown.includes(name));
  const series: Series[] = shown.map((name, i) => ({
    name,
    color: SERIES_COLORS[i]!,
    values: samples.map((sample) => {
      const wasm = sample.workers[name]?.wasm;
      return wasm === undefined ? null : mb(wasm);
    }),
  }));
  if (rest.length > 0) {
    series.push({
      name: "other stores",
      color: SERIES_COLORS[2],
      values: samples.map((sample) =>
        mb(rest.reduce((sum, n) => sum + (sample.workers[n]?.wasm ?? 0), 0)),
      ),
    });
  }
  return series;
}

function GaugeTable({ gauges }: { readonly gauges: readonly GaugeGrowth[] }) {
  return (
    <div className="rm-table-wrap">
      <table className="rm-table" data-testid="memory-gauges">
        <thead>
          <tr>
            <th>Gauge</th>
            <th>Value</th>
            <th>Per minute</th>
            <th title="Correlation with the post-GC heap over the window">r</th>
          </tr>
        </thead>
        <tbody>
          {gauges.length === 0 ? (
            <tr>
              <td className="rm-table-empty" colSpan={4}>
                Needs two samples
              </td>
            </tr>
          ) : (
            gauges.map((gauge) => (
              <tr key={gauge.gauge}>
                <td>{gauge.gauge}</td>
                <td>{gauge.value}</td>
                <td>{gauge.perMin.toFixed(1)}</td>
                <td>{gauge.r === null ? "-" : gauge.r.toFixed(2)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function Rates({ report }: { readonly report: MemoryTelemetryReport }) {
  const { summary } = report;
  if (!summary) return null;
  const postGc = summary.postGcMbPerMin;
  return (
    <div className="rm-stat-bar" data-testid="memory-rates">
      <span>
        Verdict: <strong>{summary.verdict}</strong>
      </span>
      <span>
        Post-GC heap:{" "}
        <strong>{postGc === null ? "-" : `${postGc.toFixed(1)} MB/min`}</strong>
      </span>
      <span>
        RSS: <strong>{summary.rssMbPerMin.toFixed(1)} MB/min</strong>
      </span>
      <span>
        Per 1000 ops:{" "}
        <strong>
          {summary.mbPer1kOps === null
            ? "-"
            : `${summary.mbPer1kOps.toFixed(1)} MB`}
        </strong>
      </span>
      <span>
        PGlite WASM: <strong>{summary.pgliteMbPerMin.toFixed(1)} MB/min</strong>
      </span>
    </div>
  );
}

/** Memory over time, correlated with operations written. */
export function MemoryTab({
  inspector,
  levers,
  admin = ADMIN_ALLOWED,
}: MemoryTabProps) {
  const [report, setReport] = useState<MemoryTelemetryReport | undefined>();
  const [unavailable, setUnavailable] = useState<string | undefined>();
  const [leverError, setLeverError] = useState<string | undefined>();
  const [snapshotPath, setSnapshotPath] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    try {
      setReport(await inspector.getMemoryTelemetry(SAMPLES_SHOWN));
      setUnavailable(undefined);
    } catch (error) {
      setUnavailable(error instanceof Error ? error.message : String(error));
    }
  }, [inspector]);

  const pollMs = Math.max(report?.intervalMs ?? 0, POLL_FLOOR_MS);
  useEffect(() => {
    // eslint-disable-next-line react-hooks-extra/set-state-in-effect
    void load();
    const interval = setInterval(() => void load(), pollMs);
    return () => clearInterval(interval);
  }, [load, pollMs]);

  const pull = useCallback(
    async (lever: () => Promise<void>) => {
      setPending(true);
      try {
        await lever();
        setLeverError(undefined);
      } catch (error) {
        setLeverError(error instanceof Error ? error.message : String(error));
      } finally {
        setPending(false);
      }
      await load();
    },
    [load],
  );

  const samples = report?.samples;
  const memorySeries = useMemo<Series[]>(() => {
    const all = samples ?? [];
    return [
      {
        name: "RSS",
        color: SERIES_COLORS[0],
        values: all.map((s) => mb(s.rss)),
      },
      {
        name: "Heap used",
        color: SERIES_COLORS[1],
        values: all.map((s) => mb(s.heapUsed)),
      },
      {
        name: "Heap after GC",
        color: SERIES_COLORS[2],
        values: all.map((s) =>
          s.postGcHeap === null ? null : mb(s.postGcHeap),
        ),
      },
    ];
  }, [samples]);
  const opsSeries = useMemo<Series[]>(
    () => [
      {
        name: "Operations written",
        color: SERIES_COLORS[0],
        values: (samples ?? []).map((s) => s.counters.opsWritten),
      },
    ],
    [samples],
  );
  const stores = useMemo(() => pgliteSeries(samples ?? []), [samples]);
  const labels = useMemo(() => (samples ?? []).map(timeOf), [samples]);

  if (unavailable !== undefined && report === undefined) {
    return (
      <div className="rm-tab">
        <h2>Memory</h2>
        <p className="rm-note" data-testid="memory-unavailable">
          Memory telemetry is not available on this host.
        </p>
      </div>
    );
  }

  const enabled = report?.enabled === true;
  const leversOpen = admin.enabled && levers !== undefined;

  return (
    <div className="rm-tab">
      <AdminGateNote gate={admin} />
      <div className="rm-tab-header">
        <h2>Memory</h2>
        <div className="rm-actions">
          <button
            className="rm-btn"
            disabled={!leversOpen || pending}
            onClick={() =>
              void pull(() => levers!.setMemoryTelemetry({ enabled: !enabled }))
            }
            type="button"
          >
            {enabled ? "Stop telemetry" : "Start telemetry"}
          </button>
          <button
            className="rm-btn rm-btn-warn"
            disabled={!leversOpen || pending}
            onClick={() =>
              void pull(async () => {
                setSnapshotPath(await levers!.writeHeapSnapshot());
              })
            }
            title="Blocks the server for seconds to minutes; take it at 2-4 GB"
            type="button"
          >
            Heap snapshot
          </button>
        </div>
      </div>

      {leverError ? (
        <p className="rm-error" role="alert">
          {leverError}
        </p>
      ) : null}
      {snapshotPath ? (
        <p className="rm-note" data-testid="memory-snapshot">
          Heap snapshot written on the host: {snapshotPath}
        </p>
      ) : null}
      {report && !enabled ? (
        <p className="rm-note" data-testid="memory-off">
          Memory telemetry is off; set PH_MEMORY_TELEMETRY=on or start it here.
        </p>
      ) : null}
      {report?.file ? (
        <p className="rm-note" data-testid="memory-file">
          Writing to {report.file}
        </p>
      ) : null}

      {report ? <Rates report={report} /> : null}

      {samples && samples.length > 0 ? (
        <div data-testid="memory-charts">
          <LineChart
            format={formatMb}
            labels={labels}
            series={memorySeries}
            title="Main process memory"
          />
          <LineChart
            format={formatOps}
            labels={labels}
            series={opsSeries}
            title="Operations written"
          />
          {stores.length > 0 ? (
            <LineChart
              format={formatMb}
              labels={labels}
              series={stores}
              title="PGlite WASM per store"
            />
          ) : null}
        </div>
      ) : null}

      <h3>Gauges</h3>
      <GaugeTable gauges={report?.summary?.gauges ?? []} />
    </div>
  );
}

export default MemoryTab;
