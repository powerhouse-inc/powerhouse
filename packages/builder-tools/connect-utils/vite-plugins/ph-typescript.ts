// plugins/vite-plugin-tsc-build-watch.ts
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import type { Plugin, ViteDevServer } from "vite";

type Options = {
  /** Extra args to pass to tsc (besides -b / -w). */
  args?: string[];
  /** Fail Vite startup when initial tsc fails. Default: true. */
  hardFail?: boolean;
  /** Use local workspace TS if available. Default: true. */
  useWorkspaceTS?: boolean;
};

function resolveTscBin(useWorkspaceTS = true) {
  if (useWorkspaceTS) {
    try {
      const tscBin = require.resolve("typescript/bin/tsc", {
        paths: [process.cwd()],
      });
      return { cmd: process.execPath, baseArgs: [tscBin] }; // node <tscBin>
    } catch {
      /* fall through */
    }
  }
  const cmd = process.platform === "win32" ? "tsc.cmd" : "tsc";
  return { cmd, baseArgs: [] as string[] };
}

function runOnce(cmd: string, args: string[], label = "tsc"): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "pipe" });
    child.stdout.on("data", (d) => process.stdout.write(`[${label}] ${d}`));
    child.stderr.on("data", (d) => process.stderr.write(`[${label}] ${d}`));
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${label} exited with code ${code}`)),
    );
  });
}

function watch(cmd: string, args: string[], label = "tsc"): ChildProcess {
  const child = spawn(cmd, args, { stdio: "pipe" });
  // child.stdout.on("data", (d) => process.stdout.write(`[${label}] ${d}`));
  child.stderr.on("data", (d) => process.stderr.write(`[${label}] ${d}`));
  return child;
}

/**
 * Vite plugin that runs tsc -b on startup and tsc -w on watch mode.
 *
 * @param project Path to the project (folder with tsconfig.json or the file itself).
 * @param options Options.
 * @returns Vite plugin.
 */
export function phTypescriptPlugin(
  project: string,
  options: Options = {},
): Plugin {
  const { args = [], hardFail = true, useWorkspaceTS = true } = options;

  const { cmd, baseArgs } = resolveTscBin(useWorkspaceTS);

  const buildArgs = [...baseArgs, "-b", project];
  const watchArgs = [...buildArgs, ...args, "-w", "--preserveWatchOutput"];
  const onceArgs = [...buildArgs, ...args];

  let viteCommand: "serve" | "build" | undefined;
  let watcher: ChildProcess | undefined;

  const stopWatcher = () => {
    if (watcher && !watcher.killed) {
      try {
        watcher.kill("SIGINT");
      } catch {
        /* empty */
      }
    }
    watcher = undefined;
  };

  const hookShutdown = (server?: ViteDevServer) => {
    const close = () => stopWatcher();
    server?.httpServer?.once("close", close);
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
  };

  return {
    name: "vite-plugin-tsc-build-watch",
    enforce: "pre",
    configResolved({ command }) {
      viteCommand = command;
    },
    // Dev: block startup on tsc -b, then start -w
    async configureServer(server) {
      try {
        await runOnce(cmd, onceArgs, "tsc");
      } catch (err) {
        if (hardFail) throw err;
        console.error(err);
      }

      watcher = watch(cmd, watchArgs, "tsc");

      hookShutdown(server);
    },
    // Build: run a single tsc -b before bundling
    async buildStart() {
      if (viteCommand === "build") {
        try {
          await runOnce(cmd, onceArgs, "tsc");
        } catch (err) {
          if (hardFail) throw err;
          console.error(err);
        }
      }
    },
    closeBundle() {
      stopWatcher();
    },
  };
}
