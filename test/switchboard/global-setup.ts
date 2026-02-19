import { spawn, execSync, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";

const MONOREPO_ROOT = resolve(import.meta.dirname, "../..");
const VETRA_DIR = resolve(MONOREPO_ROOT, "packages/vetra");
const REGISTRY_DIR = resolve(MONOREPO_ROOT, "packages/registry");
const TEST_DIR = import.meta.dirname;

const REGISTRY_PORT = 8080;
const SWITCHBOARD_PORT = 4001;
const REGISTRY_URL = `http://localhost:${REGISTRY_PORT}`;
const GRAPHQL_URL = `http://localhost:${SWITCHBOARD_PORT}/graphql`;

const SERVER_STARTUP_TIMEOUT = 30000;

let registryProcess: ChildProcess | null = null;
let switchboardProcess: ChildProcess | null = null;

async function waitForServer(
  url: string,
  timeout: number,
  method: "GET" | "POST" = "GET",
): Promise<void> {
  const start = Date.now();
  let lastError = "";
  let lastStatus = 0;
  while (Date.now() - start < timeout) {
    try {
      const options: RequestInit =
        method === "POST"
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query: "{ __typename }" }),
            }
          : {};
      const response = await fetch(url, options);
      lastStatus = response.status;
      if (response.ok) {
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (e) {
      lastError = (e as Error).message;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(
    `Server at ${url} did not start within ${timeout}ms. Last error: ${lastError}, Last status: ${lastStatus}`,
  );
}

function killProcess(proc: ChildProcess | null): Promise<void> {
  return new Promise((resolve) => {
    if (!proc || proc.killed) {
      resolve();
      return;
    }
    proc.on("exit", () => resolve());
    proc.kill("SIGTERM");
    // Force kill after 3 seconds
    setTimeout(() => {
      if (!proc.killed) {
        proc.kill("SIGKILL");
      }
      resolve();
    }, 3000);
  });
}

async function killProcessOnPort(port: number): Promise<void> {
  const { execSync } = await import("node:child_process");
  try {
    // Find and kill any process using the port
    const result = execSync(`lsof -ti :${port}`, { encoding: "utf-8" }).trim();
    if (result) {
      console.log(`Killing stale process on port ${port}: ${result}`);
      execSync(`kill -9 ${result}`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } catch {
    // No process on port - that's fine
  }
}

export default async function globalSetup() {
  console.log("🚀 Starting HTTP Registry E2E setup...");

  // Clean up any stale processes from previous runs
  await killProcessOnPort(REGISTRY_PORT);
  await killProcessOnPort(SWITCHBOARD_PORT);

  // Step 1: Build vetra package
  console.log("📦 Building vetra package...");
  execSync("bun run build.ts", {
    cwd: VETRA_DIR,
    stdio: "inherit",
  });
  console.log("✅ Vetra build complete.");

  // Step 2: Start registry server (serve from dist/packages)
  console.log("🌐 Starting registry server...");
  const packagesDir = resolve(REGISTRY_DIR, "dist/packages");
  registryProcess = spawn("node", ["dist/src/run.js", packagesDir], {
    cwd: REGISTRY_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });

  registryProcess.stdout?.on("data", (data) => {
    console.log(`[registry] ${data.toString().trim()}`);
  });
  registryProcess.stderr?.on("data", (data) => {
    console.error(`[registry] ${data.toString().trim()}`);
  });

  // Wait for registry to be ready
  await waitForServer(
    `${REGISTRY_URL}/@powerhousedao/vetra/document-models.js`,
    SERVER_STARTUP_TIMEOUT,
  );
  console.log("✅ Registry server ready.");

  // Step 3: Start switchboard with registry env vars
  console.log("⚡ Starting switchboard...");
  // Remove VITEST env var so WebSocket server loads properly
  const { VITEST, ...envWithoutVitest } = process.env;
  switchboardProcess = spawn("pnpm", ["reactor"], {
    cwd: TEST_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...envWithoutVitest,
      NODE_ENV: "production",
      PH_REGISTRY_URL: REGISTRY_URL,
      PH_REGISTRY_PACKAGES: "@powerhousedao/vetra",
    },
  });

  switchboardProcess.stdout?.on("data", (data) => {
    console.log(`[switchboard] ${data.toString().trim()}`);
  });
  switchboardProcess.stderr?.on("data", (data) => {
    console.error(`[switchboard] ${data.toString().trim()}`);
  });

  // Wait for switchboard GraphQL to be ready
  await waitForServer(GRAPHQL_URL, SERVER_STARTUP_TIMEOUT, "POST");
  console.log("✅ Switchboard ready.");
  console.log("🎯 Global setup completed successfully!");

  // Return teardown function
  return async () => {
    console.log("🧹 Running global teardown...");
    await Promise.all([
      killProcess(switchboardProcess),
      killProcess(registryProcess),
    ]);
    console.log("🎯 Global teardown completed!");
  };
}
