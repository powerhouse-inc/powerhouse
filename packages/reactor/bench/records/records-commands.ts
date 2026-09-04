import { join } from "node:path";
import { z } from "zod";
import { BenchmarkEntry } from "./benchmark-schema.js";
import type { BenchmarkEntry as Benchmark } from "./benchmark-schema.js";
import {
  nextId,
  readEntries,
  RecordsError,
  withLock,
  writeEntries,
} from "./jsonl-store.js";
import type { LineProblem } from "./jsonl-store.js";
import { RECORDS_EXIT } from "./records-options.js";
import type {
  AddOptions,
  RecordsOptions,
  SetStatusOptions,
  ShowOptions,
  VerifyOptions,
} from "./records-options.js";
import { TaskEntry } from "./task-schema.js";
import type { StatusEvent, TaskEntry as Task } from "./task-schema.js";

export const BENCHMARKS_FILE = "BENCHMARKS.jsonl";
export const TASKS_FILE = "TASKS.jsonl";
const LOCK_FILE = ".records.lock";

/** Everything the commands cannot compute for themselves. */
export type CommandIo = {
  /** Reads the entry JSON from a path, or from stdin when given "-". */
  readInput: (source: string) => string;
  now: () => string;
};

export type CommandResult = {
  exit: number;
  lines: string[];
  data: Record<string, unknown>;
};

export function runRecordsCommand(
  options: RecordsOptions,
  io: CommandIo,
): CommandResult {
  switch (options.subcommand) {
    case "add-benchmark":
      return addBenchmark(options, io);
    case "add-task":
      return addTask(options, io);
    case "set-status":
      return setStatus(options, io);
    case "verify":
      return verify(options);
    case "show":
      return show(options);
  }
}

function addBenchmark(options: AddOptions, io: CommandIo): CommandResult {
  const candidate = readCandidate(options, io);
  const path = join(options.dir, BENCHMARKS_FILE);

  return withLock(join(options.dir, LOCK_FILE), () => {
    const existing = readValidated(path, BenchmarkEntry, BENCHMARKS_FILE);
    const id = allocateId(
      "B",
      options.id,
      existing.map((entry) => entry.id),
    );

    const entry = parseOrReject(BenchmarkEntry, { ...candidate, id });
    if (!options.dryRun) {
      writeEntries(path, [...existing, entry]);
    }

    return {
      exit: RECORDS_EXIT.ok,
      lines: [
        `${id} ${verb(options)} ${path} (${entry.kind}, ${entry.tier} tier, ${shapeSummary(entry)})`,
      ],
      data: { id, file: path, dryRun: options.dryRun },
    };
  });
}

function addTask(options: AddOptions, io: CommandIo): CommandResult {
  const candidate = readCandidate(options, io);
  const path = join(options.dir, TASKS_FILE);

  return withLock(join(options.dir, LOCK_FILE), () => {
    const existing = readValidated(path, TaskEntry, TASKS_FILE);
    const id = allocateId(
      "T",
      options.id,
      existing.map((entry) => entry.id),
    );

    // Without this, "UNVERIFIED by default" would not be a default: history is
    // min(1) and must agree with status, so every caller would hand-write the
    // same opening event.
    const createdAt =
      typeof candidate.createdAt === "string" ? candidate.createdAt : io.now();
    const status = candidate.status ?? "UNVERIFIED";
    const history = candidate.history ?? [{ status, at: createdAt }];

    const entry = parseOrReject(TaskEntry, {
      ...candidate,
      id,
      createdAt,
      status,
      history,
    });
    if (!options.dryRun) {
      writeEntries(path, [...existing, entry]);
    }

    return {
      exit: RECORDS_EXIT.ok,
      lines: [
        `${id} ${verb(options)} ${path} (${entry.kind}, priority ${entry.priority}, ${entry.status})`,
      ],
      data: { id, file: path, dryRun: options.dryRun },
    };
  });
}

/**
 * Two shas name the same commit when one is a prefix of the other. Records are
 * stamped with `rev-parse --short=12` while callers pass whatever length they
 * read back from `rev-parse`, so neither side can be assumed longer.
 */
