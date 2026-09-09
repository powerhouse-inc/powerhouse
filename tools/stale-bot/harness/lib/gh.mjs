/**
 * The only place this harness shells out to `gh`.
 *
 * Everything GitHub-shaped goes through here so that tests can replace one
 * function instead of stubbing a binary: `run` is injectable, and the fake in
 * `test/` never touches the network.
 *
 * Errors arrive from `execFileSync` with the useful part on `stderr` and a
 * generic "Command failed" as the message, so `GhError` carries the command
 * and whichever of the two actually says something.
 */

import { execFileSync } from "node:child_process";

export class GhError extends Error {}

const realRun = (args, { timeoutMs = 120_000 } = {}) =>
  execFileSync("gh", args, {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024, // CI logs are large; truncation would hide the failure
  });

/**
 * @param {string[]} args         argv for `gh`, already split
 * @param {object} [opts]
 * @param {(args: string[], o: object) => string} [opts.run]
 * @param {number} [opts.timeoutMs]
 * @returns {string} stdout
 */
export function gh(args, { run = realRun, timeoutMs } = {}) {
  try {
    return run(args, { timeoutMs });
  } catch (err) {
    const detail = String(err?.stderr || err?.message || "")
      .trim()
      .slice(0, 400);
    throw new GhError(`gh ${args.join(" ")} failed: ${detail}`);
  }
}

/**
 * As `gh`, but parses the response.
 *
 * `gh` prints nothing at all when a list matches nothing, which is not valid
 * JSON but is also not an error — it is an empty result, and callers should
 * not have to special-case it.
 */
export function ghJson(args, opts = {}) {
  const out = gh(args, opts);
  const text = String(out).trim();
  if (!text) return [];
  try {
    return JSON.parse(text);
  } catch {
    throw new GhError(
      `gh ${args.join(" ")} did not return JSON: ${text.slice(0, 200)}`,
    );
  }
}
