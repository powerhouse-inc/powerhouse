#!/usr/bin/env node
/**
 * Attributes a wall-clock difference between two runs to the SQL each one issued.
 *
 * A profiler says which JavaScript module spent the time; it cannot say whether
 * that time was spent waiting on the database or building the query that goes
 * to it. This answers that, by asking Postgres to log every statement with its
 * duration and diffing the two runs by statement shape. A change that shows up
 * here is server-side work; a wall-clock difference that does not show up here
 * is client-side, and the profiler takes over.
 *
 * Usage:
 *   tsx pg-statement-diff.ts capture --label L1 --out /tmp/l1.json -- <command...>
 *   tsx pg-statement-diff.ts diff /tmp/l0.json /tmp/l1.json [--output-md report.md]
 *
 * Capture wraps one command. It turns statement logging on, runs the command,
 * reads back only the log lines the command produced, and turns logging off
 * again -- including when the command fails, because leaving a database logging
 * every statement is a worse outcome than a missing measurement.
 */

import { execFile, spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { promisify } from "node:util";

const exec = promisify(execFile);

const DURATION_LINE =
  /duration: ([\d.]+) ms\s+(parse|bind|execute|statement)[^:]*:\s*(.*)$/;

/** A new log record, as opposed to a continuation of the statement above it. */
const LOG_RECORD_START = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[.\d]* \w+ \[/;

type StatementGroup = {
  label: string;
  calls: number;
  totalMs: number;
};

type Capture = {
  label: string;
  wallMs: number;
  /** Indexing may miss: a shape present in one run can be absent from the other. */
  groups: Partial<Record<string, StatementGroup>>;
};

/** How a statement is named in the report. Shape, never parameters. */
function classify(sql: string): string {
  const s = sql.replace(/\s+/g, " ").trim();
  const lower = s.toLowerCase();

  if (lower.includes("pg_advisory_xact_lock")) {
    return "advisory lock over the read set";
  }
  if (lower.startsWith('insert into "reactor"."operation"')) {
    return lower.includes("not exists")
      ? "guarded insert into Operation"
      : "plain insert into Operation";
  }
  if (lower.includes('"reactor"."keyframe"')) {
    return lower.startsWith("insert") ? "keyframe write" : "keyframe read";
  }
  if (lower.includes('from "reactor"."operation"')) {
    if (lower.includes("max(")) return "read: Operation aggregate";
    return "read: Operation rows";
  }
  if (lower.startsWith("begin") || lower.startsWith("commit")) {
    return "transaction control";
  }
  if (lower.startsWith("create ") || lower.startsWith("alter ")) {
    return "schema setup";
  }
  return `other: ${s.slice(0, 56)}`;
}

type LogAggregation = {
  groups: Map<string, StatementGroup>;
  lines: number;
};

/**
 * Follows the container's log for the lifetime of one command.
 *
 * Reading the log after the fact means rescanning it from the beginning, which
 * gets slower every time the tool is used and eventually dominates the thing
 * being measured. Following from the tail costs only the output the command
 * itself produces, and the log is aggregated as it arrives so none of it is
 * ever held in memory.
 */
class LogFollower {
  private readonly child: ReturnType<typeof spawn>;
  private readonly groups = new Map<string, StatementGroup>();
  private readonly state: PendingStatement = {
    active: false,
    sql: "",
    ms: 0,
  };
  private lines = 0;

  constructor(container: string) {
    // --tail 0 starts at the end of the log. Seeking by timestamp instead means
    // scanning the whole file, which gets slower every run and eventually costs
    // more than the workload being measured.
    this.child = spawn("docker", [
      "logs",
      container,
      "--tail",
      "0",
      "--follow",
    ]);
    const handle = (line: string): void => {
      this.lines += 1;
      consumeLogLine(line, this.state, this.groups);
    };
    if (this.child.stdout) {
      createInterface({ input: this.child.stdout }).on("line", handle);
    }
    if (this.child.stderr) {
      createInterface({ input: this.child.stderr }).on("line", handle);
    }
  }

  async stop(): Promise<LogAggregation> {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    this.child.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 200));
    flushPending(this.state, this.groups);
    return { groups: this.groups, lines: this.lines };
  }
}

async function psql(
  container: string,
  database: string,
  sql: string,
): Promise<string> {
  const { stdout } = await exec(
    "docker",
    ["exec", container, "psql", "-U", "postgres", "-d", database, "-tAc", sql],
    { maxBuffer: 1024 * 1024 * 64 },
  );
  return stdout;
}

