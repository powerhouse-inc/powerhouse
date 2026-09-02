// DOM rendering. Each view fills `root` from state; charts are Plot nodes
// appended into placeholders after the HTML lands.
import {
  STATUS_COLOR,
  formatValue,
  seriesCharts,
  timelineChart,
} from "./chart.js";
import {
  METRICS,
  annotateCommits,
  caseTags,
  fixEvents,
  rowMatchesCase,
  seriesTable,
  seriesTasks,
  shortSha,
  siteSha,
  suiteLabel,
  taskEvents,
  taskLint,
  taskMarkers,
  xLabel,
} from "./records.js";

const REPO = "https://github.com/powerhouse-inc/powerhouse";
const FOUND_COLOR = "#d97706";
const FIXED_COLOR = "#16a34a";

// Async views bump this; a stale render that finishes late is dropped.
let epoch = 0;

export function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function idLink(id) {
  const route = id.startsWith("B-") ? "record" : "task";
  return `<a class="id" href="#/${route}/${esc(id)}">${esc(id)}</a>`;
}

function idList(ids) {
  return ids.length === 0
    ? "<span class=muted>—</span>"
    : ids.map(idLink).join(", ");
}

function seriesLink(title) {
  return `<a href="#/series/${encodeURIComponent(title)}">${esc(title)}</a>`;
}

function statusBadge(status) {
  return `<span class="badge" style="background:${STATUS_COLOR[status] ?? "#666"}">${esc(status)}</span>`;
}

function kindBadge(kind) {
  return `<span class="badge kind ${esc(kind)}">${esc(kind)}</span>`;
}

function lintBadges(task) {
  return taskLint(task)
    .map(
      (warning) =>
        `<span class="badge lint" title="bench-loop invariant">${esc(warning)}</span>`,
    )
    .join(" ");
}

function when(iso) {
  return `<time datetime="${esc(iso)}" title="${esc(iso)}">${esc(iso.slice(0, 16).replace("T", " "))}</time>`;
}

function shaLink(sha) {
  return `<a class="sha" href="${REPO}/commit/${esc(sha)}" target="_blank" rel="noreferrer">${esc(shortSha(sha))}</a>`;
}

function list(items) {
  return items.length === 0
    ? "<p class=muted>none</p>"
    : `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`;
}

function rawJson(entry) {
  return `<details class="raw"><summary>raw JSON</summary><pre>${esc(JSON.stringify(entry, null, 2))}</pre></details>`;
}

function invalidBanner(state, id) {
  const by = state.index.invalidatedBy.get(id);
  if (!by) {
    return "";
  }
  return `<div class="banner invalid">INVALIDATED by ${idList(by.map((t) => t.id))} — the harness was found wrong; treat the conclusions as artifacts.</div>`;
}

function chartsUnavailable(state) {
  return state.plotError
    ? `<p class="banner warn">Charts unavailable: ${esc(state.plotError.message)}. Tables still work.</p>`
    : "";
}

function header(state) {
  const problems = [
    ...state.badLines.map((b) => `${b.file}:${b.line} ${b.error}`),
    ...state.problems,
  ];
  return `
    <header>
      <a class="brand" href="#/">bench records</a>
      <span class="muted">${state.benchmarks.length} benchmarks · ${state.tasks.length} tasks · loaded ${state.loadedAt ? when(state.loadedAt) : "…"}</span>
      <button id="refresh" type="button">refresh</button>
    </header>
    ${problems.length ? `<div class="banner warn"><b>${problems.length} problem(s) in the record files</b>${list(problems)}</div>` : ""}
  `;
}

// ---- commits between runs -------------------------------------------------

