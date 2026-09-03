// Observable Plot specs. `Plot` is passed in: app.js owns the CDN import so
// the rest of the UI still renders when it fails.
import { chartRows, xLabel } from "./records.js";

export const STATUS_COLOR = {
  UNVERIFIED: "#9ca3af",
  VERIFIED: "#d97706",
  FIXED: "#2563eb",
  COMMITTED: "#16a34a",
  REFUTED: "#dc2626",
};

export function formatValue(value) {
  if (value >= 100) {
    return value.toFixed(1);
  }
  if (value >= 1) {
    return value.toFixed(3);
  }
  return value.toPrecision(3);
}

const REPO = "https://github.com/powerhouse-inc/powerhouse";
const FOUND_COLOR = "#dc2626";
const FIXED_COLOR = "#16a34a";

// Tick text: the recording time. The id and sha live elsewhere on the chart.
function tick(label) {
  return label.split(" ").slice(2).join(" ");
}

function shortSha(label) {
  return label.split(" ")[1];
}

// One row per (run, task event), stacked when a run carries several.
function annotationRows(taskRows) {
  const perX = new Map();
  return taskRows.map((row) => {
    const stack = perX.get(row.x) ?? 0;
    perX.set(row.x, stack + 1);
    return {
      x: row.x,
      stack,
      label: `${row.taskId} ${row.role}`,
      href: `#/task/${row.taskId}`,
      color: row.role === "fixed" ? FIXED_COLOR : FOUND_COLOR,
      title: row.title,
    };
  });
}

// Suites in this series, from the metric every case reports.
export function suiteNames(records, caseFilter) {
  const allRows = chartRows(records, "meanMs");
  const rows = caseFilter ? allRows.filter(caseFilter) : allRows;
  return [...new Set(rows.map((row) => row.suite))];
}

export function suiteChart({
  Plot,
  records,
  suite,
  metric,
  metricLabel,
  log,
  index,
  width,
  taskRows = [],
  caseFilter,
}) {
  const domain = records.map(xLabel);
  const allRows = chartRows(records, metric, { log });
  const suiteRows = allRows.filter(
    (row) => row.suite === suite && (!caseFilter || caseFilter(row)),
  );
  const marginLeft = 80;
  const x = {
    type: "point",
    domain,
    label: null,
    tickFormat: tick,
    padding: 0.5,
  };
  const runs = records.map((bench) => ({
    x: xLabel(bench),
    id: bench.id,
    sha: bench.environment.reactorSha,
  }));
  const breaks = records
    .filter((bench) => index.envBreaks.has(bench.id))
    .map((bench) => ({ x: xLabel(bench) }));
  const annotations = annotationRows(taskRows);
  const stackDepth = Math.max(0, ...annotations.map((a) => a.stack + 1));

  return Plot.plot({
    width,
    height: 290 + 14 * stackDepth,
    marginLeft,
    marginTop: 24,
    marginBottom: 52 + 14 * stackDepth,
    x,
    y: {
      type: log ? "log" : "linear",
      label: metricLabel,
      grid: true,
      insetTop: 10,
    },
    color: { legend: true },
    marks: [
      Plot.ruleX(annotations, {
        x: "x",
        stroke: "color",
        strokeWidth: 18,
        strokeOpacity: 0.12,
      }),
      Plot.ruleX(breaks, {
        x: "x",
        stroke: "#444",
        strokeDasharray: "4 3",
        tip: true,
        title: "machine or environment changed before this run",
      }),
      // dy is a constant, not a channel, so each stack level is its own mark.
      ...Array.from({ length: stackDepth }, (_, level) =>
        Plot.text(
          annotations.filter((a) => a.stack === level),
          {
            x: "x",
            text: "label",
            fill: "color",
            href: "href",
            frameAnchor: "bottom",
            dy: 56 + 14 * level,
            fontWeight: 600,
          },
        ),
      ),
      Plot.text(runs, {
        x: "x",
        text: (d) => shortSha(d.x),
        href: (d) => `${REPO}/commit/${d.sha}`,
        target: "_blank",
        title: (d) => `${d.id}: open commit ${d.sha} on GitHub`,
        fill: "#1d4ed8",
        frameAnchor: "bottom",
        dy: 40,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      }),
      Plot.ruleX(suiteRows, {
        x: "x",
        y1: "lo",
        y2: "hi",
        stroke: "caseName",
        strokeOpacity: 0.6,
      }),
      Plot.lineY(suiteRows, { x: "x", y: "value", stroke: "caseName" }),
      Plot.dot(suiteRows, {
        x: "x",
        y: "value",
        stroke: "caseName",
        fill: "white",
        r: 4,
        href: (d) => `#/record/${d.recordId}`,
        tip: true,
        title: (d) => `${d.caseName}: ${formatValue(d.value)}`,
      }),
    ],
  });
}

export function timelineChart({ Plot, benchmarks, events, width }) {
  const titles = [...new Set(benchmarks.map((bench) => bench.title))];
  const rows = benchmarks.map((bench) => ({
    at: new Date(bench.recordedAt),
    row: bench.title,
    id: bench.id,
    sha: bench.environment.reactorSha,
  }));
  const eventRows = events.map((event) => ({
    ...event,
    at: new Date(event.at),
    row: "task events",
  }));
  return Plot.plot({
    width,
    height: 50 + 24 * (titles.length + 1),
    marginLeft: 260,
    marginBottom: 30,
    x: { type: "utc", label: null, grid: true },
    y: { type: "point", domain: [...titles, "task events"], label: null },
    marks: [
      Plot.dot(rows, {
        x: "at",
        y: "row",
        r: 5,
        fill: "#2563eb",
        href: (d) => `#/record/${d.id}`,
        tip: true,
        title: (d) => `${d.id} @ ${d.sha}`,
      }),
      Plot.dot(eventRows, {
        x: "at",
        y: "row",
        symbol: "triangle",
        r: 5,
        fill: (d) => STATUS_COLOR[d.status],
        href: (d) => `#/task/${d.taskId}`,
        tip: true,
        title: (d) =>
          `${d.taskId} → ${d.status}${d.by ? ` by ${d.by}` : ""}\n${d.title}`,
      }),
    ],
  });
}
