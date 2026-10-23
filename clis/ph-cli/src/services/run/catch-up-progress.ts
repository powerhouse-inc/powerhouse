import {
  computeProgress,
  type CatchUpPriorityState,
  type IInspector,
  type ReactorProgress,
} from "@powerhousedao/reactor";

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
    return {
      rows: progressRows(computeProgress(processors, catchUp)),
      priority,
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
};

export type ProgressDisplayOptions = {
  readonly stdout: ProgressStream;
  readonly stderr: ProgressStream;
  /** How often the source is read. */
  readonly pollMs?: number;
  /** Without a TTY: how often a progress line is printed while catching up. */
  readonly lineMs?: number;
};

export type ProgressDisplay = {
  /** Stops polling, removes the bars and restores the streams. */
  stop(): void;
};

const DEFAULT_POLL_MS = 1_000;
const DEFAULT_LINE_MS = 10_000;
const MIN_BAR = 10;
const MAX_LABEL = 32;

function percent(row: ProgressRow): string {
  if (row.state === "errored") return "errored";
  if (row.state === "done") return "done";
  return `${Math.floor(Math.min(Math.max(row.fraction, 0), 1) * 100)}%`;
}

function fit(label: string, width: number): string {
  return label.length <= width
    ? label.padEnd(width)
    : `…${label.slice(label.length - width + 1)}`;
}

/** The bar block, one line per row, sized to `columns`, under the priority when known. */
export function renderBars(
  rows: readonly ProgressRow[],
  columns: number,
  priority?: ProgressPriority,
): string[] {
  const labelWidth = Math.min(
    MAX_LABEL,
    Math.max(...rows.map((row) => row.label.length), 0),
  );
  const barWidth = Math.max(MIN_BAR, columns - labelWidth - 12);
  const bars = rows.map((row) => {
    const fraction = row.state === "done" ? 1 : row.fraction;
    const filled = Math.round(Math.min(Math.max(fraction, 0), 1) * barWidth);
    const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
    return `${fit(row.label, labelWidth)} ${bar} ${percent(row).padStart(7)}`;
  });
  if (!priority) return bars;
  return [renderPriority(priority).slice(0, Math.max(columns, 1)), ...bars];
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
  let rows: readonly ProgressRow[] = [];
  let priority: ProgressPriority | undefined;
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
  const draw = () => {
    if (!tty || stopped || !atLineStart || !busy(rows)) return;
    const lines = renderBars(rows, stdout.columns ?? 80, priority);
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
  if (tty) {
    stdout.write = above(originalOut as never) as NodeJS.WriteStream["write"];
    stderr.write = above(originalErr as never) as NodeJS.WriteStream["write"];
  }

  const tick = async () => {
    if (reading || stopped) return;
    reading = true;
    try {
      ({ rows, priority } = await source());
    } catch {
      // The reactor did not answer; keep the last rows until it does.
    } finally {
      reading = false;
    }
    if (stopped) return;
    if (tty) {
      erase();
      draw();
      return;
    }
    const now = Date.now();
    if (busy(rows) && now - lastLine >= (options.lineMs ?? DEFAULT_LINE_MS)) {
      originalOut(`${renderLine(rows, priority)}\n`);
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
        stdout.write = restoreOut;
        stderr.write = restoreErr;
      }
    },
  };
}