async function fetchLog(from, to) {
  const response = await fetch(
    `/api/log?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
  if (!response.ok) {
    throw new Error(`/api/log: HTTP ${response.status}`);
  }
  return response.json();
}

// One entry per gap, keyed by the later run's id, commits annotated with the
// tasks they fix or whose sites they touch.
async function loadGaps(records, tasks) {
  const gaps = records.slice(1).map((bench, i) => ({
    from: records[i],
    to: bench,
  }));
  const results = await Promise.all(
    gaps.map(async (gap) => {
      try {
        const payload = await fetchLog(
          gap.from.environment.reactorSha,
          gap.to.environment.reactorSha,
        );
        return {
          ...gap,
          commits: annotateCommits(payload.commits ?? [], tasks),
          warning: payload.warning,
          endpoints: payload.endpoints,
        };
      } catch (error) {
        return { ...gap, commits: [], warning: error.message };
      }
    }),
  );
  const gapCommits = new Map(results.map((gap) => [gap.to.id, gap.commits]));
  return { gaps: results, gapCommits };
}

function fixesLine(fix) {
  const where = fix.landedBefore
    ? `first run after: ${idLink(fix.landedBefore.recordId)}${fix.landedBefore.by === "time" ? ' <span class="muted">(by time; no commit recorded)</span>' : ""}`
    : '<span class="muted">no run since</span>';
  return `${statusBadge(fix.status)} ${fix.commit ? shaLink(fix.commit) : '<span class="muted">no commit recorded</span>'} · ${where}`;
}

function seriesTasksSection(summary, gaps) {
  if (summary.length === 0) {
    return `<p class="muted">No task cites a run in this series.</p>`;
  }
  const touchedBy = new Map();
  for (const gap of gaps) {
    for (const commit of gap.commits) {
      for (const id of commit.touches) {
        touchedBy.set(id, (touchedBy.get(id) ?? 0) + 1);
      }
    }
  }
  const rows = summary.map(
    ({ task, foundIn, fixes, cases }) => `<tr>
      <td>${idLink(task.id)}<br>${kindBadge(task.kind)} ${statusBadge(task.status)}</td>
      <td><a href="#/task/${esc(task.id)}">${esc(task.title)}</a></td>
      <td>${idList(foundIn)}</td>
      <td>${fixes.length ? fixes.map(fixesLine).join("<br>") : '<span class="muted">none recorded</span>'}</td>
      <td>${cases.length ? cases.map((c) => `<code>${esc(c)}</code>`).join("<br>") : '<span class="muted">none tagged</span>'}</td>
      <td class=num>${touchedBy.get(task.id) ?? 0}</td>
    </tr>`,
  );
  return `<table><thead><tr><th>task</th><th>title</th><th>found in</th><th>fixed in</th><th>cases</th><th title="commits between runs that changed a file this task's sites point at">commits touching sites</th></tr></thead><tbody>${rows.join("")}</tbody></table>
  <p class="muted">▲ found in that run · ◆ first run carrying the fix. "Fixed in" comes from a FIXED/COMMITTED history event with <code>--commit</code>; "touching sites" is inferred from changed files.</p>`;
}

function commitLine(commit) {
  const badges = [
    ...commit.fixes.map(
      (id) => `<span class="badge fixes">fixes ${esc(id)}</span>`,
    ),
    ...commit.touches.map(
      (id) => `<span class="badge touches">touches ${esc(id)} sites</span>`,
    ),
  ].join(" ");
  const files = commit.files?.length
    ? `<details class="files"><summary>${commit.files.length} file${commit.files.length === 1 ? "" : "s"}</summary><ul>${commit.files.map((f) => `<li>${esc(f)}</li>`).join("")}</ul></details>`
    : "";
  return `<li class="${commit.fixes.length ? "fixes" : commit.touches.length ? "touches" : ""}"><a class="sha" href="${REPO}/commit/${esc(commit.fullSha ?? commit.sha)}" target="_blank" rel="noreferrer">${esc(commit.sha)}</a> ${esc(commit.subject)} ${badges}${files}</li>`;
}

function gapSection(gap) {
  const n = gap.commits.length;
  const tied = gap.commits.filter((c) => c.fixes.length > 0).length;
  const touching = gap.commits.filter((c) => c.touches.length > 0).length;
  let verdict;
  if (gap.warning) {
    verdict = `<span class="badge lint">${esc(gap.warning)}</span>`;
  } else if (n === 0) {
    verdict = '<span class="muted">same commit</span>';
  } else if (tied === 0 && touching === 0) {
    verdict = `<span class="muted">${n} commit${n === 1 ? "" : "s"}, none tied to a task or touching a task's sites</span>`;
  } else {
    verdict = `<span>${n} commit${n === 1 ? "" : "s"} · <b>${tied}</b> fix a task · <b>${touching}</b> touch a task's sites</span>`;
  }
  return `<details class="gap" ${tied || touching ? "open" : ""}>
    <summary>${idLink(gap.from.id)} ${shaLink(gap.from.environment.reactorSha)} → ${idLink(gap.to.id)} ${shaLink(gap.to.environment.reactorSha)} — ${verdict}</summary>
    ${gap.endpoints ? `<p class="muted">${esc(gap.endpoints.from ?? "?")} → ${esc(gap.endpoints.to ?? "?")}</p>` : ""}
    ${n ? `<ol class="commits">${gap.commits.map(commitLine).join("")}</ol>` : ""}
  </details>`;
}

