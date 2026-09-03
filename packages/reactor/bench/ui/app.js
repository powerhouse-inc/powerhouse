import { indexRecords, parseJsonl, referenceProblems } from "./records.js";
import {
  renderError,
  renderOverview,
  renderRecord,
  renderSeries,
  renderTask,
} from "./views.js";

const PLOT_URL = "https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6/+esm";
const POLL_MS = 10_000;
const FILES = ["BENCHMARKS.jsonl", "TASKS.jsonl"];

const state = {
  benchmarks: [],
  tasks: [],
  index: indexRecords([], []),
  badLines: [],
  problems: [],
  loadedAt: null,
  Plot: null,
  plotError: null,
  suiteSettings: new Map(),
  raw: ["", ""],
};

const root = document.getElementById("app");

async function fetchText(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${path}: HTTP ${response.status}`);
  }
  return response.text();
}

// Returns true when the files changed since the last load.
async function loadRecords() {
  const raw = await Promise.all(
    FILES.map((name) => fetchText(`/records/${name}`)),
  );
  if (raw[0] === state.raw[0] && raw[1] === state.raw[1]) {
    return false;
  }
  state.raw = raw;
  const parsed = raw.map(parseJsonl);
  state.benchmarks = parsed[0].entries;
  state.tasks = parsed[1].entries;
  state.badLines = [];
  for (const [i, { badLines }] of parsed.entries()) {
    for (const bad of badLines) {
      state.badLines.push({ ...bad, file: FILES[i] });
    }
  }
  state.index = indexRecords(state.benchmarks, state.tasks);
  state.problems = referenceProblems(
    state.index,
    state.benchmarks,
    state.tasks,
  );
  state.loadedAt = new Date().toISOString();
  return true;
}

async function loadPlot() {
  try {
    state.Plot = await import(PLOT_URL);
  } catch (error) {
    state.plotError = error;
  }
}

function route() {
  const hash = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  const [view, ...rest] = hash.split("/");
  const arg = rest.join("/");
  if (view === "series" && arg) {
    void renderSeries(root, state, arg);
  } else if (view === "record" && arg) {
    renderRecord(root, state, arg);
  } else if (view === "task" && arg) {
    void renderTask(root, state, arg);
  } else {
    renderOverview(root, state);
  }
  window.scrollTo(0, 0);
}

async function refresh(force) {
  try {
    const changed = await loadRecords();
    if (changed || force) {
      route();
    }
  } catch (error) {
    renderError(root, error);
  }
}

// Records and Plot load together, then one render: routing as soon as the
// local files land would paint the no-charts fallback before the CDN answers.
async function start() {
  try {
    await Promise.all([loadPlot(), loadRecords()]);
  } catch (error) {
    renderError(root, error);
    return;
  }
  route();
  setInterval(() => void refresh(false), POLL_MS);
}

root.addEventListener("click", (event) => {
  if (event.target.id === "refresh") {
    void refresh(true);
  }
});
window.addEventListener("hashchange", route);

await start();
