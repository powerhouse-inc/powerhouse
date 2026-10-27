import {
  clearVetraRuntime,
  isPortInUse,
  probeVetraRuntime,
  type VetraRuntimeRecord,
} from "./vetra-runtime.js";

export class VetraStopError extends Error {}

const STOP_TIMEOUT_MS = 15_000;

function isPidAlive(pid: number | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function foreignError(record: VetraRuntimeRecord): VetraStopError {
  return new VetraStopError(
    `.ph/vetra-runtime.json describes a live Vetra for "${record.projectName}" (pid ${record.pid}), not this project. ` +
      `Refusing to stop it. Delete .ph/vetra-runtime.json if that record is wrong.`,
  );
}

async function waitForExit(
  record: VetraRuntimeRecord,
  deadline: number,
): Promise<boolean> {
  while (Date.now() < deadline) {
    const gone =
      !isPidAlive(record.pid) && !(await isPortInUse(record.switchboardPort));
    if (gone) return true;
    await sleep(100);
  }
  return false;
}

/** Stops this project's running Vetra, if any; resolves to the record it stopped. */
export async function stopVetra(options: {
  projectDir: string;
  projectName: string;
  timeoutMs?: number;
}): Promise<VetraRuntimeRecord | undefined> {
  const { projectDir, projectName, timeoutMs = STOP_TIMEOUT_MS } = options;
  const probe = await probeVetraRuntime(projectDir, projectName);
  if (probe.status === "foreign") throw foreignError(probe.record);
  if (probe.status !== "live" && probe.status !== "starting") return undefined;
  const { record } = probe;
  const signal = (name: NodeJS.Signals) => {
    try {
      process.kill(record.pid, name);
    } catch {
      // Already gone.
    }
  };
  signal("SIGTERM");
  if (!(await waitForExit(record, Date.now() + timeoutMs))) {
    signal("SIGKILL");
    if (!(await waitForExit(record, Date.now() + timeoutMs))) {
      throw new VetraStopError(
        `Vetra (pid ${record.pid}) did not stop within ${Math.round((2 * timeoutMs) / 1000)}s.`,
      );
    }
  }
  clearVetraRuntime(projectDir, record.pid);
  return record;
}
