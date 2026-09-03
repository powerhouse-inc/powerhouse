// Pure data layer over BENCHMARKS.jsonl / TASKS.jsonl. No DOM, no fetch.
// Field names follow bench/records/benchmark-schema.ts and task-schema.ts.

export const METRICS = [
  { key: "meanMs", label: "mean (ms)", lower: true },
  { key: "medianMs", label: "median (ms)", lower: true },
  { key: "p99Ms", label: "p99 (ms)", lower: true },
  { key: "hz", label: "ops/sec", lower: false },
];

export function parseJsonl(text) {
  const entries = [];
  const badLines = [];
  text.split("\n").forEach((raw, index) => {
    const line = raw.trim();
    if (line === "") {
      return;
    }
    try {
      entries.push(JSON.parse(line));
    } catch (error) {
      badLines.push({ line: index + 1, error: String(error.message ?? error) });
    }
  });
  return { entries, badLines };
}

export function shortSha(sha) {
  return sha.slice(0, 7);
}

export function envFingerprint(environment) {
  return [
    environment.host,
    environment.cpu,
    environment.node,
    environment.storage,
    environment.postgres,
  ]
    .filter((part) => part !== undefined)
    .join(" | ");
}

export function caseKey(suite, benchCase) {
  return `${suite.fullName} > ${benchCase.name}`;
}

// "bench/x.bench.ts > Suite name" -> "Suite name"; the file is already known.
export function suiteLabel(fullName) {
  const parts = fullName.split(" > ");
  return parts.length > 1 ? parts.slice(1).join(" > ") : fullName;
}

function byRecordedAt(a, b) {
  return Date.parse(a.recordedAt) - Date.parse(b.recordedAt);
}

function push(map, key, value) {
  const list = map.get(key);
  if (list === undefined) {
    map.set(key, [value]);
  } else if (!list.includes(value)) {
    list.push(value);
  }
}

export function indexRecords(benchmarks, tasks) {
  const byId = new Map();
  const series = new Map();
  const seriesOf = new Map();
  const tasksForBenchmark = new Map();
  const invalidatedBy = new Map();
  const envBreaks = new Set();

  for (const bench of benchmarks) {
    byId.set(bench.id, bench);
    push(series, bench.title, bench);
    seriesOf.set(bench.id, bench.title);
  }
  for (const list of series.values()) {
    list.sort(byRecordedAt);
    for (let index = 1; index < list.length; index += 1) {
      const previous = envFingerprint(list[index - 1].environment);
      const current = envFingerprint(list[index].environment);
      if (previous !== current) {
        envBreaks.add(list[index].id);
      }
    }
  }

  for (const task of tasks) {
    byId.set(task.id, task);
    const cited = new Set(task.evidence ?? []);
    for (const event of task.history ?? []) {
      for (const id of event.evidence ?? []) {
        cited.add(id);
      }
    }
    for (const id of cited) {
      push(tasksForBenchmark, id, task);
    }
    if (task.kind === "HARNESS") {
      for (const id of task.details?.invalidates ?? []) {
        push(invalidatedBy, id, task);
      }
    }
  }

  return {
    byId,
    series,
    seriesOf,
    tasksForBenchmark,
    invalidatedBy,
    envBreaks,
  };
}

// One column per case key (first-seen order), one row per micro record.
export function seriesTable(records) {
  const keys = [];
  const rows = [];
  for (const bench of records) {
    if (bench.kind !== "micro") {
      continue;
    }
    const values = new Map();
    for (const suite of bench.results.suites) {
      for (const benchCase of suite.cases) {
        const key = caseKey(suite, benchCase);
        if (!keys.includes(key)) {
          keys.push(key);
        }
        values.set(key, benchCase);
      }
    }
    rows.push({ bench, values });
  }
  return { keys, rows };
}

export function xLabel(bench) {
  const at = bench.recordedAt.slice(5, 16).replace("T", " ");
  return `${bench.id} ${shortSha(bench.environment.reactorSha)} ${at}`;
}

