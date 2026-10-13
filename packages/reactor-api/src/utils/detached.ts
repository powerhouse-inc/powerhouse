import type { ILogger } from "document-model";

export type ReportError = (error: unknown) => void;

export type RunDetachedOptions = {
  logger: ILogger;
  report?: ReportError;
};

/** Runs work nobody awaits: a failure is logged and reported, never thrown. */
export async function runDetached(
  label: string,
  task: () => unknown,
  { logger, report }: RunDetachedOptions,
): Promise<void> {
  try {
    await task();
  } catch (error) {
    logger.error("@label failed: @error", label, error);
    try {
      report?.(error);
    } catch (reportError) {
      logger.error("Reporting @label failed: @error", label, reportError);
    }
  }
}
