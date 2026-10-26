import { childLogger, type ILogger } from "document-model";

const warned = new Set<string>();

const deprecationLogger: ILogger = childLogger([
  "reactor-client",
  "deprecated",
]);

/** The process environment where there is one; browsers have none. */
type ProcessLike = { env?: Record<string, string | undefined> };

function silenced(): boolean {
  const process = (globalThis as { process?: ProcessLike }).process;
  return Boolean(process?.env?.PH_SILENCE_DEPRECATIONS);
}

/**
 * Warns that `name` is deprecated, once per name per process, naming what
 * replaces it. Silenced when `PH_SILENCE_DEPRECATIONS` is set in the process
 * environment; a browser, which has no process, always warns.
 *
 * @param name - What is deprecated, e.g. "IReactorClient.execute"
 * @param hint - What to use instead
 * @param logger - Where the warning goes; a shared "deprecated" logger by default
 */
export function warnOnce(
  name: string,
  hint: string,
  logger: ILogger = deprecationLogger,
): void {
  if (warned.has(name) || silenced()) {
    return;
  }
  warned.add(name);
  logger.warn("@name is deprecated. @hint", name, hint);
}

/** Forgets which names have warned, so a test can observe the first warning. */
export function resetDeprecationWarnings(): void {
  warned.clear();
}
