import type { Manifest } from "@powerhousedao/shared";
import { execSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { access, cp, mkdir, rm } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  DEFAULT_PORT,
  DEFAULT_REGISTRY_CDN_CACHE_DIR_NAME,
  DEFAULT_STORAGE_DIR_NAME,
} from "../src/constants.js";
import type { PublishEvent } from "../src/notifications/types.js";
import { runRegistry } from "../src/run.js";
import type { WebhookConfig } from "../src/types.js";

const REGISTRY_URL = `http://localhost:${DEFAULT_PORT}`;
const TEST_PKG_NAME = "test-pkg";
const TEST_PKG_VERSION = "1.0.0";
const POLL_TIMEOUT = 15000;
const POLL_INTERVAL = 200;

let authToken: string;

/**
 * Creates a test user in verdaccio and stores the auth token.
 * Safe to call multiple times — reuses existing token or handles 409.
 */
async function ensureTestUser(): Promise<void> {
  if (authToken) return;
  const res = await fetch(`${REGISTRY_URL}/-/user/org.couchdb.user:testuser`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "testuser", password: "testpassword" }),
  });
  const body = (await res.json()) as { token?: string };
  if (body.token) {
    authToken = body.token;
  }
}

/**
 * Publishes a minimal package to the registry using the npm HTTP API.
 * Creates a tarball via `npm pack`, computes the real shasum, then PUTs
 * the publish payload directly to verdaccio.
 */
