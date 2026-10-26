/** Base class for failures of the worker itself, as opposed to SQL errors. */
export class PGliteWorkerError extends Error {
  constructor(
    readonly label: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "PGliteWorkerError";
  }
}

/** The worker could not open its store; every call on the stand-in fails with this. */
export class PGliteWorkerInitError extends PGliteWorkerError {
  constructor(label: string, options?: { cause?: unknown }) {
    super(
      label,
      `PGlite worker for ${label} failed to open its store`,
      options,
    );
    this.name = "PGliteWorkerInitError";
  }
}

/** The worker thread exited (crash, terminate, out of memory) before answering. */
export class PGliteWorkerExitedError extends PGliteWorkerError {
  constructor(
    label: string,
    readonly exitCode: number,
    options?: { cause?: unknown },
  ) {
    super(
      label,
      `PGlite worker for ${label} exited with code ${exitCode}`,
      options,
    );
    this.name = "PGliteWorkerExitedError";
  }
}

/** A call was made after `close()` started. */
export class PGliteWorkerClosedError extends PGliteWorkerError {
  constructor(label: string) {
    super(label, `PGlite worker for ${label} is closed`);
    this.name = "PGliteWorkerClosedError";
  }
}
