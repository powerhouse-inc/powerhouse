import type { ChildProcess } from "child_process";
import { execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";

const CONSUMER_PROJECT_NAME = "test-consumer-project";
const CONSUMER_CONNECT_PORT = 5555;
export const CONSUMER_CONNECT_URL = `http://localhost:${CONSUMER_CONNECT_PORT}`;

/**
 * Returns the absolute path of the consumer project.
 * Lives as a sibling of vetra-e2e in test/test-consumer-project/.
 */
export function getConsumerProjectPath(): string {
  const testDir = path.dirname(process.cwd());
  return path.join(testDir, CONSUMER_PROJECT_NAME);
}

/**
 * Install dependencies for the consumer project.
 * Uses pnpm from the monorepo root to resolve workspace packages.
 */
export function installConsumerDeps(): void {
  const monorepoRoot = path.resolve(getConsumerProjectPath(), "../..");
  console.log("Installing consumer project dependencies...");
  execSync(`pnpm install --filter ${CONSUMER_PROJECT_NAME}`, {
    cwd: monorepoRoot,
    stdio: "pipe",
    timeout: 120_000,
  });
}

/**
 * Build Connect for the consumer project.
 */
export function buildConsumerConnect(): void {
  console.log("Building consumer Connect app...");
  execSync("pnpm exec ph-cli connect build", {
    cwd: getConsumerProjectPath(),
    stdio: "pipe",
    timeout: 180_000,
  });
}

/**
 * Start Connect preview server for the consumer project.
 */
export async function startConsumerPreview(): Promise<ChildProcess> {
  const child = spawn(
    "pnpm",
    [
      "exec",
      "ph-cli",
      "connect",
      "preview",
      "--port",
      String(CONSUMER_CONNECT_PORT),
    ],
    {
      cwd: getConsumerProjectPath(),
      stdio: "pipe",
      detached: false,
    },
  );

  child.stdout?.on("data", (data: Buffer) => {
    console.log(`[consumer-connect] ${data.toString().trim()}`);
  });
  child.stderr?.on("data", (data: Buffer) => {
    console.error(`[consumer-connect:err] ${data.toString().trim()}`);
  });

  // Wait for the preview server to be ready
  const maxWaitMs = 30_000;
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const res = await fetch(CONSUMER_CONNECT_URL);
      if (res.ok || res.status < 500) {
        console.log(
          "Consumer Connect preview ready on port",
          CONSUMER_CONNECT_PORT,
        );
        return child;
      }
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  child.kill();
  throw new Error(
    `Consumer Connect preview did not start within ${maxWaitMs}ms`,
  );
}

export function stopConsumerPreview(child: ChildProcess): void {
  if (child && !child.killed) {
    child.kill("SIGTERM");
  }
}

/**
 * Clean up build artifacts from the consumer project (not the project itself).
 */
export function cleanupConsumerBuildArtifacts(): void {
  const projectPath = getConsumerProjectPath();
  const dirsToClean = [".ph", "dist"];
  for (const dir of dirsToClean) {
    const dirPath = path.join(projectPath, dir);
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  }
}
