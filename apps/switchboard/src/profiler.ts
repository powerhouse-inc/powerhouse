import type { PyroscopeConfig } from "@pyroscope/nodejs";

export async function initProfilerFromEnv(env: typeof process.env) {
  const {
    PYROSCOPE_SERVER_ADDRESS: serverAddress,
    PYROSCOPE_APPLICATION_NAME: appName,
    PYROSCOPE_USER: basicAuthUser,
    PYROSCOPE_PASSWORD: basicAuthPassword,
    PYROSCOPE_WALL_ENABLED: wallEnabled,
    PYROSCOPE_HEAP_ENABLED: heapEnabled,
  } = env;

  const options: PyroscopeConfig = {
    serverAddress,
    appName,
    basicAuthUser,
    basicAuthPassword,
    // Wall profiling captures wall-clock time (includes async I/O waits)
    // This shows GraphQL resolvers even when waiting for database
    wall: {
      samplingDurationMs: 10000, // 10 second sampling windows
      samplingIntervalMicros: 10000, // 10ms sampling interval (100 samples/sec)
      collectCpuTime: true, // Also collect CPU time alongside wall time
    },
    // Heap profiling for memory allocation tracking
    heap: {
      samplingIntervalBytes: 512 * 1024, // Sample every 512KB allocated
      stackDepth: 64, // Capture deeper stacks for better context
    },
  };
  return initProfiler(options, {
    wallEnabled: wallEnabled !== "false",
    heapEnabled: heapEnabled === "true",
  });
}

interface ProfilerFlags {
  wallEnabled?: boolean;
  heapEnabled?: boolean;
}

export async function initProfiler(
  options?: PyroscopeConfig,
  flags: ProfilerFlags = { wallEnabled: true, heapEnabled: false },
) {
  console.log("Initializing Pyroscope profiler at:", options?.serverAddress);
  console.log("  Wall profiling:", flags.wallEnabled ? "enabled" : "disabled");
  console.log("  Heap profiling:", flags.heapEnabled ? "enabled" : "disabled");

  const { default: Pyroscope } = await import("@pyroscope/nodejs");
  Pyroscope.init(options);

  // Start wall profiling (captures async I/O time - shows resolvers)
  if (flags.wallEnabled) {
    Pyroscope.startWallProfiling();
  }

  // Start CPU profiling (captures CPU-bound work)
  Pyroscope.startCpuProfiling();

  // Optionally start heap profiling (memory allocations)
  if (flags.heapEnabled) {
    Pyroscope.startHeapProfiling();
  }
}
