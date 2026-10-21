import spawn from "cross-spawn";

// A command that exited non-zero, keeping what it printed to stdout.
export class SpawnError extends Error {
  constructor(
    message: string,
    readonly stdout: string,
  ) {
    super(message);
    this.name = "SpawnError";
  }
}

export function spawnAsync(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    // cross-spawn rather than node:child_process.spawn. On Windows npm, pnpm
    // and yarn are all `.cmd` shims, and since the fix for CVE-2024-27980
    // (Node 18.20.2 / 20.12.2 / 21.7.3 and later) `spawn` refuses to execute
    // `.bat`/`.cmd` unless `shell: true` -- it throws `spawn EINVAL`, and
    // synchronously, so an `error` listener never sees it. Passing
    // `shell: true` instead would hand the arguments to cmd.exe, which strips
    // quotes and splits on shell metacharacters. cross-spawn resolves the shim
    // and escapes the arguments itself, so the call keeps shell-less argument
    // semantics on every platform.
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (d: string) => {
      stdout += d;
    });

    child.stderr?.on("data", (d: string) => {
      stderr += d;
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(
          new SpawnError(
            stderr.trim() ||
              stdout.trim() ||
              `${command} exited with code ${code}`,
            stdout.trim(),
          ),
        );
      }
    });
  });
}