function samePrefix(left: string, right: string): boolean {
  return left.startsWith(right) || right.startsWith(left);
}

/**
 * FIXED means a benchmark moved, so it has to cite the run that shows it did.
 * Without this the status is testimony: the fixer reports its own numbers, the
 * artifacts behind them are temporary, and nothing in the records measures the
 * fixed state. Requiring a record stamped with the fix's own sha also forces
 * the ordering that makes such a record possible - commit, then measure the
 * clean tree, then set the status - because a run against a dirty tree would
 * carry the sha of the parent and describe code that is not there.
 */
function requireMeasuredFix(
  options: SetStatusOptions,
  task: Task,
  benchmarks: Benchmark[],
): void {
  if (options.commit === "") {
    throw new RecordsError(
      [
        `${options.taskId} cannot be FIXED without --commit: the status is a claim about a specific commit.`,
        "Commit the fix first, then pass the sha it landed at.",
      ].join("\n"),
      RECORDS_EXIT.unmeasuredFix,
    );
  }

  const cited = benchmarks.filter((entry) =>
    options.evidence.includes(entry.id),
  );
  const measured = cited.filter((entry) =>
    samePrefix(entry.environment.reactorSha, options.commit),
  );

  if (measured.length === 0) {
    const detail =
      cited.length === 0
        ? "it cites no records at all"
        : cited
            .map(
              (entry) => `${entry.id} measured ${entry.environment.reactorSha}`,
            )
            .join(", ");
    throw new RecordsError(
      [
        `${options.taskId} cannot be FIXED at ${options.commit}: no cited benchmark was measured at that commit (${detail}).`,
        `Record the benchmark on the clean tree at ${options.commit}, then cite it:`,
        "  pnpm bench:record <bench> --task <T-id> --supersedes <old B-id>",
        "The old record stays as the before; the new one is the proof the number moved.",
      ].join("\n"),
      RECORDS_EXIT.unmeasuredFix,
    );
  }

  // A sha match alone only proves that something was measured at the fix. The
  // run has to be the same benchmark the finding rests on, or a task about the
  // queue could close on a fresh auth record that never touched it.
  const beforeCommands = new Set(
    benchmarks
      .filter((entry) => priorEvidence(task).includes(entry.id))
      .map((entry) => entry.command),
  );
  if (beforeCommands.size === 0) {
    return;
  }
  if (measured.some((entry) => beforeCommands.has(entry.command))) {
    return;
  }

  throw new RecordsError(
    [
      `${options.taskId} cannot be FIXED at ${options.commit}: the records measured at that commit are not the benchmark the finding rests on.`,
      `Measured there: ${measured.map((entry) => `${entry.id} (${entry.command})`).join(", ")}`,
      `The finding rests on: ${[...beforeCommands].join(", ")}`,
      "Re-run that benchmark on the clean tree and cite the record it writes.",
    ].join("\n"),
    RECORDS_EXIT.unmeasuredFix,
  );
}

/** Everything the task cited before this event, envelope and history alike. */
function priorEvidence(task: Task): string[] {
  return [...task.evidence, ...task.history.flatMap((event) => event.evidence)];
}

function setStatus(options: SetStatusOptions, io: CommandIo): CommandResult {
  const path = join(options.dir, TASKS_FILE);

  return withLock(join(options.dir, LOCK_FILE), () => {
    const existing = readValidated(path, TaskEntry, TASKS_FILE);
    const index = existing.findIndex((entry) => entry.id === options.taskId);
    if (index === -1) {
      throw new RecordsError(
        `No such task: ${options.taskId}`,
        RECORDS_EXIT.notFound,
      );
    }

    const previous = existing[index];

    if (options.status === "FIXED") {
      requireMeasuredFix(
        options,
        previous,
        readValidated(
          join(options.dir, BENCHMARKS_FILE),
          BenchmarkEntry,
          BENCHMARKS_FILE,
        ),
      );
    }

    const event: StatusEvent = {
      status: options.status,
      at: options.at === "" ? io.now() : options.at,
      evidence: options.evidence,
    };
    if (options.note !== "") {
      event.note = options.note;
    }
    if (options.by !== "") {
      event.by = options.by;
    }
    if (options.commit !== "") {
      event.commit = options.commit;
    }

    const entry = parseOrReject(TaskEntry, {
      ...previous,
      status: options.status,
      history: [...previous.history, event],
    });

    if (!options.dryRun) {
      const entries = [...existing];
      entries[index] = entry;
      writeEntries(path, entries);
    }

    return {
      exit: RECORDS_EXIT.ok,
      lines: [
        `${entry.id} ${previous.status} -> ${entry.status} (history now ${entry.history.length} events)`,
      ],
      data: {
        id: entry.id,
        from: previous.status,
        to: entry.status,
        historyLength: entry.history.length,
        dryRun: options.dryRun,
      },
    };
  });
}

