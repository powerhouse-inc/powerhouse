import { execFileSync } from "node:child_process";
import { connect } from "node:net";

/** The monorepo root; pnpm --filter runs scripts from the package directory. */
export function repoRoot(): string {
  let root: string;
  try {
    root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
    }).trim();
  } catch (error) {
    throw new Error(
      `Could not find the repository root: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  return root;
}

export type GitResult = { status: number; stdout: string };

/** Non-zero exits come back as a status rather than a throw, because git grep exits 1 on no match. */
export function git(args: string[], cwd: string): GitResult {
  try {
    const stdout = execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
    return { status: 0, stdout };
  } catch (error) {
    const failure = error as { status?: number | null; stdout?: string };
    return {
      status: typeof failure.status === "number" ? failure.status : 1,
      stdout: typeof failure.stdout === "string" ? failure.stdout : "",
    };
  }
}

export function nonEmptyLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line !== "");
}

export function probePort(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const finish = (reachable: boolean) => {
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

export const POSTGRES_PORT = 5433;
export const POSTGRES_URL = `postgres://postgres:postgres@localhost:${String(POSTGRES_PORT)}/reactor`;