/** Whether pg_stat_statements is loaded and usable in this database. */
async function statStatementsReady(
  container: string,
  database: string,
): Promise<boolean> {
  try {
    await psql(
      container,
      database,
      "select 1 from pg_stat_statements limit 1;",
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Totals per statement shape from pg_stat_statements.
 *
 * Preferred over statement logging because it costs a percent or two rather
 * than tens of percent. That difference decides whether the in-database share
 * can be quoted as a number: logging inflates the arm that issues more
 * statements, so it can only bound the answer, never pin it.
 */
async function captureFromStatStatements(
  container: string,
  database: string,
  label: string,
  out: string,
  argv: string[],
): Promise<number> {
  await psql(container, database, "select pg_stat_statements_reset();");

  const started = Date.now();
  const code = await runCommand(argv);
  const wallMs = Date.now() - started;

  const rows = await psql(
    container,
    database,
    "select calls || '\t' || (total_exec_time + total_plan_time) || '\t' || " +
      "replace(replace(query, chr(10), ' '), chr(9), ' ') from pg_stat_statements",
  );

  const groups = new Map<string, StatementGroup>();
  let statements = 0;
  for (const line of rows.split("\n")) {
    const parts = line.split("\t");
    if (parts.length < 3) {
      continue;
    }
    statements += 1;
    const calls = Number(parts[0]);
    const ms = Number(parts[1]);
    const key = classify(parts.slice(2).join(" "));
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, { label: key, calls, totalMs: ms });
    } else {
      existing.calls += calls;
      existing.totalMs += ms;
    }
  }

  if (statements === 0) {
    throw new Error(
      `[${label}] pg_stat_statements reported nothing. The command ran for ` +
        `${wallMs} ms, so either it does not talk to this database or the ` +
        "extension is not tracking it.",
    );
  }

  let total = 0;
  for (const group of groups.values()) {
    total += group.totalMs;
  }

  await writeFile(
    out,
    JSON.stringify(
      { label, wallMs, groups: Object.fromEntries(groups) },
      null,
      2,
    ),
  );
  process.stdout.write(
    `\n[${label}] wall ${wallMs} ms, ${statements} tracked statements, ` +
      `${total.toFixed(1)} ms in Postgres across ${groups.size} shapes -> ${out}\n`,
  );
  return code;
}

async function readSetting(
  container: string,
  database: string,
): Promise<string> {
  const { stdout } = await exec("docker", [
    "exec",
    container,
    "psql",
    "-U",
    "postgres",
    "-d",
    database,
    "-tAc",
    "show log_min_duration_statement;",
  ]);
  return stdout.trim();
}

/**
 * Applies the setting and waits until a fresh session reports it.
 *
 * `pg_reload_conf` signals the postmaster and returns; a backend started in the
 * gap runs with the old value. Waiting is not politeness, it is the difference
 * between a capture and an empty file that still looks like a result.
 */
async function setStatementLogging(
  container: string,
  database: string,
  on: boolean,
): Promise<void> {
  const setting = on
    ? "alter system set log_min_duration_statement = 0;"
    : "alter system reset log_min_duration_statement;";
  await exec("docker", [
    "exec",
    container,
    "psql",
    "-U",
    "postgres",
    "-d",
    database,
    "-q",
    "-c",
    setting,
    "-c",
    "select pg_reload_conf();",
  ]);

  const expected = on ? "0" : "-1";
  for (let attempt = 0; attempt < 20; attempt++) {
    const actual = await readSetting(container, database);
    if (actual === expected) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `log_min_duration_statement did not become ${expected} after reload`,
  );
}

function runCommand(argv: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(argv[0], argv.slice(1), { stdio: "inherit" });
    child.on("close", (code) => resolve(code ?? 0));
    child.on("error", () => resolve(1));
  });
}

type PendingStatement = { active: boolean; sql: string; ms: number };

function flushPending(
  state: PendingStatement,
  groups: Map<string, StatementGroup>,
): void {
  if (!state.active) {
    return;
  }
  const label = classify(state.sql);
  const existing = groups.get(label);
  if (existing === undefined) {
    groups.set(label, { label, calls: 1, totalMs: state.ms });
  } else {
    existing.calls += 1;
    existing.totalMs += state.ms;
  }
  state.active = false;
  state.sql = "";
  state.ms = 0;
}

/**
 * Folds one log line into the running totals.
 *
 * Postgres prints a multi-line statement across multiple log lines, with only
 * the first carrying the duration. Continuations are folded back in, because a
 * statement truncated at its first line lands in an unnamed bucket -- and the
 * advisory lock, which is a large part of what this tool exists to find, is
 * multi-line.
 */
