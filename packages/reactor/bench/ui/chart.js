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

// ▲ the run a finding was made from; ◆ the first run that carries its fix.
const ROLES = ["found", "fixed"];
const ROLE_SYMBOLS = ["triangle", "diamond"];

export function formatValue(value) {
  if (value >= 100) {
    return value.toFixed(1);
  }
  if (value >= 1) {
    return value.toFixed(3);
  }
  return value.toPrecision(3);
}

// Tick text: "B-004 89f958f" — the id and short sha, not the timestamp.
function tick(label) {
  return label.split(" ").slice(0, 2).join(" ");
}

export function seriesCharts({
  Plot,
  records,
  metric,
  metricLabel,
  log,
  index,
  width,
  taskRows = [],
  rules = [],
  caseFilter,
}) {
  const domain = records.map(xLabel);
  const allRows = chartRows(records, metric, { log });
  const rows = caseFilter ? allRows.filter(caseFilter) : allRows;
  const suites = [...new Set(rows.map((row) => row.suite))];
  const marginLeft = 80;
  const x = {
    type: "point",
    domain,
    label: null,
    tickFormat: tick,
    padding: 0.5,
  };

  const invalid = records
    .filter((bench) => index.invalidatedBy.has(bench.id))
    .map((bench) => ({
      x: xLabel(bench),
      by: index.invalidatedBy
        .get(bench.id)
        .map((task) => task.id)
        .join(", "),
    }));
  const breaks = records
    .filter((bench) => index.envBreaks.has(bench.id))
    .map((bench) => ({ x: xLabel(bench) }));

  // One row per task, so two findings on the same run never overlap.
  const taskIds = [...new Set(taskRows.map((row) => row.taskId))];
  const tasksPlot =
    taskRows.length === 0
      ? null
      : Plot.plot({
          width,
          height: 30 + 22 * taskIds.length,
          marginLeft,
          marginTop: 10,
          marginBottom: 10,
          x: { ...x, axis: null },
          y: { type: "point", domain: taskIds, label: null },
          symbol: { domain: ROLES, range: ROLE_SYMBOLS },
          marks: [
            Plot.dot(taskRows, {
              x: "x",
              y: "taskId",
              symbol: "role",
              fill: (d) => STATUS_COLOR[d.status],
              r: 6,
              href: (d) => `#/task/${d.taskId}`,
              tip: true,
              title: (d) => `${d.taskId} ${d.kind}\n${d.title}`,
            }),
          ],
        });

  const perSuite = suites.map((suite) => {
    const suiteRows = rows.filter((row) => row.suite === suite);
    return {
      suite,
      plot: Plot.plot({
        width,
        height: 280,
        marginLeft,
        marginBottom: 40,
        x,
        y: {
          type: log ? "log" : "linear",
          label: metricLabel,
          grid: true,
        },
        color: { legend: true },
        marks: [
          Plot.ruleX(invalid, {
            x: "x",
            stroke: "#dc2626",
            strokeWidth: 18,
            strokeOpacity: 0.12,
            tip: true,
            title: (d) => `invalidated by ${d.by}`,
          }),
          Plot.ruleX(breaks, {
            x: "x",
            stroke: "#444",
            strokeDasharray: "4 3",
          }),
          Plot.ruleX(rules, {
            x: "x",
            stroke: "stroke",
            strokeWidth: 2,
            strokeDasharray: "6 3",
          }),
          Plot.text(rules, {
            x: "x",
            text: "label",
            fill: "stroke",
            frameAnchor: "top",
            dy: -6,
            fontWeight: 600,
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
            title: (d) =>
              `${d.caseName}\n${d.recordId}: ${formatValue(d.value)} ±${d.rmePct.toFixed(1)}% (n=${d.sampleCount})`,
          }),
        ],
      }),
    };
  });

  return { tasksPlot, perSuite };
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