// ---- views ------------------------------------------------------------------

export function renderOverview(root, state) {
  epoch += 1;
  const { index } = state;
  const events = taskEvents(state.tasks);
  const rows = [...index.series.entries()].map(([title, records]) => {
    const latest = records.at(-1);
    const tasks = new Set();
    let invalid = 0;
    for (const bench of records) {
      for (const task of index.tasksForBenchmark.get(bench.id) ?? []) {
        tasks.add(task.id);
      }
      if (index.invalidatedBy.has(bench.id)) {
        invalid += 1;
      }
    }
    return `<tr>
      <td>${seriesLink(title)}</td>
      <td class=num>${records.length}</td>
      <td>${esc(latest.kind === "micro" ? latest.results.runner : latest.kind)} / ${esc(latest.environment.storage)}</td>
      <td>${shaLink(latest.environment.reactorSha)} ${when(latest.recordedAt)}</td>
      <td>${idList(records.map((b) => b.id))}</td>
      <td>${idList([...tasks])}${invalid ? ` <span class="badge invalid">${invalid} invalidated</span>` : ""}</td>
    </tr>`;
  });
  const taskRows = state.tasks.map((task) => {
    const fixes = fixEvents(task);
    const cases = caseTags(task);
    return `<tr>
      <td>${idLink(task.id)}</td>
      <td>${kindBadge(task.kind)}</td>
      <td>${statusBadge(task.status)}</td>
      <td class=num>P${task.priority}</td>
      <td>${esc(task.area)}</td>
      <td><a href="#/task/${esc(task.id)}">${esc(task.title)}</a></td>
      <td>${idList(task.evidence)}</td>
      <td>${fixes.length ? fixes.map((f) => (f.commit ? shaLink(f.commit) : `<span class="muted">${esc(f.status)}, no commit</span>`)).join("<br>") : '<span class="muted">—</span>'}</td>
      <td>${cases.length ? cases.map((c) => `<code>${esc(c)}</code>`).join("<br>") : '<span class="muted">—</span>'}</td>
      <td>${lintBadges(task)}</td>
    </tr>`;
  });
  root.innerHTML = `${header(state)}
    <section>
      <h2>Timeline</h2>
      ${chartsUnavailable(state)}
      <div id="timeline"></div>
    </section>
    <section>
      <h2>Series</h2>
      <table><thead><tr><th>title</th><th>runs</th><th>runner / storage</th><th>latest</th><th>records</th><th>tasks</th></tr></thead>
      <tbody>${rows.join("")}</tbody></table>
    </section>
    <section>
      <h2>Tasks</h2>
      <table><thead><tr><th>id</th><th>kind</th><th>status</th><th>pri</th><th>area</th><th>title</th><th>found in</th><th>fixed in</th><th>cases</th><th>lint</th></tr></thead>
      <tbody>${taskRows.join("")}</tbody></table>
    </section>`;
  if (state.Plot && state.benchmarks.length > 0) {
    root.querySelector("#timeline").append(
      timelineChart({
        Plot: state.Plot,
        benchmarks: state.benchmarks,
        events,
        width: root.clientWidth - 32,
      }),
    );
  }
}

