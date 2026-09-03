// Hand-written types for records.js, which the browser runs unbundled and
// vitest imports without allowJs. Keep in step with the module by hand.
import type { BenchmarkEntry } from "../records/benchmark-schema.js";
import type { TaskEntry } from "../records/task-schema.js";

export type Benchmark = BenchmarkEntry;
export type Task = TaskEntry;
export type MicroBenchmark = Extract<Benchmark, { kind: "micro" }>;
export type MicroSuite = MicroBenchmark["results"]["suites"][number];
export type MicroCase = MicroSuite["cases"][number];
export type MetricKey = "meanMs" | "medianMs" | "p99Ms" | "hz";

export const METRICS: ReadonlyArray<{
  key: MetricKey;
  label: string;
  lower: boolean;
}>;

export function parseJsonl(text: string): {
  entries: unknown[];
  badLines: Array<{ line: number; error: string }>;
};

export function shortSha(sha: string): string;
export function envFingerprint(environment: Benchmark["environment"]): string;
export function caseKey(suite: MicroSuite, benchCase: MicroCase): string;
export function suiteLabel(fullName: string): string;
export function xLabel(bench: Benchmark): string;

export interface RecordIndex {
  byId: Map<string, Benchmark | Task>;
  series: Map<string, Benchmark[]>;
  seriesOf: Map<string, string>;
  tasksForBenchmark: Map<string, Task[]>;
  invalidatedBy: Map<string, Task[]>;
  envBreaks: Set<string>;
}

export function indexRecords(
  benchmarks: Benchmark[],
  tasks: Task[],
): RecordIndex;

export function seriesTable(records: Benchmark[]): {
  keys: string[];
  rows: Array<{ bench: MicroBenchmark; values: Map<string, MicroCase> }>;
};

export interface ChartRow {
  x: string;
  recordId: string;
  suite: string;
  caseKey: string;
  caseName: string;
  value: number;
  lo: number;
  hi: number;
  rmePct: number;
  sampleCount: number;
}

export function chartRows(
  records: Benchmark[],
  metric: MetricKey,
  options?: { log?: boolean },
): ChartRow[];

export function taskLint(task: Task): string[];

export interface TaskEvent {
  taskId: string;
  kind: Task["kind"];
  title: string;
  status: Task["status"];
  at: string;
  by?: string;
  commit?: string;
  evidence: string[];
}

export function taskEvents(tasks: Task[]): TaskEvent[];
export function siteSha(task: Task, index: RecordIndex): string | undefined;
export function referenceProblems(
  index: RecordIndex,
  benchmarks: Benchmark[],
  tasks: Task[],
): string[];

export interface GitCommit {
  sha: string;
  fullSha?: string;
  subject: string;
  files?: string[];
}

export interface AnnotatedCommit extends GitCommit {
  fixes: string[];
  touches: string[];
}

export interface FixEvent {
  status: Task["status"];
  at: string;
  commit?: string;
  landedBefore?: { recordId: string; by: "commit" | "time" };
}

export interface SeriesTask {
  task: Task;
  foundIn: string[];
  fixes: FixEvent[];
  cases: string[];
}

export interface TaskMarker {
  x: string;
  taskId: string;
  kind: Task["kind"];
  status: Task["status"];
  role: "found" | "fixed";
  title: string;
}

export function caseTags(task: Task): string[];
export function rowMatchesCase(
  row: Pick<ChartRow, "suite" | "caseName">,
  tag: string,
): boolean;
export function fixEvents(task: Task): Task["history"];
export function sameCommit(
  a: string | undefined,
  b: string | undefined,
): boolean;
export function taskSites(task: Task): string[];
export function annotateCommits(
  commits: GitCommit[],
  tasks: Task[],
): AnnotatedCommit[];
export function seriesTasks(
  records: Benchmark[],
  index: RecordIndex,
  gapCommits?: Map<string, GitCommit[]>,
): SeriesTask[];
export function taskMarkers(
  summary: SeriesTask[],
  records: Benchmark[],
): TaskMarker[];
