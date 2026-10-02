/**
 * How to spawn pnpm on this platform, as `[file, leadingArgs]`.
 *
 * `pnpm` is a shell-resolved name, so spawning it without a shell fails
 * ENOENT on Windows, and `pnpm.cmd` fails EINVAL since Node's fix for
 * CVE-2024-27980. pnpm exports `npm_execpath` pointing at its own entry point
 * for every script it runs, and these tools only ever run as pnpm scripts
 * (`pnpm bench:fix`, `pnpm bench:record`), so that is the name to spawn: a
 * native entry directly, a JS one (corepack ships `pnpm.cjs`) through node.
 *
 * Falls back to the bare name when `npm_execpath` is unset, which keeps
 * running these files directly under tsx working on POSIX. That fallback is
 * still ENOENT on Windows; there is nothing to resolve there, and pnpm always
 * sets the variable on the path that matters.
 *
 * Callers pass the display form through unchanged -- a report should show
 * `pnpm typecheck`, not an absolute path into a pnpm store.
 */
export function pnpmCommand(
  execPath: string | undefined = process.env.npm_execpath,
  nodePath: string = process.execPath,
): [string, string[]] {
  if (execPath === undefined || execPath === "") {
    return ["pnpm", []];
  }
  if (/\.[cm]?js$/i.test(execPath)) {
    return [nodePath, [execPath]];
  }
  return [execPath, []];
}
