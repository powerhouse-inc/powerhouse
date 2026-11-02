/** Where heartbeat lines go: any logger's `info`. */
export type ProgressHeartbeatLogger = {
  info(message: string): void;
};

export type ProgressHeartbeatOptions = {
  logger: ProgressHeartbeatLogger;
  /** What is running, e.g. "document-view catch-up" or "opening reactor-storage" */
  label: string;
  /** Silent while the work takes less than this (default 3 s): a fast step logs nothing. */
  quietMs?: number;
  /** Then one line this often (default 10 s), so a slow step is never silent for long. */
  everyMs?: number;
  /** Where the work stands, appended to each line (e.g. "1,200 of 45,000 operations, 3%"). */
  progress?: () => string | undefined;
};

export type ProgressHeartbeat = {
  /** Ends the heartbeat; a step that outlived `quietMs` logs how long it took. */
  stop(summary?: string): void;
};

/**
 * Liveness, and progress where the work can say it, for a long step that would
 * otherwise log nothing until it ends. Timers are unref'd: a heartbeat never
 * keeps a process alive.
 */
export function startProgressHeartbeat(
  options: ProgressHeartbeatOptions,
): ProgressHeartbeat {
  const { logger, label, progress } = options;
  const quietMs = options.quietMs ?? 3_000;
  const everyMs = options.everyMs ?? 10_000;
  const startedAt = Date.now();
  let spoke = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const where = (): string => {
    let text: string | undefined;
    try {
      text = progress?.();
    } catch {
      text = undefined;
    }
    return text ? `: ${text}` : "";
  };

  const tick = (): void => {
    if (stopped) return;
    logger.info(
      `${label}${spoke ? " still running" : "…"} (${seconds(Date.now() - startedAt)})${where()}`,
    );
    spoke = true;
    schedule(everyMs);
  };

  const schedule = (ms: number): void => {
    timer = setTimeout(tick, ms);
    (timer as { unref?: () => void }).unref?.();
  };

  schedule(quietMs);

  return {
    stop(summary) {
      if (stopped) return;
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      if (!spoke) return;
      logger.info(
        `${label} done in ${seconds(Date.now() - startedAt)}${summary ? `: ${summary}` : ""}`,
      );
    },
  };
}

/** Runs `work` under a heartbeat and stops it however the work ends. */
export async function withProgressHeartbeat<T>(
  options: ProgressHeartbeatOptions,
  work: () => Promise<T>,
): Promise<T> {
  const heartbeat = startProgressHeartbeat(options);
  try {
    const result = await work();
    heartbeat.stop();
    return result;
  } catch (error) {
    heartbeat.stop("failed");
    throw error;
  }
}

function seconds(ms: number): string {
  return ms < 60_000
    ? `${(ms / 1000).toFixed(1)} s`
    : `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}