// Flat rows for the series chart: one per (record, case) with the chosen
// metric and an rmePct-derived interval. Points a log axis cannot draw are
// dropped, since a mean of 0 measured a clock floor, not the system.
export function chartRows(records, metric, { log = false } = {}) {
  const rows = [];
  for (const bench of records) {
    if (bench.kind !== "micro") {
      continue;
    }
    const x = xLabel(bench);
    for (const suite of bench.results.suites) {
      for (const benchCase of suite.cases) {
        const value = benchCase[metric];
        if (value === undefined || (log && value <= 0)) {
          continue;
        }
        const spread = (value * benchCase.rmePct) / 100;
        rows.push({
          x,
          recordId: bench.id,
          suite: suiteLabel(suite.fullName),
          caseKey: caseKey(suite, benchCase),
          caseName: benchCase.name,
          value,
          lo: Math.max(log ? value / 100 : 0, value - spread),
          hi: value + spread,
          rmePct: benchCase.rmePct,
          sampleCount: benchCase.sampleCount,
        });
      }
    }
  }
  return rows;
}

// Invariants from .claude/commands/bench-loop.md, surfaced as badges.
export function taskLint(task) {
  const warnings = [];
  if (task.kind !== "HARNESS" && (task.evidence ?? []).length === 0) {
    warnings.push("no evidence");
  }
  for (const event of task.history ?? []) {
    if (
      (event.status === "FIXED" || event.status === "COMMITTED") &&
      typeof event.by === "string" &&
      event.by.startsWith("bench-")
    ) {
      warnings.push(`${event.status} by ${event.by}`);
    }
  }
  const topics = (task.tags ?? []).filter((tag) => tag.startsWith("topic:"));
  if (topics.length !== 1) {
    warnings.push(`${topics.length} topic: tags`);
  }
  return warnings;
}

