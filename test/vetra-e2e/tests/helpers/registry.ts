import type { ChildProcess } from "child_process";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const REGISTRY_PORT = 8080;
export const REGISTRY_URL =
  process.env.REGISTRY_URL || `http://localhost:${REGISTRY_PORT}`;

export interface RegistryHandle {
  process: ChildProcess;
  shutdown: () => Promise<void>;
}

/**
 * Start the registry as a child process using the ph-registry CLI binary.
 * Returns a handle with a shutdown() method for clean teardown.
 */
export async function startRegistry(
  storagePath: string,
  cdnCachePath: string,
): Promise<RegistryHandle> {
  // Clean up and recreate directories to ensure fresh state
  fs.rmSync(storagePath, { recursive: true, force: true });
  fs.rmSync(cdnCachePath, { recursive: true, force: true });
  fs.mkdirSync(storagePath, { recursive: true });
  fs.mkdirSync(cdnCachePath, { recursive: true });

  const child = spawn(
    "pnpm",
    [
      "exec",
      "ph-registry",
      "--port",
      String(REGISTRY_PORT),
      "--storage-dir",
      storagePath,
      "--cdn-cache-dir",
      cdnCachePath,
    ],
    {
      stdio: "pipe",
      detached: true,
    },
  );

  // Log registry output for debugging
  child.stdout?.on("data", (data: Buffer) => {
    console.log(`[registry] ${data.toString().trim()}`);
  });
  child.stderr?.on("data", (data: Buffer) => {
    console.error(`[registry:err] ${data.toString().trim()}`);
  });

  // Unref so the child doesn't keep the parent process alive
  child.unref();

  const shutdown = (): Promise<void> =>
    new Promise<void>((resolve) => {
      if (child.killed || child.exitCode !== null) {
        resolve();
        return;
      }
      child.on("exit", () => resolve());
      // Kill the entire process group (pnpm + node child)
      if (child.pid) {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {
          child.kill("SIGTERM");
        }
      } else {
        child.kill("SIGTERM");
      }
    });

  // Wait for the registry to be ready by polling a registry-specific endpoint
  const maxWaitMs = 30_000;
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    // Check if the child process has exited (e.g. port conflict)
    if (child.exitCode !== null) {
      throw new Error(
        `Registry process exited with code ${child.exitCode}. ` +
          `Port ${REGISTRY_PORT} may already be in use.`,
      );
    }
    try {
      const res = await fetch(`${REGISTRY_URL}/-/ping`);
      if (res.ok) {
        console.log("Registry is ready on port", REGISTRY_PORT);
        return { process: child, shutdown };
      }
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  await shutdown();
  throw new Error(`Registry did not start within ${maxWaitMs}ms`);
}

export async function createTestUser(): Promise<string> {
  const res = await fetch(`${REGISTRY_URL}/-/user/org.couchdb.user:testuser`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "testuser", password: "testpassword" }),
  });
  const body = (await res.json()) as { token?: string };
  if (!body.token) {
    throw new Error(`Failed to create test user: ${JSON.stringify(body)}`);
  }
  return body.token;
}

export function writeNpmrc(testDir: string, token: string): void {
  const registryHostPort = new URL(REGISTRY_URL).host;
  const lines = [
    `registry=${REGISTRY_URL}`,
    `//${registryHostPort}/:_authToken=${token}`,
  ];
  // In Docker, ph-cli publish uses the socat IPv4 bridge on port 18080;
  // add auth for that host too so npm authentication works
  if (process.env.DOCKER_E2E) {
    lines.push(`//localhost:18080/:_authToken=${token}`);
  }
  lines.push("");
  fs.writeFileSync(path.join(testDir, ".npmrc"), lines.join("\n"), "utf8");
}

export async function stopRegistry(handle: RegistryHandle): Promise<void> {
  await handle.shutdown();
}

export async function verifyPublish(packageName: string): Promise<void> {
  const res = await fetch(
    `${REGISTRY_URL}/${encodeURIComponent(packageName)}`,
    {
      headers: { Accept: "application/json" },
    },
  );
  if (!res.ok) {
    throw new Error(
      `Package "${packageName}" not found in registry (status: ${res.status})`,
    );
  }
  const metadata = (await res.json()) as { name?: string };
  if (metadata.name !== packageName) {
    throw new Error(
      `Package name mismatch: expected "${packageName}", got "${metadata.name}"`,
    );
  }
}
