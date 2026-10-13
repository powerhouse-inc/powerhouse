import { resolve } from "node:path";

/**
 * Options for resolving the working directory.
 */
export interface ResolveWorkdirOptions {
  /** Implementation-level override (highest priority). */
  implementationOverride?: string;
  /** Value from --workdir CLI flag. */
  cliFlag?: string;
  /** Fallback directory (defaults to process.cwd()). */
  fallback?: string;
}

/**
 * Resolve the working directory through a 3-level precedence:
 * 1. Fallback: cwd (always available)
 * 2. CLI flag: --workdir value (user override)
 * 3. Implementation override (project code sets it)
 *
 * Higher numbers override lower. Returns an absolute path.
 */
export function resolveWorkdir(opts: ResolveWorkdirOptions = {}): string {
  const base = opts.fallback ?? process.cwd();
  const raw = opts.implementationOverride ?? opts.cliFlag ?? base;
  return resolve(base, raw);
}