export function taskEvents(tasks) {
  const events = [];
  for (const task of tasks) {
    for (const event of task.history ?? []) {
      events.push({
        taskId: task.id,
        kind: task.kind,
        title: task.title,
        status: event.status,
        at: event.at,
        by: event.by,
        commit: event.commit,
        evidence: event.evidence ?? [],
      });
    }
  }
  return events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

// The sha a task's code sites should be viewed at: the first cited record's.
export function siteSha(task, index) {
  for (const id of task.evidence ?? []) {
    const bench = index.byId.get(id);
    if (bench?.environment?.reactorSha) {
      return bench.environment.reactorSha;
    }
  }
  return undefined;
}

export function referenceProblems(index, benchmarks, tasks) {
  const problems = [];
  const seen = new Set();
  for (const entry of [...benchmarks, ...tasks]) {
    if (seen.has(entry.id)) {
      problems.push(`${entry.id} appears more than once; the last one wins`);
    }
    seen.add(entry.id);
  }
  const check = (owner, field, id) => {
    if (!index.byId.has(id)) {
      problems.push(`${owner}.${field} references unknown ${id}`);
    }
  };
  for (const bench of benchmarks) {
    bench.supersedes?.forEach((id) => check(bench.id, "supersedes", id));
    bench.tasks?.forEach((id) => check(bench.id, "tasks", id));
  }
  for (const task of tasks) {
    task.evidence?.forEach((id) => check(task.id, "evidence", id));
    task.history?.forEach((event, i) =>
      event.evidence?.forEach((id) => check(task.id, `history[${i}]`, id)),
    );
    task.details?.invalidates?.forEach((id) =>
      check(task.id, "details.invalidates", id),
    );
    task.details?.blockedBy?.forEach((id) =>
      check(task.id, "details.blockedBy", id),
    );
  }
  return problems;
}

// ---- tasks against a series ----------------------------------------------

// `case:<case name>` or `case:<suite label> > <case name>` names the line a
// finding is about; the schema records only a B-id and code sites.
export function caseTags(task) {
  return (task.tags ?? [])
    .filter((tag) => tag.startsWith("case:"))
    .map((tag) => tag.slice("case:".length).trim())
    .filter((tag) => tag !== "");
}

export function rowMatchesCase(row, tag) {
  return row.caseName === tag || `${row.suite} > ${row.caseName}` === tag;
}

export function fixEvents(task) {
  return (task.history ?? []).filter(
    (event) => event.status === "FIXED" || event.status === "COMMITTED",
  );
}

// Short and full shas both appear; either may be a prefix of the other.
export function sameCommit(a, b) {
  if (!a || !b) {
    return false;
  }
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x.startsWith(y) || y.startsWith(x);
}

export function taskSites(task) {
  return [...new Set((task.details?.sites ?? []).map((site) => site.file))];
}

function commitIs(commit, event) {
  return (
    sameCommit(event.commit, commit.fullSha) ||
    sameCommit(event.commit, commit.sha)
  );
}

// `fixes`: the task's history names this commit. `touches`: the commit
// changed a file the task's sites point at — an inference, not a claim.
export function annotateCommits(commits, tasks) {
  return commits.map((commit) => {
    const fixes = [];
    const touches = [];
    for (const task of tasks) {
      if (fixEvents(task).some((event) => commitIs(commit, event))) {
        fixes.push(task.id);
      } else if (
        (commit.files ?? []).length > 0 &&
        taskSites(task).some((file) => commit.files.includes(file))
      ) {
        touches.push(task.id);
      }
    }
    return { ...commit, fixes, touches };
  });
}

// Which run first carries a fix. `gapCommits` maps a record id to the
// commits that landed between the previous run and it.
function landedBefore(records, gapCommits, event) {
  if (event.commit) {
    for (const bench of records) {
      if (sameCommit(event.commit, bench.environment.reactorSha)) {
        return { recordId: bench.id, by: "commit" };
      }
      const commits = gapCommits.get(bench.id);
      if (commits?.some((commit) => commitIs(commit, event))) {
        return { recordId: bench.id, by: "commit" };
      }
    }
    if (gapCommits.size >= records.length - 1) {
      return undefined; // every gap is known and none holds it: no run yet
    }
  }
  const at = Date.parse(event.at);
  const after = records.find((bench) => Date.parse(bench.recordedAt) > at);
  return after ? { recordId: after.id, by: "time" } : undefined;
}

// The runs a finding came from: the task's own evidence plus what the filing
// and verifying events cite. A FIXED or REFUTED event cites runs too, but
// those are where the claim was tested, not where it was found.
function foundEvidence(task) {
  const ids = new Set(task.evidence ?? []);
  for (const event of task.history ?? []) {
    if (event.status === "UNVERIFIED" || event.status === "VERIFIED") {
      for (const id of event.evidence ?? []) {
        ids.add(id);
      }
    }
  }
  return ids;
}

export function seriesTasks(records, index, gapCommits = new Map()) {
  const entries = new Map();
  for (const bench of records) {
    for (const task of index.tasksForBenchmark.get(bench.id) ?? []) {
      if (!foundEvidence(task).has(bench.id)) {
        continue;
      }
      let entry = entries.get(task.id);
      if (entry === undefined) {
        entry = { task, foundIn: [], fixes: [], cases: caseTags(task) };
        entries.set(task.id, entry);
      }
      entry.foundIn.push(bench.id);
    }
  }
  for (const entry of entries.values()) {
    entry.fixes = fixEvents(entry.task).map((event) => ({
      status: event.status,
      at: event.at,
      commit: event.commit,
      landedBefore: landedBefore(records, gapCommits, event),
    }));
  }
  return [...entries.values()];
}

export function taskMarkers(summary, records) {
  const xOf = new Map(records.map((bench) => [bench.id, xLabel(bench)]));
  const rows = [];
  for (const { task, foundIn, fixes } of summary) {
    for (const id of foundIn) {
      rows.push({
        x: xOf.get(id),
        taskId: task.id,
        kind: task.kind,
        status: task.status,
        role: "found",
        title: `${task.status} · found in ${id}\n${task.title}`,
      });
    }
    for (const fix of fixes) {
      if (fix.landedBefore) {
        rows.push({
          x: xOf.get(fix.landedBefore.recordId),
          taskId: task.id,
          kind: task.kind,
          status: fix.status,
          role: "fixed",
          title: `${fix.status}${fix.commit ? ` in ${fix.commit}` : ""} · first run after: ${fix.landedBefore.recordId}${fix.landedBefore.by === "time" ? " (by time; no commit recorded)" : ""}`,
        });
      }
    }
  }
  return rows;
}