function consumeLogLine(
  line: string,
  state: PendingStatement,
  groups: Map<string, StatementGroup>,
): void {
  if (LOG_RECORD_START.test(line)) {
    flushPending(state, groups);
    const match = DURATION_LINE.exec(line);
    if (match) {
      state.active = true;
      state.ms = Number(match[1]);
      state.sql = match[3];
    }
    return;
  }
  if (state.active) {
    state.sql += ` ${line.trim()}`;
  }
}

async function capture(
  container: string,
  database: string,
  label: string,
  out: string,
  argv: string[],
): Promise<number> {
  await setStatementLogging(container, database, true);

  const follower = new LogFollower(container);
  await new Promise((resolve) => setTimeout(resolve, 500));

  const started = Date.now();
  const code = await runCommand(argv);
  const wallMs = Date.now() - started;

  let collected: LogAggregation;
  try {
    collected = await follower.stop();
  } finally {
    await setStatementLogging(container, database, false);
  }

  if (collected.lines === 0) {
    throw new Error(
      `[${label}] captured no log lines. The command ran for ${wallMs} ms but ` +
        "Postgres logged nothing, so this would be a zero that looks like a " +
        "measurement. Check that the container name is right and that the " +
        "command actually talks to this database.",
    );
  }

  const result: Capture = {
    label,
    wallMs,
    groups: Object.fromEntries(collected.groups),
  };
  await writeFile(out, JSON.stringify(result, null, 2));

  let total = 0;
  for (const group of collected.groups.values()) {
    total += group.totalMs;
  }
  process.stdout.write(
    `\n[${label}] wall ${wallMs} ms, ${collected.lines} log lines, ` +
      `${total.toFixed(1)} ms in Postgres across ` +
      `${collected.groups.size} statement shapes -> ${out}\n`,
  );
  return code;
}

function renderDiff(base: Capture, current: Capture): string {
  const labels = new Set([
    ...Object.keys(base.groups),
    ...Object.keys(current.groups),
  ]);

  const rows = [...labels]
    .map((label) => {
      const b: StatementGroup | undefined = base.groups[label];
      const c: StatementGroup | undefined = current.groups[label];
      return {
        label,
        baseCalls: b?.calls ?? 0,
        baseMs: b?.totalMs ?? 0,
        curCalls: c?.calls ?? 0,
        curMs: c?.totalMs ?? 0,
        delta: (c?.totalMs ?? 0) - (b?.totalMs ?? 0),
      };
    })
    .sort((x, y) => y.delta - x.delta);

  const baseTotal = rows.reduce((s, r) => s + r.baseMs, 0);
  const curTotal = rows.reduce((s, r) => s + r.curMs, 0);
  const dbDelta = curTotal - baseTotal;
  const wallDelta = current.wallMs - base.wallMs;
  const share = wallDelta === 0 ? 0 : (dbDelta / wallDelta) * 100;

  const lines: string[] = [];
  lines.push(`# Statement diff: ${base.label} -> ${current.label}\n`);
  lines.push(
    `| statement shape | ${base.label} calls | ${base.label} ms | ` +
      `${current.label} calls | ${current.label} ms | delta ms |`,
  );
  lines.push("|---|---:|---:|---:|---:|---:|");
  for (const r of rows) {
    if (Math.abs(r.delta) < 1 && r.baseCalls === r.curCalls) {
      continue;
    }
    lines.push(
      `| ${r.label} | ${r.baseCalls} | ${r.baseMs.toFixed(1)} | ` +
        `${r.curCalls} | ${r.curMs.toFixed(1)} | ${r.delta >= 0 ? "+" : ""}${r.delta.toFixed(1)} |`,
    );
  }
  lines.push(
    `| **total in Postgres** | | **${baseTotal.toFixed(1)}** | | ` +
      `**${curTotal.toFixed(1)}** | **${dbDelta >= 0 ? "+" : ""}${dbDelta.toFixed(1)}** |`,
  );
  lines.push("");
  lines.push(`- wall-clock delta: **${wallDelta} ms**`);
  lines.push(
    `- explained inside Postgres: **${dbDelta.toFixed(1)} ms** (${share.toFixed(1)}%)`,
  );
  lines.push(
    `- not Postgres executing SQL: **${(wallDelta - dbDelta).toFixed(1)} ms** ` +
      `(${(100 - share).toFixed(1)}%)`,
  );
  const extraCalls = rows.reduce((s, r) => s + (r.curCalls - r.baseCalls), 0);
  lines.push(`- statements issued: ${extraCalls >= 0 ? "+" : ""}${extraCalls}`);
  lines.push("");
  lines.push(
    "The remainder is not automatically client CPU. Statements cost a round " +
      "trip each whether or not the server does much with them, so read the " +
      "statement-count line first: an arm issuing more statements pays for them " +
      "even when their execution time is negligible. Measure the round trip for " +
      "this database (sequential statements through one connection) and subtract " +
      "it before attributing what is left to the client, which is what " +
      "`pyroscope-analyse.ts --baseline` will localise.",
  );
  return lines.join("\n");
}