function mountSeriesCharts(root, state, records, options) {
  const metric = METRICS.find((m) => m.key === state.metric) ?? METRICS[0];
  const { tasksPlot, perSuite } = seriesCharts({
    Plot: state.Plot,
    records,
    metric: metric.key,
    metricLabel: metric.label,
    log: state.log,
    index: state.index,
    width: root.clientWidth - 32,
    ...options,
  });
  const strip = root.querySelector("#tasks-strip");
  if (tasksPlot && strip) {
    strip.append(tasksPlot);
  }
  const charts = root.querySelector("#charts");
  if (perSuite.length === 0) {
    charts.innerHTML = `<p class="muted">No case in this series reports ${esc(metric.label)}${options.caseFilter ? " for the tagged cases" : ""}.</p>`;
  }
  for (const { suite, plot } of perSuite) {
    const h3 = document.createElement("h3");
    h3.textContent = suite;
    charts.append(h3, plot);
  }
}

export async function renderSeries(root, state, title) {
  const mine = ++epoch;
  const records = state.index.series.get(title);
  if (!records) {
    renderMissing(root, state, `No series titled “${title}”`);
    return;
  }
  const metric = METRICS.find((m) => m.key === state.metric) ?? METRICS[0];
  const table = seriesTable(records);
  const { gaps, gapCommits } = await loadGaps(records, state.tasks);
  if (mine !== epoch) {
    return;
  }
  const summary = seriesTasks(records, state.index, gapCommits);
  const recordCards = records.map(
    (bench) => `<article class="card">
      <h3>${idLink(bench.id)} ${shaLink(bench.environment.reactorSha)} ${when(bench.recordedAt)} ${state.index.envBreaks.has(bench.id) ? '<span class="badge lint">environment changed</span>' : ""}</h3>
      ${invalidBanner(state, bench.id)}
      <b>Conclusions</b>${list(bench.conclusions)}
      <b>Tasks citing this run</b> ${idList((state.index.tasksForBenchmark.get(bench.id) ?? []).map((t) => t.id))}
    </article>`,
  );
  root.innerHTML = `${header(state)}
    <h2>${esc(title)}</h2>
    <p class="muted">${esc(records[0].question)}</p>
    <div class="controls">
      <label>metric <select id="metric">${METRICS.map((m) => `<option value="${m.key}" ${m.key === metric.key ? "selected" : ""}>${esc(m.label)}</option>`).join("")}</select></label>
      <label><input id="log" type="checkbox" ${state.log ? "checked" : ""}> log scale</label>
      <span class="muted">${table.keys.length} cases · ${records.length} runs</span>
    </div>
    ${chartsUnavailable(state)}
    <div id="tasks-strip"></div>
    <div id="charts"></div>
    <section>
      <h2>Tasks against this series</h2>
      ${seriesTasksSection(summary, gaps)}
    </section>
    <section>
      <h2>Commits between runs</h2>
      ${gaps.length === 0 ? "<p class=muted>Only one run so far.</p>" : gaps.map(gapSection).join("")}
    </section>
    <section><h2>Runs</h2>${recordCards.join("")}</section>`;

  if (state.Plot) {
    mountSeriesCharts(root, state, records, {
      taskRows: taskMarkers(summary, records),
    });
  } else {
    root.querySelector("#charts").innerHTML = seriesMatrix(table, metric.key);
  }
}

