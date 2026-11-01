import {
  computeProgress,
  formatCount,
  formatDuration,
  rankSlowest,
  renderDoneSummary,
  renderSlowLine,
  type CatchUpPriorityState,
  type IInspector,
  type InspectorProcessorTimingReport,
  type MemoryTelemetryReport,
  type ReactorProgress,
  type SlowProcessor,
} from "@powerhousedao/reactor";

import { renderMemoryLine, wantsMemoryLine } from "./memory-line.js";

/** One bar: a processor factory or a read model, and how far its catch-up has got. */
export type ProgressRow = {
  readonly label: string;
  /** 0..1 of the current run. */
  readonly fraction: number;
  readonly state: "catching-up" | "done" | "errored";
};

/** The catch-up priority as the progress display states it. */
export type ProgressPriority = {
  readonly mode: CatchUpPriorityState["mode"];
  readonly level: number;
  readonly reason: string;
};

/** What one read of the source shows: the bars, and the priority when known. */
export type ProgressSnapshot = {
  readonly rows: readonly ProgressRow[];
  readonly priority: ProgressPriority | undefined;
  /** Undefined when the reactor has no timing, an older one. */
  readonly timing?: InspectorProcessorTimingReport;
  /** The latest sample; undefined when the reactor has no memory telemetry. */
  readonly memory?: MemoryTelemetryReport;
};

/** Reads the current rows; rejects while the reactor cannot answer. */
export type ProgressSource = () => Promise<ProgressSnapshot>;

function withDrives(label: string, driveCount: number): string {
  return `${label} (${driveCount} ${driveCount === 1 ? "drive" : "drives"})`;
}

/** One row per processor factory, then one per reactor read model. */
export function progressRows(progress: ReactorProgress): ProgressRow[] {
  const factories = progress.factories.map((factory): ProgressRow => ({
    label: withDrives(factory.label, factory.driveCount),
    fraction: factory.fraction,
    state:
      factory.phase === "errored"
        ? "errored"
        : factory.phase === "catching-up"
          ? "catching-up"
          : "done",
  }));
  const readModels = progress.readModels.map((model): ProgressRow => ({
    label: model.consumerId,
    fraction: model.fraction,
    state: model.blocked ? "errored" : model.complete ? "done" : "catching-up",
  }));
  return [...factories, ...readModels];
}

/** Rows from a reactor's inspector: its processors, catch-up status and priority. */
export function inspectorProgressSource(inspector: IInspector): ProgressSource {
  // Its summary reads every sample of the window, too much for each poll.
  let memoryReadAt = 0;
  return async () => {
    const processors = await inspector.getProcessors();
    let catchUp:
      | Awaited<ReturnType<IInspector["getCatchUpStatus"]>>
      | undefined;
    try {
      catchUp = await inspector.getCatchUpStatus();
    } catch {
      catchUp = undefined;
    }
    let priority: ProgressPriority | undefined;
    try {
      const state = await inspector.getCatchUpPriority();
      priority = { mode: state.mode, level: state.level, reason: state.reason };
    } catch {
      priority = undefined;
    }
    let timing: InspectorProcessorTimingReport | undefined;
    try {
      timing = await inspector.getProcessorTiming();
    } catch {
      timing = undefined;
    }
    let memory: MemoryTelemetryReport | undefined;
    if (Date.now() - memoryReadAt >= MEMORY_READ_MS) {
      memoryReadAt = Date.now();
      try {
        memory = await inspector.getMemoryTelemetry(1);
      } catch {
        memory = undefined;
      }
    }
    return {
      rows: progressRows(computeProgress(processors, catchUp)),
      priority,
      timing,
      memory,
    };
  };
}

/** `catch-up priority 6 (dynamic, idle 14 s)`, or `catch-up priority 3 (fixed)`. */
export function renderPriority(priority: ProgressPriority): string {
  const why =
    priority.mode === "dynamic" ? `dynamic, ${priority.reason}` : "fixed";
  return `catch-up priority ${priority.level} (${why})`;
}

/** The slice of a TTY stream the display writes to and intercepts. */
export type ProgressStream = {
  write: NodeJS.WriteStream["write"];
  readonly isTTY?: boolean;
  readonly columns?: number;
  /** A TTY stream emits "resize" when the terminal's size changes. */
  on?(event: "resize", listener: () => void): unknown;
  off?(event: "resize", listener: () => void): unknown;
};

/** The console width the bars are sized for: a reported width, else 80. */
function widthOf(stream: ProgressStream): number {
  const columns = stream.columns;
  return typeof columns === "number" && columns > 0 ? columns : 80;
}

export type ProgressDisplayOptions = {
  readonly stdout: ProgressStream;
  readonly stderr: ProgressStream;
  /** How often the source is read. */
  readonly pollMs?: number;
  /** Without a TTY: how often a progress line is printed while catching up. */
  readonly lineMs?: number;
  /** How many of the slowest processors to show; 0 hides them. */
  readonly top?: number;
};

