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