function usage(): void {
  process.stdout.write(`
pg-statement-diff - attribute a wall-clock delta to SQL, or rule SQL out

  capture --label <name> --out <file.json> [--method auto|stat|log]
          [--container <name>] [--db <name>] -- <command...>
  diff <baseline.json> <current.json> [--output-md <file>]

Defaults: --container reactor-postgres, --db reactor, --method auto

Methods:
  stat  pg_stat_statements. Costs a percent or two, so the in-database share it
        reports can be quoted as a number. Needs the extension preloaded:
          alter system set shared_preload_libraries = 'pg_stat_statements';
          -- restart, then: create extension pg_stat_statements;
  log   log_min_duration_statement. Needs nothing installed, but costs tens of
        percent and costs the arm issuing more statements more, so it bounds the
        share rather than pinning it.
  auto  stat when available, otherwise log.

Example:
  tsx pg-statement-diff.ts capture --label L0 --out /tmp/l0.json -- \\
    tsx reactor-direct.ts 5 -o 1000 -b 100 --auth-level L0_POLICIED --db "$DB"
  tsx pg-statement-diff.ts capture --label L1 --out /tmp/l1.json -- \\
    tsx reactor-direct.ts 5 -o 1000 -b 100 --auth-level L1 --db "$DB"
  tsx pg-statement-diff.ts diff /tmp/l0.json /tmp/l1.json
`);
}

/**
 * Restores statement logging if this process is interrupted.
 *
 * A run killed by a timeout or a Ctrl-C would otherwise leave the database
 * logging every statement indefinitely, which is both a performance problem for
 * whoever uses it next and an invisible one.
 */
function restoreOnExit(container: string, database: string): void {
  const restore = (): void => {
    execFile(
      "docker",
      [
        "exec",
        container,
        "psql",
        "-U",
        "postgres",
        "-d",
        database,
        "-q",
        "-c",
        "alter system reset log_min_duration_statement;",
        "-c",
        "select pg_reload_conf();",
      ],
      () => process.exit(1),
    );
  };
  process.on("SIGINT", restore);
  process.on("SIGTERM", restore);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const mode = argv[0];

  if (mode === "capture") {
    const sep = argv.indexOf("--");
    if (sep === -1) {
      usage();
      process.exit(1);
    }
    const flags = argv.slice(1, sep);
    const read = (name: string, fallback: string): string => {
      const i = flags.indexOf(name);
      return i >= 0 && flags[i + 1] ? flags[i + 1] : fallback;
    };
    const container = read("--container", "reactor-postgres");
    const database = read("--db", "reactor");
    const label = read("--label", "run");
    const out = read("--out", "/tmp/pg-capture.json");
    const command = argv.slice(sep + 1);

    let method = read("--method", "auto");
    if (method === "auto") {
      const ready = await statStatementsReady(container, database);
      method = ready ? "stat" : "log";
      process.stdout.write(
        ready
          ? "Using pg_stat_statements (low overhead).\n"
          : "pg_stat_statements unavailable, falling back to statement logging. " +
              "Logging taxes the arm issuing more statements harder, so the " +
              "in-database share it reports is a bound, not a number.\n",
      );
    }

    if (method === "stat") {
      const statCode = await captureFromStatStatements(
        container,
        database,
        label,
        out,
        command,
      );
      process.exit(statCode);
    }

    restoreOnExit(container, database);
    const code = await capture(container, database, label, out, command);
    process.exit(code);
  }

  if (mode === "diff") {
    const basePath = argv[1];
    const curPath = argv[2];
    if (!basePath || !curPath) {
      usage();
      process.exit(1);
    }

    const baseRaw = await readFile(basePath, "utf-8");
    const curRaw = await readFile(curPath, "utf-8");
    const report = renderDiff(
      JSON.parse(baseRaw) as Capture,
      JSON.parse(curRaw) as Capture,
    );

    const mdIndex = argv.indexOf("--output-md");
    if (mdIndex >= 0 && argv[mdIndex + 1]) {
      await writeFile(argv[mdIndex + 1], report);
      process.stdout.write(`Report saved to ${argv[mdIndex + 1]}\n`);
      return;
    }
    process.stdout.write(`${report}\n`);
    return;
  }

  usage();
  process.exit(1);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Error: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