export type ProgressDisplay = {
  /** Stops polling, removes the bars and restores the streams. */
  stop(): void;
};

const DEFAULT_POLL_MS = 1_000;
const DEFAULT_LINE_MS = 10_000;
const DEFAULT_TOP = 5;
const MEMORY_READ_MS = 5_000;
const MIN_BAR = 10;
const MAX_LABEL = 32;

function percent(row: ProgressRow): string {
  if (row.state === "errored") return "errored";
  if (row.state === "done") return "done";
  return `${Math.floor(Math.min(Math.max(row.fraction, 0), 1) * 100)}%`;
}

// label, space, bar, space, 7 for "errored" / "100%"
const BAR_FIXED = 9;

function barLabelWidth(rows: readonly ProgressRow[], columns: number): number {
  const width = Math.max(columns - 1, 1);
  const longest = Math.max(...rows.map((row) => row.label.length), 0);
  return Math.max(1, Math.min(MAX_LABEL, longest, width - BAR_FIXED - MIN_BAR));
}

function fit(label: string, width: number): string {
  return label.length <= width
    ? label.padEnd(width)
    : `…${label.slice(label.length - width + 1)}`;
}

/**
 * The bar block, one line per row, under the priority when known. Every line
 * stays short of the terminal's last column: a line that fills it wraps on
 * xterm-based terminals (VS Code, Windows Terminal), and the erase would then
 * lift fewer lines than are on screen, leaving old bars behind. On a narrow
 * terminal the label gives way before the bar.
 */
export function renderBars(
  rows: readonly ProgressRow[],
  columns: number,
  priority?: ProgressPriority,
): string[] {
  const width = Math.max(columns - 1, 1);
  const labelWidth = barLabelWidth(rows, columns);
  const barWidth = Math.max(MIN_BAR, width - labelWidth - BAR_FIXED);
  const bars = rows.map((row) => {
    const fraction = row.state === "done" ? 1 : row.fraction;
    const filled = Math.round(Math.min(Math.max(fraction, 0), 1) * barWidth);
    const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
    return `${fit(row.label, labelWidth)} ${bar} ${percent(row).padStart(7)}`.slice(
      0,
      width,
    );
  });
  if (!priority) return bars;
  return [renderPriority(priority).slice(0, width), ...bars];
}

/** The columns of the slowest block, dropped from the first on a narrow console. */
const SLOW_COLUMNS: readonly {
  title: string;
  width: number;
  cell: (row: SlowProcessor) => string;
}[] = [
  {
    title: "eta",
    width: 7,
    cell: (row) => (row.etaMs === null ? "" : formatDuration(row.etaMs)),
  },
  {
    title: "behind",
    width: 8,
    cell: (row) => formatCount(row.ordinalsBehind),
  },
  { title: "fill", width: 7, cell: (row) => formatDuration(row.fillMs) },
  { title: "read", width: 7, cell: (row) => formatDuration(row.readMs) },
  { title: "op/s", width: 6, cell: (row) => formatCount(row.opsPerSecond) },
  {
    title: "handler",
    width: 8,
    cell: (row) => formatDuration(row.handlerMs),
  },
];

const BUSY_WIDTH = 7;
const SLOW_ORDER = ["handler", "read", "fill", "op/s", "behind", "eta"];

/**
 * The slowest processors as a table, for under the bars. The label column
 * is at least as wide as the bars' and every line stays short of the last
 * column; a narrow console loses `eta`, `behind`, `fill`, `read`, `op/s`,
 * `handler`, in that order, and `busy` always stays.
 */
export function renderSlowest(
  rows: readonly SlowProcessor[],
  columns: number,
  labelWidth: number,
  windowMs: number,
): string[] {
  if (rows.length === 0) return [];
  const width = Math.max(columns - 1, 1);
  const title = `slowest, last ${Math.round(windowMs / 1000)} s`;
  const longest = Math.max(
    title.length,
    ...rows.map((row) => row.label.length),
  );
  const label = Math.max(
    1,
    Math.min(
      Math.max(labelWidth, Math.min(longest, MAX_LABEL)),
      width - BUSY_WIDTH - 1,
    ),
  );
  let room = width - label - BUSY_WIDTH;
  const kept = new Set<string>();
  for (const column of [...SLOW_COLUMNS].reverse()) {
    if (room < column.width) break;
    room -= column.width;
    kept.add(column.title);
  }
  const shown = SLOW_ORDER.flatMap((name) => {
    const column = SLOW_COLUMNS.find((c) => c.title === name);
    return column && kept.has(name) ? [column] : [];
  });
  const line = (first: string, busy: string, cells: string[]) =>
    `${fit(first, label)}${busy.padStart(BUSY_WIDTH)}${cells.join("")}`.slice(
      0,
      width,
    );
  return [
    line(
      title,
      "busy",
      shown.map((column) => column.title.padStart(column.width)),
    ),
    ...rows.map((row) =>
      line(
        row.label,
        formatDuration(row.busyMs),
        shown.map((column) => column.cell(row).padStart(column.width)),
      ),
    ),
  ];
}

