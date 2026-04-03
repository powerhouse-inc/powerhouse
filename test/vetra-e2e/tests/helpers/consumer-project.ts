import type { ChildProcess } from "child_process";
import { execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";

const CONSUMER_PROJECT_NAME = "test-consumer-project";
const CONSUMER_CONNECT_PORT = 5555;
const CONSUMER_CONNECT_HOST = process.env.CONSUMER_CONNECT_HOST || "localhost";
export const CONSUMER_CONNECT_URL = `http://${CONSUMER_CONNECT_HOST}:${CONSUMER_CONNECT_PORT}`;

const isDocker = !!process.env.DOCKER_E2E;

/**
 * Returns the absolute path of the consumer project.
 * In Docker mode: /app/test-consumer-project (sibling of /app/test-project).
 * In monorepo mode: test/test-consumer-project/ (sibling of vetra-e2e).
 */
export function getConsumerProjectPath(): string {
  if (isDocker) {
    return "/app/test-consumer-project";
  }
  const testDir = path.dirname(process.cwd());
  return path.join(testDir, CONSUMER_PROJECT_NAME);
}

/**
 * Ensure the consumer project exists.
 * In Docker mode, scaffolds it via `ph init`.
 * In monorepo mode, expects the project to already exist.
 */
export function ensureConsumerProject(): void {
  const projectPath = getConsumerProjectPath();
  if (fs.existsSync(path.join(projectPath, "package.json"))) {
    return;
  }

  if (!isDocker) {
    throw new Error(
      `Consumer project not found at ${projectPath}. ` +
        `In monorepo mode, test/test-consumer-project/ must exist.`,
    );
  }

  console.log("Creating consumer project via ph init...");
  const parentDir = path.dirname(projectPath);
  execSync(`ph init ${CONSUMER_PROJECT_NAME} --dev --package-manager pnpm`, {
    cwd: parentDir,
    stdio: "pipe",
    timeout: 120_000,
  });

  // Configure the consumer project to use the local test registry
  const configPath = path.join(projectPath, "powerhouse.config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<
    string,
    unknown
  >;
  config.packageRegistryUrl =
    process.env.REGISTRY_URL || "http://localhost:8080";
  config.studio = { port: 5556 };
  config.reactor = { port: 5557, storage: "memory" };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/**
 * Install dependencies for the consumer project.
 * In monorepo mode, uses pnpm --filter from the monorepo root.
 * In Docker mode, runs pnpm install directly in the consumer project.
 */
export function installConsumerDeps(): void {
  console.log("Installing consumer project dependencies...");
  if (isDocker) {
    execSync("pnpm install", {
      cwd: getConsumerProjectPath(),
      stdio: "pipe",
      timeout: 120_000,
    });
  } else {
    const monorepoRoot = path.resolve(getConsumerProjectPath(), "../..");
    execSync(`pnpm install --filter ${CONSUMER_PROJECT_NAME}`, {
      cwd: monorepoRoot,
      stdio: "pipe",
      timeout: 120_000,
    });
  }
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