// Text fallback for the charts: one column per run, one row per case.
function seriesMatrix(table, metric) {
  const head = table.rows
    .map((row) => `<th>${idLink(row.bench.id)}</th>`)
    .join("");
  const body = table.keys.map(
    (key) =>
      `<tr><td>${esc(key)}</td>${table.rows
        .map((row) => {
          const c = row.values.get(key);
          return `<td class=num>${c?.[metric] === undefined ? "" : formatValue(c[metric])}</td>`;
        })
        .join("")}</tr>`,
  );
  return `<table><thead><tr><th>case</th>${head}</tr></thead><tbody>${body.join("")}</tbody></table>`;
}

export function renderRecord(root, state, id) {
  epoch += 1;
  const bench = state.index.byId.get(id);
  if (!bench || !bench.recordedAt) {
    renderMissing(root, state, `No benchmark ${id}`);
    return;
  }
  const env = bench.environment;
  const envRows = Object.entries(env)
    .map(
      ([k, v]) =>
        `<tr><th>${esc(k)}</th><td>${k === "reactorSha" ? shaLink(v) : esc(v)}</td></tr>`,
    )
    .join("");
  const tasks = state.index.tasksForBenchmark.get(id) ?? [];
  let results;
  if (bench.kind === "micro") {
    const r = bench.results;
    const derived = r.derived.length
      ? `<h4>Derived</h4><table><thead><tr><th>name</th><th>value</th><th>note</th></tr></thead><tbody>${r.derived
          .map(
            (d) =>
              `<tr><td>${esc(d.name)}</td><td class=num>${esc(d.value)} ${esc(d.unit)}</td><td>${esc(d.note ?? "")}</td></tr>`,
          )
          .join("")}</tbody></table>`
      : "";
    const suites = r.suites
      .map(
        (suite) => `<h4>${esc(suiteLabel(suite.fullName))}</h4>
        <table class="cases"><thead><tr><th>#</th><th>case</th><th class=num>ops/s</th><th class=num>mean ms</th><th class=num>median ms</th><th class=num>p99 ms</th><th class=num>rme %</th><th class=num>n</th></tr></thead>
        <tbody>${[...suite.cases]
          .sort((a, b) => a.rank - b.rank)
          .map(
            (c) =>
              `<tr><td class=num>${c.rank}</td><td>${esc(c.name)}</td><td class=num>${formatValue(c.hz)}</td><td class=num>${formatValue(c.meanMs)}</td><td class=num>${formatValue(c.medianMs)}</td><td class=num>${c.p99Ms === undefined ? "" : formatValue(c.p99Ms)}</td><td class=num ${c.rmePct > 5 ? 'style="color:#dc2626"' : ""}>${c.rmePct.toFixed(2)}</td><td class=num>${c.sampleCount}</td></tr>`,
          )
          .join("")}</tbody></table>`,
      )
      .join("");
    results = `
      <h3>Results — ${esc(r.runner)} ${esc(r.runnerVersion)}</h3>
      <p class="muted">${r.sourceFiles.map(esc).join(", ")} · repetitions ${r.protocol.repetitions}${r.protocol.interleaved ? " · interleaved" : ""}${r.protocol.instrument ? ` · ${esc(r.protocol.instrument)}` : ""}</p>
      ${r.protocol.notes?.length ? list(r.protocol.notes) : ""}
      ${derived}
      ${suites}`;
  } else {
    results = `<h3>Results — ${esc(bench.kind)}</h3><p class="muted">No chart for this kind yet; see raw JSON.</p>`;
  }
  root.innerHTML = `${header(state)}
    <h2>${esc(bench.id)} · ${seriesLink(bench.title)}</h2>
    ${invalidBanner(state, id)}
    <p><b>Question</b> ${esc(bench.question)}</p>
    <p class="muted"><code>${esc(bench.command)}</code> · ${when(bench.recordedAt)} · tier ${esc(bench.tier)}${bench.tags.length ? ` · ${bench.tags.map(esc).join(", ")}` : ""}</p>
    <div class="cols">
      <div><h3>Conclusions</h3>${list(bench.conclusions)}<h3>Caveats</h3>${list(bench.caveats)}</div>
      <div><h3>Environment</h3><table class="kv">${envRows}</table>
        <h3>Links</h3>
        <p>tasks citing this run: ${idList(tasks.map((t) => t.id))}</p>
        <p>supersedes: ${idList(bench.supersedes)} · tasks field: ${idList(bench.tasks)}</p>
      </div>
    </div>
    ${results}
    ${rawJson(bench)}`;
}

