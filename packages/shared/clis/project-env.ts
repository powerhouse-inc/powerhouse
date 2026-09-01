import dotenv from "dotenv";
import { join } from "node:path";

let loadedFor: string | undefined;

/**
 * Load the project's `.env.local` and `.env` into `process.env`.
 *
 * `dotenv` never overwrites a variable that is already set, so loading
 * `.env.local` first and `.env` second produces the precedence the CLI
 * documents: a real `process.env` value beats `.env.local`, which beats
 * `.env`. One `process.env` lookup afterwards therefore covers all three
 * sources.
 *
 * Idempotent per directory — CLI argument defaults call it lazily and may
 * call it more than once per process.
 */
export function loadProjectEnv(cwd: string = process.cwd()): void {
  if (loadedFor === cwd) return;
  loadedFor = cwd;
  dotenv.config({ path: join(cwd, ".env.local"), quiet: true });
  dotenv.config({ path: join(cwd, ".env"), quiet: true });
}

/** Test seam: forget which directory has already been loaded. */
export function resetProjectEnvForTests(): void {
  loadedFor = undefined;
}

/**
 * Read an environment variable as a TCP port.
 *
 * Anything that is not a plain integer in 1-65535 is ignored rather than
 * throwing: a typo in `.env` should fall through to the next source in the
 * precedence chain, not break the CLI.
 */
export function readPortEnv(name: string): number | undefined {
  const raw = process.env[name]?.trim();
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  const port = Number(raw);
  if (port < 1 || port > 65535) return undefined;
  return port;
}