async function publishPackage(
  name = TEST_PKG_NAME,
  version = TEST_PKG_VERSION,
): Promise<void> {
  const { createHash } = await import("node:crypto");
  const { readFileSync } = await import("node:fs");

  const tmpDir = path.join(import.meta.dirname, ".tmp-publish");
  execSync(`rm -rf ${tmpDir} && mkdir -p ${tmpDir}`);
  writeFileSync(
    path.join(tmpDir, "package.json"),
    JSON.stringify({ name, version, description: "test" }),
  );

  const tarballName = execSync("npm pack --pack-destination .", {
    cwd: tmpDir,
    encoding: "utf-8",
  }).trim();
  const tarball = readFileSync(path.join(tmpDir, tarballName));
  execSync(`rm -rf ${tmpDir}`);

  const shasum = createHash("sha1").update(tarball).digest("hex");
  const tarballBase64 = tarball.toString("base64");
  const shortName = name.startsWith("@") ? name.split("/")[1] : name;

  const res = await fetch(`${REGISTRY_URL}/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      _id: name,
      name,
      "dist-tags": { latest: version },
      versions: {
        [version]: {
          name,
          version,
          description: "test",
          dist: {
            tarball: `${REGISTRY_URL}/${name}/-/${shortName}-${version}.tgz`,
            shasum,
          },
        },
      },
      _attachments: {
        [`${shortName}-${version}.tgz`]: {
          content_type: "application/octet-stream",
          data: tarballBase64,
          length: tarball.length,
        },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Publish failed (${res.status}): ${body}`);
  }
}

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
    await ensureTestUser();
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

    it("returns 404 for non-existent package", async () => {
      const response = await fetch(
        `${REGISTRY_URL}/packages/non-existent-package`,
      );

      expect(response.status).toBe(404);
    });

    it.skipIf(!hasVetraFixture)("includes vetra package", async () => {
      const response = await fetch(`${REGISTRY_URL}/packages`);
      const packages = (await response.json()) as Array<{ name: string }>;

      const vetra = packages.find((p) => p.name === "@powerhousedao/vetra");
      expect(vetra).toBeDefined();
    });
  });

  describe("GET /packages pagination + search", () => {
    // Seed a known, isolated set directly into the cdn-cache (no publish/warm
    // needed — scanPackages reads folders synchronously, and entries without
    // storage metadata are included). Unique name prefix so `?search=` scopes
    // assertions deterministically regardless of other packages present.
    const PREFIX = "pagination-fixture";
    const cdnCacheDir = path.join(testDir, "./.test-output/cdn-cache");
    const fixtureNames = Array.from(
      { length: 5 },
      (_, i) => `${PREFIX}-${String(i + 1).padStart(2, "0")}`,
    );

    beforeAll(() => {
      fixtureNames.forEach((name, i) => {
        const dir = path.join(cdnCacheDir, name);
        mkdirSync(dir, { recursive: true });
        writeFileSync(
          path.join(dir, "powerhouse.manifest.json"),
          JSON.stringify({
            name,
            // One fixture carries a unique word only in its description, to
            // prove search matches description as well as name.
            description: i === 2 ? "zebradescriptor unique blurb" : `pkg ${i}`,
            category: "Testing",
            publisher: { name: "@test", url: "https://test.example/" },
            documentModels: [{ id: `test/${name}`, name }],
          }),
        );
        writeFileSync(
          path.join(dir, "package.json"),
          JSON.stringify({ name, version: `1.0.${i}` }),
        );
      });
    });

    afterAll(() => {
      fixtureNames.forEach((name) => {
        rmSync(path.join(cdnCacheDir, name), { recursive: true, force: true });
      });
    });

    type Page = {
      items: Array<{
        name: string;
        version?: string;
        description?: string;
        category?: string;
        manifest?: unknown;
      }>;
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };

    it("returns a paginated envelope with the first page", async () => {
      const res = await fetch(
        `${REGISTRY_URL}/packages?search=${PREFIX}&limit=2`,
      );
      expect(res.ok).toBe(true);
      const page = (await res.json()) as Page;
      expect(page.total).toBe(5);
      expect(page.limit).toBe(2);
      expect(page.offset).toBe(0);
      expect(page.hasMore).toBe(true);
      expect(page.items.map((p) => p.name)).toEqual([
        `${PREFIX}-01`,
        `${PREFIX}-02`,
      ]);
    });

    it("pages through with offset (name-sorted, no overlap)", async () => {
      const mid = (await (
        await fetch(`${REGISTRY_URL}/packages?search=${PREFIX}&limit=2&offset=2`)
      ).json()) as Page;
      expect(mid.items.map((p) => p.name)).toEqual([
        `${PREFIX}-03`,
        `${PREFIX}-04`,
      ]);
      expect(mid.hasMore).toBe(true);

      const last = (await (
        await fetch(`${REGISTRY_URL}/packages?search=${PREFIX}&limit=2&offset=4`)
      ).json()) as Page;
      expect(last.items.map((p) => p.name)).toEqual([`${PREFIX}-05`]);
      expect(last.hasMore).toBe(false);
    });

    it("returns trimmed list items (no full manifest)", async () => {
      const page = (await (
        await fetch(`${REGISTRY_URL}/packages?search=${PREFIX}&limit=50`)
      ).json()) as Page;
      expect(page.total).toBe(5);
      const item = page.items[0];
      expect(item.name).toBe(`${PREFIX}-01`);
      expect(item.version).toBe("1.0.0");
      expect(item.description).toBe("pkg 0");
      expect(item.category).toBe("Testing");
      expect(item.manifest).toBeUndefined();
    });

    it("clamps limit to the max page size", async () => {
      const page = (await (
        await fetch(`${REGISTRY_URL}/packages?search=${PREFIX}&limit=999`)
      ).json()) as Page;
      expect(page.limit).toBe(50);
    });

    it("matches on name only, not description", async () => {
      // "zebradescriptor" appears only in one fixture's description, never in
      // a name — so a name-only search must return nothing.
      const page = (await (
        await fetch(`${REGISTRY_URL}/packages?search=zebradescriptor&limit=10`)
      ).json()) as Page;
      expect(page.total).toBe(0);
      expect(page.items).toEqual([]);
    });

    it("stays backward compatible without a limit param (bare array)", async () => {
      const res = await fetch(`${REGISTRY_URL}/packages`);
      const body = (await res.json()) as unknown;
      expect(Array.isArray(body)).toBe(true);
    });

    it("stays backward compatible for ?documentType= (bare array)", async () => {
      const res = await fetch(
        `${REGISTRY_URL}/packages?documentType=${encodeURIComponent(
          `test/${PREFIX}-01`,
        )}`,
      );
      const body = (await res.json()) as Array<{ name: string }>;
      expect(Array.isArray(body)).toBe(true);
      expect(body.some((p) => p.name === `${PREFIX}-01`)).toBe(true);
    });
  });

  describe("GET /packages/:name version metadata", () => {
    // The single-package endpoint feeds the paginated UI's lazy version
    // picker, so it must return distTags/versions from verdaccio storage
    // metadata (loadPackage now reads it). Seed a cdn-cache manifest + a
    // storage package.json with versions to exercise that path.
    const NAME = "detail-version-fixture";
    const cdnCacheDir = path.join(testDir, "./.test-output/cdn-cache");
    const storageDir = path.join(testDir, "./.test-output/storage");

    beforeAll(() => {
      // Manifest lives under a version subdir, mirroring the real cdn-cache
      // layout, so loadPackage resolves it whether or not a version is passed.
      const versionDir = path.join(cdnCacheDir, NAME, "2.0.0");
      mkdirSync(versionDir, { recursive: true });
      writeFileSync(
        path.join(versionDir, "powerhouse.manifest.json"),
        JSON.stringify({ name: NAME, description: "detail fixture" }),
      );
      writeFileSync(
        path.join(versionDir, "package.json"),
        JSON.stringify({ name: NAME, version: "2.0.0" }),
      );
      const storagePkgDir = path.join(storageDir, NAME);
      mkdirSync(storagePkgDir, { recursive: true });
      writeFileSync(
        path.join(storagePkgDir, "package.json"),
        JSON.stringify({
          name: NAME,
          "dist-tags": { latest: "2.0.0", dev: "2.1.0-dev.1" },
          versions: { "1.0.0": {}, "2.0.0": {}, "2.1.0-dev.1": {} },
          _attachments: { [`${NAME}-2.0.0.tgz`]: { length: 1 } },
        }),
      );
    });

    afterAll(() => {
      rmSync(path.join(cdnCacheDir, NAME), { recursive: true, force: true });
      rmSync(path.join(storageDir, NAME), { recursive: true, force: true });
    });

    it("includes distTags and versions", async () => {
      const res = await fetch(`${REGISTRY_URL}/packages/${NAME}`);
      expect(res.ok).toBe(true);
      const pkg = (await res.json()) as {
        name: string;
        distTags?: Record<string, string>;
        versions?: string[];
      };
      expect(pkg.name).toBe(NAME);
      expect(pkg.distTags).toEqual({ latest: "2.0.0", dev: "2.1.0-dev.1" });
      expect(pkg.versions).toEqual(["1.0.0", "2.0.0", "2.1.0-dev.1"]);
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
        const manifest = (await response.json()) as Manifest;
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

  describe("publish", () => {
    it("publishes a package and it appears in /packages", async () => {
      await publishPackage();

      await vi.waitFor(
        async () => {
          const res = await fetch(`${REGISTRY_URL}/packages`);
          const packages = (await res.json()) as Array<{ name: string }>;
          expect(packages.some((p) => p.name === TEST_PKG_NAME)).toBe(true);
        },
        { timeout: POLL_TIMEOUT, interval: POLL_INTERVAL },
      );
    });

    it("serves published package via CDN", async () => {
      await vi.waitFor(
        async () => {
          const res = await fetch(
            `${REGISTRY_URL}/-/cdn/${TEST_PKG_NAME}/package.json`,
          );
          expect(res.ok).toBe(true);
          const pkg = (await res.json()) as { name: string; version: string };
          expect(pkg.name).toBe(TEST_PKG_NAME);
          expect(pkg.version).toBe(TEST_PKG_VERSION);
        },
        { timeout: POLL_TIMEOUT, interval: POLL_INTERVAL },
      );
    });
  });

  describe("webhooks", () => {
    const webhookEndpoint = "http://localhost:19876/hook";

    afterEach(async () => {
      // Clean up any webhooks registered during the test
      await fetch(`${REGISTRY_URL}/-/webhooks`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: webhookEndpoint }),
      });
    });

    it("GET /-/webhooks returns empty array initially", async () => {
      const res = await fetch(`${REGISTRY_URL}/-/webhooks`);
      expect(res.ok).toBe(true);
      const webhooks = (await res.json()) as WebhookConfig[];
      expect(webhooks).toEqual([]);
    });

    it("POST /-/webhooks registers a webhook", async () => {
      const res = await fetch(`${REGISTRY_URL}/-/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: webhookEndpoint }),
      });
      expect(res.status).toBe(201);

      const listRes = await fetch(`${REGISTRY_URL}/-/webhooks`);
      const webhooks = (await listRes.json()) as WebhookConfig[];
      expect(webhooks).toEqual([{ endpoint: webhookEndpoint }]);
    });

    it("POST /-/webhooks returns 400 without endpoint", async () => {
      const res = await fetch(`${REGISTRY_URL}/-/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it("DELETE /-/webhooks removes a webhook", async () => {
      await fetch(`${REGISTRY_URL}/-/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: webhookEndpoint }),
      });

      const delRes = await fetch(`${REGISTRY_URL}/-/webhooks`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: webhookEndpoint }),
      });
      expect(delRes.status).toBe(204);

      const listRes = await fetch(`${REGISTRY_URL}/-/webhooks`);
      const webhooks = (await listRes.json()) as WebhookConfig[];
      expect(webhooks).toEqual([]);
    });

    it("DELETE /-/webhooks returns 404 for unknown endpoint", async () => {
      const res = await fetch(`${REGISTRY_URL}/-/webhooks`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: "http://unknown" }),
      });
      expect(res.status).toBe(404);
    });

    it("webhook receives publish notification", async () => {
      const received: PublishEvent[] = [];

      // Start a tiny HTTP server to receive webhook calls
      const hookServer = http.createServer((req, res) => {
        let body = "";
        req.on("data", (chunk: Buffer) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          received.push(JSON.parse(body) as PublishEvent);
          res.writeHead(200);
          res.end();
        });
      });
      await new Promise<void>((resolve) => {
        hookServer.listen(19876, resolve);
      });

      try {
        // Register webhook
        await fetch(`${REGISTRY_URL}/-/webhooks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: webhookEndpoint }),
        });

        // Publish a new package version to trigger the notification
        await publishPackage("webhook-test-pkg", "1.0.0");

        // Wait for webhook delivery
        await vi.waitFor(
          () => {
            expect(received.length).toBe(1);
            expect(received[0].packageName).toBe("webhook-test-pkg");
            expect(received[0].version).toBe("1.0.0");
          },
          { timeout: POLL_TIMEOUT, interval: POLL_INTERVAL },
        );
      } finally {
        hookServer.close();
      }
    });
  });

  describe("SSE", () => {
    it("GET /-/events returns SSE stream with connected event", async () => {
      const events = await collectSSEEvents(
        `${REGISTRY_URL}/-/events`,
        1,
        2000,
      );
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].event).toBe("connected");
    });

    it("SSE receives publish event", async () => {
      // Start collecting SSE events (connected + publish)
      const eventsPromise = collectSSEEvents(
        `${REGISTRY_URL}/-/events`,
        2,
        POLL_TIMEOUT,
      );

      // Give SSE connection time to establish
      await new Promise((r) => setTimeout(r, 500));

      // Publish triggers a notification
      await publishPackage("sse-test-pkg", "1.0.0");

      const events = await eventsPromise;
      const publishEvents = events.filter((e) => e.event === "publish");
      expect(publishEvents.length).toBe(1);
      expect(publishEvents[0].data.packageName).toBe("sse-test-pkg");
      expect(publishEvents[0].data.version).toBe("1.0.0");
    });
  });
});