function verify(options: VerifyOptions): CommandResult {
  const benchmarksPath = join(options.dir, BENCHMARKS_FILE);
  const tasksPath = join(options.dir, TASKS_FILE);
  const wantBenchmarks = options.target !== "tasks";
  const wantTasks = options.target !== "benchmarks";

  const benchmarks = readEntries(benchmarksPath, BenchmarkEntry);
  const tasks = readEntries(tasksPath, TaskEntry);

  const lines: string[] = [];
  if (wantBenchmarks) {
    lines.push(...renderProblems(BENCHMARKS_FILE, benchmarks.problems));
  }
  if (wantTasks) {
    lines.push(...renderProblems(TASKS_FILE, tasks.problems));
  }

  const failures = lines.length;
  const crossFile =
    options.target === "all"
      ? crossFileProblems(benchmarks.entries, tasks.entries)
      : [];
  lines.push(...crossFile);

  const counts: string[] = [];
  if (wantBenchmarks) {
    counts.push(`${BENCHMARKS_FILE} ${benchmarks.entries.length} entries`);
  }
  if (wantTasks) {
    counts.push(`${TASKS_FILE} ${tasks.entries.length} entries`);
  }

  const clean = lines.length === 0;
  lines.push(
    clean
      ? `${counts.join(", ")}, every reference resolves`
      : `${counts.join(", ")}, ${failures} bad line(s), ${crossFile.length} reference problem(s)`,
  );

  return {
    exit: clean ? RECORDS_EXIT.ok : RECORDS_EXIT.corruptFile,
    lines,
    data: {
      benchmarks: benchmarks.entries.length,
      tasks: tasks.entries.length,
      badLines: failures,
      referenceProblems: crossFile.length,
    },
  };
}

function show(options: ShowOptions): CommandResult {
  const isBenchmark = options.id.startsWith("B-");
  const isTask = options.id.startsWith("T-");
  if (!isBenchmark && !isTask) {
    throw new RecordsError(
      `Ids look like B-001 or T-001, got ${options.id}`,
      RECORDS_EXIT.usage,
    );
  }

  const file = isBenchmark ? BENCHMARKS_FILE : TASKS_FILE;
  const path = join(options.dir, file);
  const entries: { id: string }[] = isBenchmark
    ? readValidated(path, BenchmarkEntry, file)
    : readValidated(path, TaskEntry, file);

  const entry = entries.find((candidate) => candidate.id === options.id);
  if (entry === undefined) {
    throw new RecordsError(
      `No such entry: ${options.id}`,
      RECORDS_EXIT.notFound,
    );
  }

  return {
    exit: RECORDS_EXIT.ok,
    lines: [JSON.stringify(entry, null, 2)],
    data: entry as unknown as Record<string, unknown>,
  };
}

/** Whole-file validation on every operation: a corrupt line found now is
 * cheaper than one found by a consumer later, and the file has to be read
 * anyway to allocate the next id. */
function readValidated<T>(
  path: string,
  schema: z.ZodType<T>,
  file: string,
): T[] {
  const result = readEntries(path, schema);
  if (result.problems.length > 0) {
    throw new RecordsError(
      [
        `${file} does not parse, so nothing was written:`,
        ...renderProblems(file, result.problems),
      ].join("\n"),
      RECORDS_EXIT.corruptFile,
    );
  }
  return result.entries;
}

function renderProblems(file: string, problems: LineProblem[]): string[] {
  return problems.map(
    (problem) =>
      `${file}:${problem.line} ${problem.message.replace(/\n/g, "\n  ")}`,
  );
}

