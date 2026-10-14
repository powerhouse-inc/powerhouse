import { spawn } from "node:child_process";
import { killTree, supervisedSpawnOptions } from "./process-platform.js";
import type {
  ProcessHandle,
  ProcessManager,
  ProcessRunOptions,
} from "./types.js";

/**
 * Create a process manager for running bounded shell commands.
 * Inspired by the agent prototype's CLIExecutor.
 */
export function createProcessManager(): ProcessManager {
  const handles: ProcessHandle[] = [];

  async function run(
    command: string,
    opts?: ProcessRunOptions,
  ): Promise<{ success: boolean; output: string }> {
    const label = opts?.label ?? command;
    const timeout = opts?.timeout ?? 30_000;

    return new Promise((resolve) => {
      const chunks: string[] = [];
      let resolved = false;
      let lineBuffer = "";

      const child = spawn(command, {
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
        // POSIX: process group for clean tree kill; Windows: attached+hidden,
        // trees felled via taskkill (see process-platform.ts).
        ...supervisedSpawnOptions(),
        cwd: opts?.cwd,
        env: opts?.env ? { ...process.env, ...opts.env } : undefined,
      });

      function killProcess() {
        try {
          if (child.pid) killTree(child.pid, "SIGTERM");
        } catch {
          // Process may already be dead
        }
      }

      const handle: ProcessHandle = {
        label,
        status: "running",
        kill() {
          if (handle.status === "running") {
            killProcess();
          }
        },
      };
      handles.push(handle);

      function handleData(data: Buffer) {
        const text = data.toString();
        chunks.push(text);
        if (opts?.onOutput) {
          lineBuffer += text;
          let nlIdx: number;
          while ((nlIdx = lineBuffer.indexOf("\n")) !== -1) {
            opts.onOutput(lineBuffer.slice(0, nlIdx));
            lineBuffer = lineBuffer.slice(nlIdx + 1);
          }
        }
      }

      child.stdout?.on("data", handleData);
      child.stderr?.on("data", handleData);

      // Prevent the child from keeping the parent alive if we've already resolved
      child.unref();

      function finish(success: boolean, output: string) {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        // Flush any remaining partial line
        if (opts?.onOutput && lineBuffer.length > 0) {
          opts.onOutput(lineBuffer);
          lineBuffer = "";
        }
        handle.status = success ? "succeeded" : "failed";
        resolve({ success, output });
      }

      const timer = setTimeout(() => {
        killProcess();
        finish(false, chunks.join(""));
      }, timeout);

      child.on("close", (code) => {
        finish(code === 0, chunks.join(""));
      });

      /* istanbul ignore next -- with shell: true, failures come via exit code, not error event */
      child.on("error", (err) => {
        finish(false, err.message);
      });
    });
  }

  function list(): ProcessHandle[] {
    return [...handles];
  }

  return { run, list };
}
