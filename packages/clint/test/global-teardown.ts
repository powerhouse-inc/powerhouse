import { execSync } from "node:child_process";

/**
 * NOTE(port): service tests spawn long-lived fixture children
 * (test-service.js). Supervised children end with the worker that started
 * them, but a worker killed outright (a timeout's hard kill, a crash) runs no
 * exit code, and tests also spawn unsupervised strangers on purpose — on one
 * Windows session 56 leftovers had accumulated. Sweep anything running our
 * fixtures when the suite ends.
 */
export function setup(): void {
  // nothing on startup
}

export function teardown(): void {
  try {
    if (process.platform === "win32") {
      execSync(
        `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='node.exe'\\" | Where-Object { $_.CommandLine -match 'clint.test.fixtures' } | ForEach-Object { taskkill /PID $_.ProcessId /T /F 2>$null }"`,
        { stdio: "ignore", windowsHide: true },
      );
    } else {
      execSync(`pkill -f 'clint/test/fixtures' || true`, { stdio: "ignore" });
    }
  } catch {
    // nothing to sweep
  }
}
