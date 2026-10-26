import { randomBytes } from "node:crypto";
import path from "node:path";
import type { MonitorController } from "./controller.ts";

/** Project roots the controller may start hosts from, `path.delimiter`-joined. */
export const PROJECT_ROOTS_ENV = "PH_MONITOR_PROJECT_ROOTS";

const SHUTDOWN_TIMEOUT_MS = 15_000;
/** Under the shutdown bound, so a stuck host is SIGKILLed before exit. */
export const STOP_TIMEOUT_MS = 10_000;

export function projectRootsFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string[] {
  return (env[PROJECT_ROOTS_ENV] ?? "")
    .split(path.delimiter)
    .map((root) => root.trim())
    .filter(Boolean)
    .map((root) => path.resolve(root));
}

export function newToken(): string {
  return randomBytes(32).toString("hex");
}

export function isLoopbackListen(host: string | boolean | undefined): boolean {
  return (
    host === undefined ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1"
  );
}

/** Bounded dispose; spawnHost's exit hook SIGTERMs whatever is left. */
export async function shutdown(
  controller: MonitorController,
  timeoutMs = SHUTDOWN_TIMEOUT_MS,
): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      controller.dispose(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } catch (error) {
    console.error("[ph-monitor] shutdown:", error);
  } finally {
    clearTimeout(timer);
  }
}