interface SSEEvent {
  event: string;
  data: PublishEvent;
}

/**
 * Opens an SSE connection, collects up to `count` events, and resolves.
 * Aborts after `timeoutMs` with whatever events were collected.
 */
function collectSSEEvents(
  url: string,
  count: number,
  timeoutMs: number,
): Promise<SSEEvent[]> {
  return new Promise((resolve) => {
    const events: SSEEvent[] = [];
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
      resolve(events);
    }, timeoutMs);

    http
      .get(url, { signal: controller.signal }, (res) => {
        let buffer = "";
        res.on("data", (chunk: Buffer) => {
          buffer += chunk.toString();
          // Parse complete SSE messages (terminated by \n\n)
          const parts = buffer.split("\n\n");
          buffer = parts.pop()!;
          for (const part of parts) {
            if (!part.trim()) continue;
            const lines = part.split("\n");
            let event = "message";
            let data = "";
            for (const line of lines) {
              if (line.startsWith("event: ")) event = line.slice(7);
              if (line.startsWith("data: ")) data = line.slice(6);
            }
            events.push({
              event,
              data: JSON.parse(data) as PublishEvent,
            });
            if (events.length >= count) {
              clearTimeout(timeout);
              controller.abort();
              resolve(events);
              return;
            }
          }
        });
      })
      .on("error", () => {
        // AbortError is expected when we close the connection
        clearTimeout(timeout);
        resolve(events);
      });
  });
}
