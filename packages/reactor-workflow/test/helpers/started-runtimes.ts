// Kept free of imports: the setup file loads it ahead of every suite, and
// anything it pulled in would be loaded before that suite's vi.mock calls.
interface StartedRuntime {
  seedFailure(): Promise<unknown>;
  shutdown(): void;
}

const started = new Set<StartedRuntime>();

export function trackRuntime(runtime: StartedRuntime): void {
  started.add(runtime);
}

// Seeding logs when it lands; one still in flight when the file ends logs into
// a worker vitest has closed: "Closing rpc while onUserConsoleLog was pending".
export async function stopRuntimes(): Promise<void> {
  const runtimes = [...started];
  started.clear();
  await Promise.all(runtimes.map((runtime) => runtime.seedFailure()));
  for (const runtime of runtimes) runtime.shutdown();
}