/** One line for a log without a TTY, listing only what is still catching up. */
export function renderLine(
  rows: readonly ProgressRow[],
  priority?: ProgressPriority,
): string {
  const busy = rows.filter((row) => row.state !== "done");
  const line = `catch-up: ${busy.map((row) => `${row.label} ${percent(row)}`).join(" · ")}`;
  return priority
    ? `${line} · priority ${priority.level} ${priority.mode}`
    : line;
}

function busy(rows: readonly ProgressRow[]): boolean {
  return rows.some((row) => row.state !== "done");
}

/**
 * Shows catch-up progress while any row is not done. In a terminal the bars
 * sit below the output and every other write is printed above them; without
 * one, a progress line is printed every `lineMs`.
 */
export function startProgressDisplay(
  source: ProgressSource,
  options: ProgressDisplayOptions,
): ProgressDisplay {
  const { stdout, stderr } = options;
  const tty = stdout.isTTY === true;
  const top = options.top ?? DEFAULT_TOP;
  let rows: readonly ProgressRow[] = [];
  let priority: ProgressPriority | undefined;
  let timing: InspectorProcessorTimingReport | undefined;
  let memory: MemoryTelemetryReport | undefined;
  let lastMemoryLine = Date.now();
  let busySince: number | undefined;
  let drawn = 0;
  let atLineStart = true;
  let lastLine = 0;
  let stopped = false;
  let reading = false;

  const restoreOut = stdout.write;
  const restoreErr = stderr.write;
  const originalOut = restoreOut.bind(stdout);
  const originalErr = restoreErr.bind(stderr);

  const erase = () => {
    if (drawn > 0) originalOut(`\x1b[${drawn}A\r\x1b[0J`);
    drawn = 0;
  };
  const slowest = () =>
    timing && timing.level !== "off" && top > 0
      ? rankSlowest(timing, top, "window")
      : [];
  const draw = () => {
    if (!tty || stopped || !atLineStart || !busy(rows)) return;
    const columns = widthOf(stdout);
    const lines = [
      ...renderBars(rows, columns, priority),
      ...renderSlowest(
        slowest(),
        columns,
        barLabelWidth(rows, columns),
        timing?.windowMs ?? 0,
      ),
    ];
    originalOut(`${lines.join("\n")}\n`);
    drawn = lines.length;
  };

  // Every other write goes above the bars: lift them, write, put them back.
  const above =
    (write: (chunk: string | Uint8Array, ...rest: never[]) => boolean) =>
    (chunk: string | Uint8Array, ...rest: never[]): boolean => {
      erase();
      const result = write(chunk, ...rest);
      const text =
        typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      if (text.length > 0) atLineStart = text.endsWith("\n");
      draw();
      return result;
    };
  // A resized terminal has already reflowed the drawn lines; redraw for the
  // new width right away rather than at the next poll.
  const onResize = () => {
    if (stopped) return;
    erase();
    draw();
  };
  if (tty) {
    stdout.write = above(originalOut as never) as NodeJS.WriteStream["write"];
    stderr.write = above(originalErr as never) as NodeJS.WriteStream["write"];
    stdout.on?.("resize", onResize);
  }

  const tick = async () => {
    if (reading || stopped) return;
    reading = true;
    try {
      ({ rows, priority, timing, memory } = await source());
    } catch {
      // The reactor did not answer; keep the last rows until it does.
    } finally {
      reading = false;
    }
    if (stopped) return;
    const now = Date.now();
    // Through stderr, so a terminal's bars lift above it like any other output.
    if (
      memory &&
      wantsMemoryLine(memory) &&
      now - lastMemoryLine >= memory.consoleIntervalMs
    ) {
      const line = renderMemoryLine(memory);
      if (line) {
        stderr.write(`${line}\n`);
        lastMemoryLine = now;
      }
    }
    if (busy(rows)) {
      busySince ??= now;
    } else if (busySince !== undefined) {
      const wallMs = now - busySince;
      busySince = undefined;
      if (timing && timing.level !== "off" && top > 0) {
        erase();
        originalOut(
          `${renderDoneSummary(rankSlowest(timing, top, "total"), wallMs)}\n`,
        );
      }
    }
    if (tty) {
      erase();
      draw();
      return;
    }
    if (busy(rows) && now - lastLine >= (options.lineMs ?? DEFAULT_LINE_MS)) {
      originalOut(`${renderLine(rows, priority)}\n`);
      const slow = slowest();
      if (slow.length > 0) {
        originalOut(`${renderSlowLine(slow, timing?.windowMs ?? 0)}\n`);
      }
      lastLine = now;
    }
  };

  const timer = setInterval(
    () => void tick(),
    options.pollMs ?? DEFAULT_POLL_MS,
  );
  (timer as { unref?: () => void }).unref?.();
  void tick();

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      erase();
      if (tty) {
        stdout.off?.("resize", onResize);
        stdout.write = restoreOut;
        stderr.write = restoreErr;
      }
    },
  };
}
