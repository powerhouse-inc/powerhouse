import { execSync } from "node:child_process";
import net from "node:net";
import type { PreflightCheck, PreflightContext } from "./types.js";

/**
 * Check if a TCP port is free by attempting to bind to it.
 */
export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

/**
 * Check that the working directory satisfies a condition.
 *
 * @param test  A function that receives the cwd and returns true if valid.
 * @param message  Error message on failure.
 * @param hint  Optional guidance.
 */
export function checkWorkdir(
  test: (cwd: string) => boolean,
  message: string,
  hint?: string,
): PreflightCheck {
  return (ctx) => {
    if (test(ctx.cwd)) return { ok: true };
    return { ok: false, message: `${message} (cwd: ${ctx.cwd})`, hint };
  };
}

/**
 * Check that a command is available on PATH, optionally matching a version.
 *
 * @param binary  Binary name (e.g. 'ph', 'node', 'pnpm').
 * @param options  Optional version flag, version predicate, and hint.
 */
export function checkCommand(
  binary: string,
  options?: {
    versionFlag?: string;
    versionTest?: (version: string) => boolean;
    hint?: string;
  },
): PreflightCheck {
  return (ctx) => {
    try {
      const output = execSync(
        `${binary} ${options?.versionFlag ?? "--version"}`,
        {
          cwd: ctx.cwd,
          timeout: 5_000,
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env },
        },
      )
        .toString()
        .trim();

      if (options?.versionTest && !options.versionTest(output)) {
        return {
          ok: false,
          message: `${binary} version mismatch: ${output}`,
          hint: options.hint,
        };
      }
      return { ok: true };
    } catch {
      return {
        ok: false,
        message: `'${binary}' not found`,
        hint: options?.hint ?? `Install ${binary} or check your PATH`,
      };
    }
  };
}

/**
 * Check that a TCP port is available.
 *
 * @param port  Port number, or a function that extracts it from the preflight context.
 * @param label  Human-readable name for the port (e.g. 'Connect Studio').
 */
export function checkPort(
  port: number | ((ctx: PreflightContext) => number | undefined),
  label?: string,
): PreflightCheck {
  return async (ctx) => {
    const p = typeof port === "function" ? port(ctx) : port;
    if (p === undefined) return { ok: true };

    const free = await isPortFree(p);
    if (free) return { ok: true };

    const name = label ? `${label} port` : "Port";
    return {
      ok: false,
      message: `${name} ${p} is already in use`,
      hint: `Stop the process using port ${p}, or use a different port`,
    };
  };
}
