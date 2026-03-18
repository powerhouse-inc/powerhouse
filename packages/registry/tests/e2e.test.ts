import { access, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DEFAULT_PORT,
  DEFAULT_REGISTRY_CDN_CACHE_DIR_NAME,
  DEFAULT_STORAGE_DIR_NAME,
} from "../src/constants.js";
import { runRegistry } from "../src/run.js";
import type { PowerhouseManifest } from "../src/types.js";

const REGISTRY_URL = `http://localhost:${DEFAULT_PORT}`;

describe("registry e2e", () => {
  let server: Awaited<ReturnType<typeof runRegistry>>;

  async function runServer() {
    const server = await runRegistry({
      port: 8080,
      storageDir: DEFAULT_STORAGE_DIR_NAME,
      cdnCacheDir: DEFAULT_REGISTRY_CDN_CACHE_DIR_NAME,
      uplink: undefined,
      s3Bucket: undefined,
      s3Endpoint: undefined,
      s3Region: undefined,
      s3AccessKeyId: undefined,
      s3SecretAccessKey: undefined,
      s3KeyPrefix: undefined,
      s3ForcePathStyle: true,
      webEnabled: false,
    });
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    return server;
  }

  const testDir = import.meta.dirname;
  let hasVetraFixture = false;

  beforeAll(async () => {
    await rm(path.join(testDir, "./.test-output"), {
      recursive: true,
      force: true,
    });
    await mkdir(path.join(testDir, "./.test-output/storage"), {
      recursive: true,
    });
    await mkdir(path.join(testDir, "./.test-output/cdn-cache"), {
      recursive: true,
    });

    // Copy test fixture data if available
    const cdnCacheSrc = path.join(testDir, "./data/cdn-cache/");
    try {
      await access(cdnCacheSrc);
      await cp(cdnCacheSrc, path.join(testDir, "./.test-output/cdn-cache"), {
        recursive: true,
        force: true,
      });
      hasVetraFixture = true;
    } catch {
      // No fixture data available — vetra-dependent tests will be skipped
    }

    process.chdir(path.join(testDir, "./.test-output"));
    server = await runServer();
  }, 30000);

  afterAll(() => {
    server.close();
  });

  describe("GET /packages", () => {
    it("returns list of packages", async () => {
      const response = await fetch(`${REGISTRY_URL}/packages`);

      expect(response.ok).toBe(true);
      const packages = (await response.json()) as Array<{ name: string }>;
      expect(Array.isArray(packages)).toBe(true);
    });

    it.skipIf(!hasVetraFixture)("includes vetra package", async () => {
      const response = await fetch(`${REGISTRY_URL}/packages`);
      const packages = (await response.json()) as Array<{ name: string }>;

      const vetra = packages.find((p) => p.name === "@powerhousedao/vetra");
      expect(vetra).toBeDefined();
    });
  });

  describe("GET /packages/by-document-type", () => {
    it("returns 400 when type param is missing", async () => {
      const response = await fetch(`${REGISTRY_URL}/packages/by-document-type`);

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: Error };
      expect(body.error).toBe("Missing required query parameter: type");
    });

    it("returns empty array for unknown document type", async () => {
      const response = await fetch(
        `${REGISTRY_URL}/packages/by-document-type?type=unknown/type`,
      );

      expect(response.ok).toBe(true);
      const packageNames = (await response.json()) as never[];
      expect(packageNames).toEqual([]);
    });

    it.skipIf(!hasVetraFixture)(
      "finds vetra package by document type",
      async () => {
        const response = await fetch(
          `${REGISTRY_URL}/packages/by-document-type?type=powerhouse/package`,
        );

        expect(response.ok).toBe(true);
        const packageNames = (await response.json()) as string[];
        expect(packageNames).toContain("@powerhousedao/vetra");
      },
    );

    it("handles URL-encoded document types", async () => {
      const response = await fetch(
        `${REGISTRY_URL}/packages/by-document-type?type=${encodeURIComponent("powerhouse/package")}`,
      );

      expect(response.ok).toBe(true);
      const packageNames = (await response.json()) as string[];
      expect(Array.isArray(packageNames)).toBe(true);
    });
  });

  describe("static file serving", () => {
    it.skipIf(!hasVetraFixture)(
      "serves package files if vetra is built",
      async () => {
        const response = await fetch(
          `${REGISTRY_URL}/-/cdn/@powerhousedao/vetra/powerhouse.manifest.json`,
        );

        expect(response.ok).toBe(true);
        const manifest = (await response.json()) as PowerhouseManifest;
        expect(manifest.name).toBe("@powerhousedao/vetra");
      },
    );
  });

  describe("CORS headers", () => {
    it("includes Access-Control-Allow-Origin header", async () => {
      const response = await fetch(`${REGISTRY_URL}/packages`);

      expect(response.headers.get("access-control-allow-origin")).toBe("*");
    });
  });
});