// The series a task's evidence lives in, with its runs and the task's place
// in them: found-in runs, the first run after each fix, and the tagged cases.
function taskSeriesBlock(state, task, summaryEntry, gaps, records) {
  const cases = summaryEntry.cases;
  const fixes = summaryEntry.fixes;
  const touching = gaps.flatMap((gap) =>
    gap.commits.filter(
      (c) => c.touches.includes(task.id) || c.fixes.includes(task.id),
    ),
  );
  return `
    <h3>In ${seriesLink(records[0].title)}</h3>
    <p>found in ${idList(summaryEntry.foundIn)} · fixed: ${fixes.length ? fixes.map(fixesLine).join("; ") : '<span class="muted">none recorded — <code>bench:records set-status ' + esc(task.id) + " FIXED --commit &lt;sha&gt;</code> when a fix lands</span>"}</p>
    <p class="muted">${cases.length ? `showing tagged case${cases.length === 1 ? "" : "s"}: ${cases.map((c) => `<code>${esc(c)}</code>`).join(", ")}` : "showing every case; add a <code>case:</code> tag to narrow to the line this task is about"}</p>
    ${touching.length ? `<p>Commits between runs that name this task or touch its sites:</p><ol class="commits">${touching.map(commitLine).join("")}</ol>` : `<p class="muted">No commit between these runs names this task or touches its sites.</p>`}
    <div id="tasks-strip"></div>
    <div id="charts"></div>`;
}

