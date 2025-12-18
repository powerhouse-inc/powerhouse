/**
 * Profiling helper for E2E tests
 * Uses Node.js Inspector API to start/stop CPU profiling programmatically
 * 
 * Enable profiling by setting ENABLE_PROFILING=true environment variable
 * Example: ENABLE_PROFILING=true pnpm test:e2e:todo
 */

import { Session } from "inspector";
import { promisify } from "util";

const ENABLE_PROFILING = process.env.ENABLE_PROFILING === "true";

let session: Session | null = null;
let isProfiling = false;
const profileOutputPath = "./profiles/todo-tests.cpuprofile";

/**
 * Initialize the Inspector session for profiling
 */
function initSession(): Session {
  if (!session) {
    session = new Session();
    session.connect();
  }
  return session;
}

/**
 * Start CPU profiling
 */
export async function startProfiling(): Promise<void> {
  if (!ENABLE_PROFILING) {
    return; // Profiling disabled
  }

  if (isProfiling) {
    console.warn("Profiling already started");
    return;
  }

  try {
    const inspectorSession = initSession();
    const post = promisify(inspectorSession.post.bind(inspectorSession)) as (
      method: string,
      params?: any,
    ) => Promise<any>;

    await post("Profiler.enable");
    await post("Profiler.start");

    isProfiling = true;
    console.log("✅ CPU profiling started");
  } catch (error) {
    console.error("Failed to start profiling:", error);
    throw error;
  }
}

/**
 * Stop CPU profiling and save to file
 */
export async function stopProfiling(): Promise<void> {
  if (!ENABLE_PROFILING) {
    return; // Profiling disabled
  }

  if (!isProfiling) {
    console.warn("Profiling not started");
    return;
  }

  try {
    const inspectorSession = initSession();
    const post = promisify(inspectorSession.post.bind(inspectorSession)) as (
      method: string,
      params?: any,
    ) => Promise<any>;

    const result = (await post("Profiler.stop")) as {
      profile: any;
    };
    await post("Profiler.disable");

    // Save profile to file
    const fs = await import("fs/promises");
    const path = await import("path");

    // Ensure profiles directory exists
    const profilesDir = path.dirname(profileOutputPath);
    await fs.mkdir(profilesDir, { recursive: true });

    // Write profile data
    await fs.writeFile(
      profileOutputPath,
      JSON.stringify(result.profile, null, 2),
    );

    isProfiling = false;
    console.log(`✅ CPU profiling stopped. Profile saved to: ${profileOutputPath}`);
  } catch (error) {
    console.error("Failed to stop profiling:", error);
    throw error;
  }
}

/**
 * Wrap a function with profiling start/stop
 */
export function withProfiling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  label?: string,
): T {
  return (async (...args: Parameters<T>) => {
    const profileLabel = label || fn.name || "anonymous";
    console.log(`🔍 Starting profiling for: ${profileLabel}`);

    await startProfiling();
    try {
      const result = await fn(...args);
      return result;
    } finally {
      await stopProfiling();
      console.log(`✅ Profiling completed for: ${profileLabel}`);
    }
  }) as T;
}

/**
 * Profile a specific async operation
 */
export async function profileOperation<T>(
  label: string,
  operation: () => Promise<T>,
): Promise<T> {
  console.log(`🔍 Starting profiling for: ${label}`);
  await startProfiling();
  try {
    const result = await operation();
    return result;
  } finally {
    await stopProfiling();
    console.log(`✅ Profiling completed for: ${label}`);
  }
}



