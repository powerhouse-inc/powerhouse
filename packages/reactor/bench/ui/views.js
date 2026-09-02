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
  seriesTable,
  shortSha,
  siteSha,
  suiteLabel,
  taskEvents,
  taskLint,
} from "./records.js";

const REPO = "https://github.com/powerhouse-inc/powerhouse";

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

export function renderOverview(root, state) {
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
  const taskRows = state.tasks.map(
    (task) => `<tr>
      <td>${idLink(task.id)}</td>
      <td>${kindBadge(task.kind)}</td>
      <td>${statusBadge(task.status)}</td>
      <td class=num>P${task.priority}</td>
      <td>${esc(task.area)}</td>
      <td><a href="#/task/${esc(task.id)}">${esc(task.title)}</a></td>
      <td>${idList(task.evidence)}</td>
      <td>${lintBadges(task)}</td>
    </tr>`,
  );
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
      <table><thead><tr><th>id</th><th>kind</th><th>status</th><th>pri</th><th>area</th><th>title</th><th>evidence</th><th>lint</th></tr></thead>
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

export function renderSeries(root, state, title) {
  const records = state.index.series.get(title);
  if (!records) {
    renderMissing(root, state, `No series titled “${title}”`);
    return;
  }
  const metric = METRICS.find((m) => m.key === state.metric) ?? METRICS[0];
  const table = seriesTable(records);
  const gaps = records.slice(1).map((bench, i) => ({
    from: records[i].environment.reactorSha,
    to: bench.environment.reactorSha,
    fromId: records[i].id,
    toId: bench.id,
  }));
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
      <h2>Commits between runs</h2>
      ${gaps.length === 0 ? "<p class=muted>Only one run so far.</p>" : ""}
      ${gaps
        .map(
          (
            gap,
          ) => `<details class="gap" data-from="${esc(gap.from)}" data-to="${esc(gap.to)}">
            <summary>${idLink(gap.fromId)} ${shaLink(gap.from)} → ${idLink(gap.toId)} ${shaLink(gap.to)}</summary>
            <div class="gap-body muted">loading…</div>
          </details>`,
        )
        .join("")}
    </section>
    <section><h2>Runs</h2>${recordCards.join("")}</section>`;

  if (state.Plot) {
    const { tasksPlot, perSuite } = seriesCharts({
      Plot: state.Plot,
      records,
      metric: metric.key,
      metricLabel: metric.label,
      log: state.log,
      index: state.index,
      width: root.clientWidth - 32,
    });
    if (tasksPlot) {
      root.querySelector("#tasks-strip").append(tasksPlot);
    }
    const charts = root.querySelector("#charts");
    if (perSuite.length === 0) {
      charts.innerHTML = `<p class="muted">No case in this series reports ${esc(metric.label)}.</p>`;
    }
    for (const { suite, plot } of perSuite) {
      const h3 = document.createElement("h3");
      h3.textContent = suite;
      charts.append(h3, plot);
    }
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

export async function fillGap(details) {
  const body = details.querySelector(".gap-body");
  if (details.dataset.loaded) {
    return;
  }
  details.dataset.loaded = "1";
  try {
    const response = await fetch(
      `/api/log?from=${encodeURIComponent(details.dataset.from)}&to=${encodeURIComponent(details.dataset.to)}`,
    );
    const payload = await response.json();
    const warning = payload.warning
      ? `<p class="banner warn">${esc(payload.warning)}</p>`
      : "";
    const endpoints = payload.endpoints
      ? `<p class="muted">${esc(payload.endpoints.from ?? "?")} → ${esc(payload.endpoints.to ?? "?")}</p>`
      : "";
    let commits = "";
    if (payload.commits?.length) {
      commits = `<ol class="commits">${payload.commits
        .map(
          (c) =>
            `<li><a class="sha" href="${REPO}/commit/${esc(c.sha)}" target="_blank" rel="noreferrer">${esc(c.sha)}</a> ${esc(c.subject)}</li>`,
        )
        .join("")}</ol>`;
    } else if (!payload.warning) {
      commits = "<p class=muted>no commits between these runs</p>";
    }
    body.className = "gap-body";
    body.innerHTML = `${warning}${endpoints}${commits}`;
  } catch (error) {
    body.innerHTML = `<p class="banner warn">${esc(error.message)}</p>`;
  }
}

export function renderRecord(root, state, id) {
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

export function renderTask(root, state, id) {
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
  root.innerHTML = `${header(state)}
    <h2>${esc(task.id)} ${kindBadge(task.kind)} ${statusBadge(task.status)} ${lintBadges(task)}</h2>
    <p class="title">${esc(task.title)}</p>
    <p class="muted">P${task.priority} · ${esc(task.area)} · created ${when(task.createdAt)} · ${task.tags.map(esc).join(", ") || "no tags"} · evidence ${idList(task.evidence)}${sha ? ` · sites viewed at ${shaLink(sha)}` : ""}</p>
    ${details}
    <h3>History</h3>
    <table class="history"><thead><tr><th>at</th><th>status</th><th>by</th><th>commit</th><th>evidence</th><th>note</th></tr></thead><tbody>${history}</tbody></table>
    ${rawJson(task)}`;
}

export function renderMissing(root, state, message) {
  root.innerHTML = `${header(state)}<p class="banner warn">${esc(message)}</p><p><a href="#/">back to overview</a></p>`;
}

export function renderError(root, error) {
  root.innerHTML = `<header><a class="brand" href="#/">bench records</a></header>
    <div class="banner warn"><b>Could not load the record files.</b><p>${esc(error.message)}</p>
    <p>Run <code>pnpm --filter @powerhousedao/reactor bench:ui</code> and open the URL it prints; <code>file://</code> cannot fetch.</p></div>`;
}
