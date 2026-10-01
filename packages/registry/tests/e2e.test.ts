import type { Manifest } from "@powerhousedao/shared";
import { access, cp, mkdir, rm } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
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
  DEFAULT_REGISTRY_CDN_CACHE_DIR_NAME,
  DEFAULT_STORAGE_DIR_NAME,
} from "../src/constants.js";
import type { PublishEvent } from "../src/notifications/types.js";
import { runRegistry } from "../src/run.js";
import type { WebhookConfig } from "../src/types.js";
import { packTarball } from "./pack.js";

// Bound to an ephemeral port in runServer.
let REGISTRY_URL = "";
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
 * Builds the tarball, computes the real shasum, then PUTs the publish
 * payload directly to verdaccio.
 */
async function publishPackage(
  name = TEST_PKG_NAME,
  version = TEST_PKG_VERSION,
  options: { files?: Record<string, string>; tag?: string } = {},
): Promise<void> {
  const { createHash } = await import("node:crypto");

  const tarball = packTarball(
    { name, version, description: "test" },
    options.files,
  );
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
      "dist-tags": { [options.tag ?? "latest"]: version },
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
      port: 0,
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
    REGISTRY_URL = `http://localhost:${(server.address() as AddressInfo).port}`;
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
    it("answers 304 for a listing that hasn't changed", async () => {
      const first = await fetch(`${REGISTRY_URL}/packages`);
      const etag = first.headers.get("etag");
      expect(etag).toBeTruthy();
      await first.text();
      const again = await fetch(`${REGISTRY_URL}/packages`, {
        headers: { "If-None-Match": etag! },
      });
      expect(again.status).toBe(304);
    });

    it("returns the first page without parameters", async () => {
      const response = await fetch(`${REGISTRY_URL}/packages`);

      expect(response.ok).toBe(true);
      const page = (await response.json()) as {
        items: unknown[];
        limit: number;
        offset: number;
      };
      expect(Array.isArray(page.items)).toBe(true);
      expect(page).toMatchObject({ limit: 30, offset: 0 });
    });

    it("returns 404 for non-existent package", async () => {
      const response = await fetch(
        `${REGISTRY_URL}/packages/non-existent-package`,
      );

      expect(response.status).toBe(404);
    });

    it.skipIf(!hasVetraFixture)("includes vetra package", async () => {
      const response = await fetch(
        `${REGISTRY_URL}/packages?name=@powerhousedao/vetra`,
      );
      const page = (await response.json()) as { total: number };
      expect(page.total).toBe(1);
    });
  });

  describe("GET /packages pagination + search", () => {
    // An isolated set of published packages; the unique name prefix scopes
    // `?search=` assertions regardless of other packages present
    const PREFIX = "pagination-fixture";
    // Listed under its manifest name; found by its npm name too
    const RENAMED = "renamed-npm-fixture";
    const fixtureNames = Array.from(
      { length: 5 },
      (_, i) => `${PREFIX}-${String(i + 1).padStart(2, "0")}`,
    );

    beforeAll(async () => {
      await publishPackage(RENAMED, "1.0.0", {
        files: {
          "powerhouse.manifest.json": JSON.stringify({
            name: "Renamed Display Fixture",
          }),
        },
      });
      for (const [i, name] of fixtureNames.entries()) {
        await publishPackage(name, `1.0.${i}`, {
          files: {
            "powerhouse.manifest.json": JSON.stringify(
              i === 4
                ? {
                    name,
                    description: `pkg ${i}`,
                    category: "Other",
                    publisher: { name: "@other" },
                    editors: [{ id: `test/${name}-editor`, name }],
                  }
                : {
                    name,
                    // Only a description names -05: it ranks after -05 itself
                    description:
                      i === 2
                        ? `zebradescriptor, pairs with ${PREFIX}-05`
                        : `pkg ${i}`,
                    category: "Testing",
                    publisher: { name: "@test", url: "https://test.example/" },
                    documentModels: [{ id: `test/${name}`, name }],
                  },
            ),
          },
        });
      }
      await vi.waitFor(
        async () => {
          const res = await fetch(
            `${REGISTRY_URL}/packages?search=${PREFIX}&limit=50`,
          );
          expect(((await res.json()) as { total: number }).total).toBe(5);
        },
        { timeout: POLL_TIMEOUT, interval: POLL_INTERVAL },
      );
    }, 30000);

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
        await fetch(
          `${REGISTRY_URL}/packages?search=${PREFIX}&limit=2&offset=2`,
        )
      ).json()) as Page;
      expect(mid.items.map((p) => p.name)).toEqual([
        `${PREFIX}-03`,
        `${PREFIX}-04`,
      ]);
      expect(mid.hasMore).toBe(true);

      const last = (await (
        await fetch(
          `${REGISTRY_URL}/packages?search=${PREFIX}&limit=2&offset=4`,
        )
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

    const fetchPage = async (query: string) => {
      const res = await fetch(`${REGISTRY_URL}/packages?${query}`);
      expect(res.ok).toBe(true);
      return (await res.json()) as Page & {
        facets?: { categories: string[]; publishers: string[] };
      };
    };
    const names = (p: Page) => p.items.map((i) => i.name);

    it("searches descriptions too, ranking name matches first", async () => {
      expect(names(await fetchPage("search=zebradescriptor"))).toEqual([
        `${PREFIX}-03`,
      ]);
      const ranked = names(await fetchPage(`search=${PREFIX}-05`));
      expect(ranked.slice(0, 2)).toEqual([`${PREFIX}-05`, `${PREFIX}-03`]);
    });

    it("ORs values within a filter and ANDs filters", async () => {
      const q = `search=${PREFIX}`;
      expect(names(await fetchPage(`${q}&category=Other`))).toEqual([
        `${PREFIX}-05`,
      ]);
      expect(
        (await fetchPage(`${q}&category=Testing&category=Other`)).total,
      ).toBe(5);
      expect(names(await fetchPage(`${q}&publisher=@other`))).toEqual([
        `${PREFIX}-05`,
      ]);
      expect(names(await fetchPage(`${q}&moduleType=editors`))).toEqual([
        `${PREFIX}-05`,
      ]);
      expect(
        (await fetchPage(`${q}&moduleType=documentModels&category=Other`))
          .total,
      ).toBe(0);
    });

    it("restricts to the requested names", async () => {
      const page = await fetchPage(`name=${PREFIX}-05&name=${PREFIX}-01`);
      expect(names(page)).toEqual([`${PREFIX}-01`, `${PREFIX}-05`]);
    });

    it("finds a package by npm name when its manifest renames it", async () => {
      for (const query of [`name=${RENAMED}`, `search=${RENAMED}`]) {
        const page = await fetchPage(query);
        expect(names(page)).toEqual(["Renamed Display Fixture"]);
      }
    });

    it("returns full PackageInfo items with detail=full", async () => {
      const page = await fetchPage(`name=${PREFIX}-01&detail=full`);
      expect(page.items[0].manifest).toMatchObject({ category: "Testing" });
      expect(page.items[0]).toMatchObject({
        documentTypes: [`test/${PREFIX}-01`],
      });
    });

    it("sends facets over the name-restricted set on request", async () => {
      const scoped = `name=${PREFIX}-01&name=${PREFIX}-05&category=Other`;
      expect((await fetchPage(scoped)).facets).toBeUndefined();
      expect((await fetchPage(`${scoped}&facets=true`)).facets).toEqual({
        categories: ["Other", "Testing"],
        publishers: ["@other", "@test"],
      });
    });

    it("filters by a document model's id", async () => {
      const page = await fetchPage(
        `documentType=${encodeURIComponent(`test/${PREFIX}-01`)}`,
      );
      expect(names(page)).toEqual([`${PREFIX}-01`]);
    });

    it("matches misspellings and word stems", async () => {
      expect(names(await fetchPage("search=zebradescriptr"))).toEqual([
        `${PREFIX}-03`,
      ]);
      expect(names(await fetchPage("search=pairing"))).toEqual([
        `${PREFIX}-03`,
      ]);
    });
  });

  describe("GET /packages/:name version metadata", () => {
    // The single-package endpoint feeds the paginated UI's lazy version
    // picker, so it must return the package's dist-tags and versions
    const NAME = "detail-version-fixture";
    const files = {
      "powerhouse.manifest.json": JSON.stringify({
        name: NAME,
        description: "detail fixture",
      }),
    };

    beforeAll(async () => {
      await publishPackage(NAME, "1.0.0", { files });
      await publishPackage(NAME, "2.0.0", { files });
      await publishPackage(NAME, "2.1.0-dev.1", { files, tag: "dev" });
      await vi.waitFor(
        async () => {
          const res = await fetch(`${REGISTRY_URL}/packages/${NAME}`);
          const pkg = (await res.json()) as { versions?: string[] };
          expect(pkg.versions).toHaveLength(3);
        },
        { timeout: POLL_TIMEOUT, interval: POLL_INTERVAL },
      );
    }, 30000);

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
      // Cached before the publish: the publish's event must clear it
      const before = await fetch(
        `${REGISTRY_URL}/packages?name=${TEST_PKG_NAME}`,
      );
      expect(((await before.json()) as { total: number }).total).toBe(0);
      await publishPackage(TEST_PKG_NAME, TEST_PKG_VERSION, {
        files: {
          "powerhouse.manifest.json": JSON.stringify({ name: TEST_PKG_NAME }),
        },
      });

      await vi.waitFor(
        async () => {
          const res = await fetch(
            `${REGISTRY_URL}/packages?name=${TEST_PKG_NAME}`,
          );
          const page = (await res.json()) as { items: { name: string }[] };
          expect(page.items.map((p) => p.name)).toEqual([TEST_PKG_NAME]);
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
      // The server emits `connected` as it registers the subscriber, so waiting
      // for it is what guarantees the publish below is observed. A fixed delay
      // is not enough on a slow runner: the publish lands before the client is
      // in the set and the event goes nowhere.
      let markConnected: () => void = () => {};
      const connected = new Promise<void>((r) => {
        markConnected = r;
      });

      // Start collecting SSE events (connected + publish)
      const eventsPromise = collectSSEEvents(
        `${REGISTRY_URL}/-/events`,
        2,
        POLL_TIMEOUT,
        (event) => {
          if (event.event === "connected") markConnected();
        },
      );

      // Bounded so a connection that never establishes fails on the assertion
      // below rather than hanging.
      await Promise.race([
        connected,
        new Promise((r) => setTimeout(r, POLL_TIMEOUT)),
      ]);

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
 *
 * `onEvent` fires as each event arrives, so a caller can wait for the server's
 * `connected` event instead of guessing at a delay.
 */
function collectSSEEvents(
  url: string,
  count: number,
  timeoutMs: number,
  onEvent?: (event: SSEEvent) => void,
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
            const parsed: SSEEvent = {
              event,
              data: JSON.parse(data) as PublishEvent,
            };
            events.push(parsed);
            onEvent?.(parsed);
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
