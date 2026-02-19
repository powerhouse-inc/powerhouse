import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REGISTRY_PORT = 9876;
const REGISTRY_URL = `http://localhost:${REGISTRY_PORT}`;
const PACKAGES_DIR = path.resolve(__dirname, "../dist/packages");

describe("registry e2e", () => {
  let registryProcess: ChildProcess | null = null;

  async function waitForServer(
    url: string,
    timeoutMs: number = 10000,
  ): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      try {
        const response = await fetch(url);
        if (response.ok) return;
      } catch {
        // Server not ready yet
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
  }

  async function killProcessOnPort(port: number): Promise<void> {
    return new Promise((resolve) => {
      const killer = spawn("lsof", ["-ti", `:${port}`]);
      let pids = "";
      killer.stdout.on("data", (data: Buffer) => {
        pids += data.toString();
      });
      killer.on("close", () => {
        const pidList = pids.trim().split("\n").filter(Boolean);
        for (const pid of pidList) {
          try {
            process.kill(parseInt(pid, 10), "SIGKILL");
          } catch {
            // Process may already be dead
          }
        }
        resolve();
      });
    });
  }

  beforeAll(async () => {
    // Kill any existing process on the port
    await killProcessOnPort(REGISTRY_PORT);

    // Start the registry server using compiled dist
    registryProcess = spawn(
      "node",
      ["dist/src/run.js", PACKAGES_DIR, String(REGISTRY_PORT)],
      {
        cwd: path.resolve(__dirname, ".."),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    registryProcess.stdout?.on("data", (data: Buffer) => {
      console.log(`[registry] ${data.toString().trim()}`);
    });

    registryProcess.stderr?.on("data", (data: Buffer) => {
      console.error(`[registry error] ${data.toString().trim()}`);
    });

    // Wait for server to be ready
    await waitForServer(`${REGISTRY_URL}/packages`);
  }, 30000);

  afterAll(async () => {
    if (registryProcess) {
      registryProcess.kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await killProcessOnPort(REGISTRY_PORT);
  });

  describe("GET /packages", () => {
    it("returns list of packages", async () => {
      const response = await fetch(`${REGISTRY_URL}/packages`);

      expect(response.ok).toBe(true);
      const packages = await response.json();
      expect(Array.isArray(packages)).toBe(true);
    });

    it("includes vetra package if built", async () => {
      const response = await fetch(`${REGISTRY_URL}/packages`);
      const packages = (await response.json()) as Array<{ name: string }>;

      const vetra = packages.find((p) => p.name === "@powerhousedao/vetra");
      // This test passes if vetra is found (after build) or if packages dir is empty
      if (packages.length > 0) {
        expect(vetra).toBeDefined();
      }
    });
  });

  describe("GET /packages/by-document-type", () => {
    it("returns 400 when type param is missing", async () => {
      const response = await fetch(`${REGISTRY_URL}/packages/by-document-type`);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Missing required query parameter: type");
    });

    it("returns empty array for unknown document type", async () => {
      const response = await fetch(
        `${REGISTRY_URL}/packages/by-document-type?type=unknown/type`,
      );

      expect(response.ok).toBe(true);
      const packageNames = await response.json();
      expect(packageNames).toEqual([]);
    });

    it("finds vetra package by document type if built", async () => {
      // First check if vetra exists
      const packagesResponse = await fetch(`${REGISTRY_URL}/packages`);
      const packages = (await packagesResponse.json()) as Array<{
        name: string;
      }>;
      const hasVetra = packages.some((p) => p.name === "@powerhousedao/vetra");

      if (!hasVetra) {
        console.log("Skipping: vetra package not built");
        return;
      }

      const response = await fetch(
        `${REGISTRY_URL}/packages/by-document-type?type=powerhouse/package`,
      );

      expect(response.ok).toBe(true);
      const packageNames = await response.json();
      expect(packageNames).toContain("@powerhousedao/vetra");
    });

    it("handles URL-encoded document types", async () => {
      const response = await fetch(
        `${REGISTRY_URL}/packages/by-document-type?type=${encodeURIComponent("powerhouse/package")}`,
      );

      expect(response.ok).toBe(true);
      const packageNames = await response.json();
      expect(Array.isArray(packageNames)).toBe(true);
    });
  });

  describe("static file serving", () => {
    it("serves package files if vetra is built", async () => {
      // First check if vetra exists
      const packagesResponse = await fetch(`${REGISTRY_URL}/packages`);
      const packages = (await packagesResponse.json()) as Array<{
        name: string;
      }>;
      const hasVetra = packages.some((p) => p.name === "@powerhousedao/vetra");

      if (!hasVetra) {
        console.log("Skipping: vetra package not built");
        return;
      }

      const response = await fetch(
        `${REGISTRY_URL}/@powerhousedao/vetra/powerhouse.manifest.json`,
      );

      expect(response.ok).toBe(true);
      const manifest = await response.json();
      expect(manifest.name).toBe("@powerhousedao/vetra");
    });
  });

  describe("CORS headers", () => {
    it("includes Access-Control-Allow-Origin header", async () => {
      const response = await fetch(`${REGISTRY_URL}/packages`);

      expect(response.headers.get("access-control-allow-origin")).toBe("*");
    });
  });
});
