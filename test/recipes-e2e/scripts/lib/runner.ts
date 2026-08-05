import { spawn } from "node:child_process";

export type Status = "pass" | "fail" | "timeout" | "skip";

export interface RunResult {
  status: Status;
  code: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  output: string;
}

export interface RunOptions {
  cwd: string;
  timeoutMs: number;
  /** Stream child output to this process's stdio as it arrives. */
  verbose: boolean;
  env?: NodeJS.ProcessEnv;
}

/**
 * Run a command to completion, or kill it once timeoutMs elapses.
 *
 * `detached` puts the child in its own process group so the timeout can take
 * down the whole tree. Without it, killing `pnpm` orphans the `tsx`/`node`
 * grandchild that actually holds the port or the PGlite handle, and the next
 * recipe in the sequence fails with EADDRINUSE for no visible reason.
 */
export function run(
  cmd: string,
  args: string[],
  options: RunOptions,
): Promise<RunResult> {
  const { cwd, timeoutMs, verbose, env } = options;
  const startedAt = Date.now();

  return new Promise<RunResult>((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
      env: env ?? process.env,
    });

    const chunks: string[] = [];
    const collect = (data: Buffer) => {
      const text = data.toString();
      chunks.push(text);
      if (verbose) process.stdout.write(text);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);

    let timedOut = false;
    let settled = false;

    const killTree = (signal: NodeJS.Signals) => {
      if (child.pid === undefined) return;
      try {
        process.kill(-child.pid, signal);
      } catch {
        // Group already gone.
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killTree("SIGTERM");
      // Escalate if the tree ignores SIGTERM (vitest workers sometimes do).
      setTimeout(() => killTree("SIGKILL"), 5_000).unref();
    }, timeoutMs);

    const settle = (
      code: number | null,
      signal: NodeJS.Signals | null,
    ): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        status: timedOut ? "timeout" : code === 0 ? "pass" : "fail",
        code,
        signal,
        durationMs: Date.now() - startedAt,
        output: chunks.join(""),
      });
    };

    child.on("error", (err) => {
      chunks.push(`\n[spawn error] ${err.message}\n`);
      settle(null, null);
    });
    child.on("close", settle);
  });
}
