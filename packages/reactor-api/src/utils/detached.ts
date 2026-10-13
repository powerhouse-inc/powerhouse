import type { ILogger } from "document-model";

export type ReportError = (error: unknown) => void;

export type RunDetachedOptions = {
  logger: ILogger;
  report?: ReportError;
};

/** Logs `error` as the message's last replacement and reports it. */
export function reportFailure(
  { logger, report }: RunDetachedOptions,
  error: unknown,
  message: string,
  ...args: unknown[]
): void {
  logger.error(message, ...args, error);
  try {
    report?.(error);
  } catch (reportError) {
    logger.error("Reporting a failure failed: @error", reportError);
  }
}

/** Runs work nobody awaits: a failure is logged and reported, never thrown. */
export async function runDetached(
  label: string,
  task: () => unknown,
  options: RunDetachedOptions,
): Promise<void> {
  try {
    await task();
  } catch (error) {
    reportFailure(options, error, "@label failed: @error", label);
  }
}