/** The checks a per-line schema cannot make: ids are only meaningful against
 * the other file. */
function crossFileProblems(benchmarks: Benchmark[], tasks: Task[]): string[] {
  const problems: string[] = [];
  const benchmarkIds = new Set(benchmarks.map((entry) => entry.id));
  const taskIds = new Set(tasks.map((entry) => entry.id));

  problems.push(
    ...duplicates(benchmarks.map((entry) => entry.id)).map(
      (id) => `${BENCHMARKS_FILE} has more than one ${id}`,
    ),
  );
  problems.push(
    ...duplicates(tasks.map((entry) => entry.id)).map(
      (id) => `${TASKS_FILE} has more than one ${id}`,
    ),
  );

  for (const benchmark of benchmarks) {
    for (const id of benchmark.supersedes) {
      if (!benchmarkIds.has(id)) {
        problems.push(`${benchmark.id} supersedes ${id}, which does not exist`);
      }
    }
    for (const id of benchmark.tasks) {
      if (!taskIds.has(id)) {
        problems.push(`${benchmark.id} names task ${id}, which does not exist`);
      }
    }
  }

  for (const task of tasks) {
    const evidence = [
      ...task.evidence,
      ...task.history.flatMap((event) => event.evidence),
    ];
    for (const id of evidence) {
      if (!benchmarkIds.has(id)) {
        problems.push(`${task.id} cites ${id}, which does not exist`);
      }
    }
    if (task.kind === "GAP") {
      for (const id of task.details.blockedBy) {
        if (!taskIds.has(id)) {
          problems.push(`${task.id} is blocked by ${id}, which does not exist`);
        }
      }
    }
    if (task.kind === "HARNESS") {
      for (const id of task.details.invalidates) {
        if (!benchmarkIds.has(id)) {
          problems.push(`${task.id} invalidates ${id}, which does not exist`);
        }
      }
    }
  }

  return problems;
}

function duplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      repeated.add(id);
    }
    seen.add(id);
  }
  return [...repeated];
}

function readCandidate(
  options: AddOptions,
  io: CommandIo,
): Record<string, unknown> {
  let raw: string;
  try {
    raw = io.readInput(options.input);
  } catch (error) {
    throw new RecordsError(
      `Could not read ${options.input}: ${error instanceof Error ? error.message : String(error)}`,
      RECORDS_EXIT.error,
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new RecordsError(
      `Input is not JSON: ${error instanceof Error ? error.message : String(error)}`,
      RECORDS_EXIT.invalidEntry,
    );
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RecordsError(
      "Input must be exactly one JSON object",
      RECORDS_EXIT.invalidEntry,
    );
  }

  const candidate = value as Record<string, unknown>;
  if ("id" in candidate) {
    throw new RecordsError(
      "The tool allocates the id. Pass --id to choose one.",
      RECORDS_EXIT.invalidEntry,
    );
  }

  return candidate;
}

function allocateId(
  prefix: string,
  requested: string,
  existing: string[],
): string {
  const id = requested === "" ? nextId(prefix, existing) : requested;
  if (existing.includes(id)) {
    throw new RecordsError(`${id} is already taken`, RECORDS_EXIT.duplicateId);
  }
  return id;
}

function parseOrReject<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new RecordsError(
      `Entry rejected:\n${z.prettifyError(parsed.error)}`,
      RECORDS_EXIT.invalidEntry,
    );
  }
  return parsed.data;
}

/** What the caller should recognise as their own run. Each kind counts the
 * thing it is measured in: a suite total tells you nothing about cells. */
function shapeSummary(entry: Benchmark): string {
  if (entry.kind === "concurrency") {
    return `${entry.results.cells.length} cells, ${entry.results.protocol.repetitions} reps`;
  }

  const cases = entry.results.suites.reduce(
    (total, suite) => total + suite.cases.length,
    0,
  );
  return `${entry.results.suites.length} suites, ${cases} cases, ${entry.results.runner}`;
}

function verb(options: AddOptions): string {
  return options.dryRun ? "would be appended to" : "appended to";
}
