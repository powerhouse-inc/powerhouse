import type { ChildProcess } from "child_process";
import { execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";

const REGISTRY_PORT = 8080;
export const REGISTRY_URL =
  process.env.REGISTRY_URL || `http://localhost:${REGISTRY_PORT}`;

/**
 * Kill any process listening on the registry port.
 * Prevents "port already in use" from a leaked process.
 */
function killExistingRegistryProcess(): void {
  try {
    const result = execSync(`lsof -t -i :${REGISTRY_PORT}`, {
      stdio: "pipe",
    })
      .toString()
      .trim();
    if (result) {
      for (const pid of result.split("\n")) {
        try {
          process.kill(Number(pid), "SIGKILL");
        } catch {
          // Process may have already exited
        }
      }
      console.log(`Killed existing process(es) on port ${REGISTRY_PORT}`);
    }
  } catch {
    // No process on port — expected
  }
}

/**
 * Start the registry as a child process using the ph-registry CLI binary.
 * Returns the ChildProcess so it can be killed later.
 */
export async function startRegistry(
  storagePath: string,
  cdnCachePath: string,
): Promise<ChildProcess> {
  // Kill any leftover registry from a previous run
  killExistingRegistryProcess();

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
      detached: false,
    },
  );

  // Log registry output for debugging
  child.stdout?.on("data", (data: Buffer) => {
    console.log(`[registry] ${data.toString().trim()}`);
  });
  child.stderr?.on("data", (data: Buffer) => {
    console.error(`[registry:err] ${data.toString().trim()}`);
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
      // Use /-/ping which is a Verdaccio-specific endpoint
      const res = await fetch(`${REGISTRY_URL}/-/ping`);
      if (res.ok) {
        console.log("Registry is ready on port", REGISTRY_PORT);
        return child;
      }
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  child.kill();
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

export function stopRegistry(child: ChildProcess): void {
  if (child && !child.killed) {
    child.kill("SIGTERM");
  }
}

export async function verifyPublish(packageName: string): Promise<void> {
  // Query Verdaccio's npm API directly to check if the package exists
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