export async function renderTask(root, state, id) {
  const mine = ++epoch;
  const task = state.index.byId.get(id);
  if (!task || !task.history) {
    renderMissing(root, state, `No task ${id}`);
    return;
  }
  const sha = siteSha(task, state.index);
  const site = (s) => {
    const label = `${s.file}${s.line ? `:${s.line}` : ""}${s.symbol ? ` ${s.symbol}` : ""}`;
    if (!sha) {
      return `<code>${esc(label)}</code>`;
    }
    const href = `${REPO}/blob/${sha}/${s.file}${s.line ? `#L${s.line}` : ""}`;
    return `<a href="${esc(href)}" target="_blank" rel="noreferrer"><code>${esc(label)}</code></a>`;
  };
  const d = task.details;
  let details;
  if (task.kind === "DEFECT") {
    details = `
      <h3>Sites</h3>${d.sites.map((s) => `<div>${site(s)}</div>`).join("")}
      <h3>Repro</h3><p>${esc(d.repro)}</p>
      <div class="cols"><div><h3>Observed</h3><p>${esc(d.observed)}</p></div><div><h3>Expected</h3><p>${esc(d.expected)}</p></div></div>
      ${d.magnitude ? `<p><b>Magnitude</b> ${esc(d.magnitude)}</p>` : ""}
      <h3>Candidate fixes</h3>
      <ol>${[...d.fixes]
        .sort((a, b) => a.rank - b.rank)
        .map(
          (f) =>
            `<li><b>${esc(f.summary)}</b> <span class="muted">(${esc(f.cost)})</span><br>${esc(f.expectedEffect)}</li>`,
        )
        .join("")}</ol>`;
  } else if (task.kind === "HARNESS") {
    details = `
      <p><b>Invalidates</b> ${idList(d.invalidates)} · <b>bias</b> ${esc(d.biasDirection)}</p>
      <h3>Sites</h3>${d.sites.map((s) => `<div>${site(s)}</div>`).join("")}
      <h3>Defect</h3><p>${esc(d.defect)}</p>
      <h3>Remedy</h3><p>${esc(d.remedy)}</p>`;
  } else {
    details = `
      <h3>Question</h3><p>${esc(d.question)}</p>
      <h3>Experiment</h3><p>${esc(d.experiment)}</p>
      <h3>Why it matters</h3><p>${esc(d.whyItMatters)}</p>
      <p>${d.proposedKind ? `<b>proposed kind</b> ${esc(d.proposedKind)} · ` : ""}<b>blocked by</b> ${idList(d.blockedBy)}</p>`;
  }
  const history = task.history
    .map(
      (event) => `<tr>
        <td>${when(event.at)}</td>
        <td>${statusBadge(event.status)}</td>
        <td>${esc(event.by ?? "")}</td>
        <td>${event.commit ? shaLink(event.commit) : ""}</td>
        <td>${idList(event.evidence)}</td>
        <td class="note">${esc(event.note ?? "")}</td>
      </tr>`,
    )
    .join("");

  // The series the evidence lives in (the first one, if a task spans several).
  const seriesTitle = task.evidence
    .map((evidenceId) => state.index.seriesOf.get(evidenceId))
    .find((t) => t !== undefined);
  const records = seriesTitle ? state.index.series.get(seriesTitle) : undefined;
  let seriesBlock = `<p class="muted">No recorded run to place this task against.</p>`;
  let mount = null;
  if (records) {
    const { gaps, gapCommits } = await loadGaps(records, state.tasks);
    if (mine !== epoch) {
      return;
    }
    const entry = seriesTasks(records, state.index, gapCommits).find(
      (e) => e.task.id === task.id,
    );
    if (entry) {
      seriesBlock = taskSeriesBlock(state, task, entry, gaps, records);
      const cases = entry.cases;
      const rules = [
        ...entry.foundIn.map((rid) => ({
          x: xLabel(state.index.byId.get(rid)),
          stroke: FOUND_COLOR,
          label: "found",
        })),
        ...entry.fixes
          .filter((fix) => fix.landedBefore)
          .map((fix) => ({
            x: xLabel(state.index.byId.get(fix.landedBefore.recordId)),
            stroke: FIXED_COLOR,
            label: fix.status.toLowerCase(),
          })),
      ];
      mount = {
        records,
        options: {
          taskRows: taskMarkers([entry], records),
          rules,
          caseFilter: cases.length
            ? (row) => cases.some((tag) => rowMatchesCase(row, tag))
            : undefined,
        },
      };
    }
  }

  root.innerHTML = `${header(state)}
    <h2>${esc(task.id)} ${kindBadge(task.kind)} ${statusBadge(task.status)} ${lintBadges(task)}</h2>
    <p class="title">${esc(task.title)}</p>
    <p class="muted">P${task.priority} · ${esc(task.area)} · created ${when(task.createdAt)} · ${task.tags.map(esc).join(", ") || "no tags"} · evidence ${idList(task.evidence)}${sha ? ` · sites viewed at ${shaLink(sha)}` : ""}</p>
    ${details}
    <section>
      <h2>Against the numbers</h2>
      ${chartsUnavailable(state)}
      ${seriesBlock}
    </section>
    <h3>History</h3>
    <table class="history"><thead><tr><th>at</th><th>status</th><th>by</th><th>commit</th><th>evidence</th><th>note</th></tr></thead><tbody>${history}</tbody></table>
    ${rawJson(task)}`;

  if (mount && state.Plot) {
    mountSeriesCharts(root, state, mount.records, mount.options);
  }
}

export function renderMissing(root, state, message) {
  epoch += 1;
  root.innerHTML = `${header(state)}<p class="banner warn">${esc(message)}</p><p><a href="#/">back to overview</a></p>`;
}

export function renderError(root, error) {
  epoch += 1;
  root.innerHTML = `<header><a class="brand" href="#/">bench records</a></header>
    <div class="banner warn"><b>Could not load the record files.</b><p>${esc(error.message)}</p>
    <p>Run <code>pnpm --filter @powerhousedao/reactor bench:ui</code> and open the URL it prints; <code>file://</code> cannot fetch.</p></div>`;
}
