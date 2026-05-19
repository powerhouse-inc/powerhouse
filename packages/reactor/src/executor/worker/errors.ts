/**
 * Errors emitted by {@link WorkerHandle} at the IPC / transport boundary.
 *
 * These are distinct from per-job failures (which surface as
 * `JobResult.success === false`). The manager branches on `name` to decide
 * between retrying, replacing the worker, or surfacing the failure.
 */

export class WorkerBusyError extends Error {
  readonly name = "WorkerBusyError";
  constructor(workerId: string, jobId: string) {
    super(
      `worker ${workerId} is busy; cannot dispatch job ${jobId} while another job is in flight`,
    );
  }
}

export class WorkerExitedError extends Error {
  readonly name = "WorkerExitedError";
  constructor(
    workerId: string,
    readonly exitCode: number,
    readonly lastCorrelationId: string | null,
  ) {
    super(
      `worker ${workerId} exited with code ${exitCode}` +
        (lastCorrelationId
          ? ` while handling correlationId ${lastCorrelationId}`
          : ""),
    );
  }
}

export class WorkerAbortTimeoutError extends Error {
  readonly name = "WorkerAbortTimeoutError";
  constructor(
    workerId: string,
    readonly correlationId: string,
    readonly graceMs: number,
  ) {
    super(
      `worker ${workerId} did not acknowledge abort for ${correlationId} within ${graceMs}ms; terminating`,
    );
  }
}

export class WorkerInitFailedError extends Error {
  readonly name = "WorkerInitFailedError";
  constructor(
    workerId: string,
    readonly reason: string,
    options?: { cause?: unknown },
  ) {
    super(`worker ${workerId} failed to initialize: ${reason}`, options);
  }
}

export class WorkerShutdownTimeoutError extends Error {
  readonly name = "WorkerShutdownTimeoutError";
  constructor(
    workerId: string,
    readonly graceMs: number,
  ) {
    super(
      `worker ${workerId} did not drain within ${graceMs}ms; force-terminating`,
    );
  }
}
