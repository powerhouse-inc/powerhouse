import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_REGISTRY_CDN_CACHE_DIR_NAME,
  DEFAULT_STORAGE_DIR_NAME,
} from "../src/constants.js";
import { runRegistry } from "../src/run.js";
import { packTarball } from "./pack.js";

const REGISTRY_PORT = 8383;
const REGISTRY_URL = `http://localhost:${REGISTRY_PORT}`;
const POLL_TIMEOUT = 15000;
const POLL_INTERVAL = 200;

const PIECE_NAME = "@phtest/piece-greeter";
const PIECE_PKG = "piece-fixture-pkg";
const RIVAL_PKG = "piece-fixture-rival";
const PLAIN_PKG = "piece-fixture-plain";
const VERSION = "1.0.0";
const PIECE_DIR = "dist/node/pieces/greeter";

// The engine's own modules, loaded from the neighbouring package: what the
// registry serves is only useful if this code can read it unchanged.
const WORKFLOW_SRC = path.resolve(
  import.meta.dirname,
  "../../reactor-workflow/src",
);

interface PieceSummary {
  name: string;
  displayName: string;
  description: string;
  logoUrl: string;
  version: string;
  actionCount: number;
  triggerCount: number;
  categories: string[];
  auth: unknown;
}

interface BlockSearchHit {
  blockType: string;
  pieceName: string;
  pieceDisplayName: string;
  displayName: string;
  kind: string;
  strategy: string | null;
}

interface CatalogModule {
  fetchPieceCatalog: () => Promise<PieceSummary[]>;
  fetchPieceDetail: (name: string) => Promise<unknown>;
  fetchCatalogWithSuggestions: () => Promise<unknown[]>;
  __resetCatalogCacheForTests: () => void;
}

interface SearchModule {
  buildSearchIndex: (raw: unknown[]) => {
    entries: { hit: BlockSearchHit }[];
    pieces: number;
  };
}

interface FetchModule {
  ensurePieceBundle: (options: {
    name: string;
    version: string;
    cacheDir: string;
  }) => Promise<{ dir: string; source: string }>;
}

let catalogModule: CatalogModule;
let searchModule: SearchModule;
let fetchModule: FetchModule;

const CLOUD_LIST = "https://cloud.activepieces.com/api/v1/pieces";
const CLOUD_CDN = "https://cdn.activepieces.com/pieces/bundled/";

// The engine addresses Activepieces by constant, so pointing it at this
// registry means rewriting those two bases and nothing else.
function routeToRegistry(url: string): string | null {
  if (url.startsWith(CLOUD_LIST)) {
    return `${REGISTRY_URL}/pieces${url.slice(CLOUD_LIST.length)}`;
  }
  if (url.startsWith(CLOUD_CDN)) {
    return `${REGISTRY_URL}/-/pieces/bundled/${url.slice(CLOUD_CDN.length)}`;
  }
  return null;
}

const descriptor = {
  name: PIECE_NAME,
  version: VERSION,
  displayName: "Greeter",
  logoUrl: "https://phtest.example/greeter.svg",
  description: "Says hello",
  authors: ["phtest"],
  categories: ["CONTENT_AND_FILES"],
  auth: {
    type: "CUSTOM_AUTH",
    displayName: "Greeter",
    required: true,
    props: {
      name: { type: "SHORT_TEXT", displayName: "Name", required: true },
    },
  },
  minimumSupportedRelease: "0.68.0",
  actions: {
    greet: {
      name: "greet",
      displayName: "Greet",
      description: "Greets someone",
      props: {},
      requireAuth: true,
    },
  },
  triggers: {
    greeted: {
      name: "greeted",
      displayName: "Someone greeted",
      description: "Fires on a greeting",
      props: {},
      type: "POLLING",
      testStrategy: "TEST_FUNCTION",
    },
  },
};

const PIECE_MODULE = `export const greeter = ${JSON.stringify({
  displayName: "Greeter",
  actions: { greet: {} },
})};\nexport default greeter;\n`;

function manifestWithPiece(packageName: string): string {
  return JSON.stringify({
    name: packageName,
    description: "piece fixture",
    category: "Testing",
    publisher: { name: "@phtest", url: "https://phtest.example/" },
    pieces: [
      {
        id: PIECE_NAME,
        name: "Greeter",
        version: VERSION,
        description: "Says hello",
        bundle: PIECE_DIR,
        descriptor: `${PIECE_DIR}/descriptor.json`,
      },
    ],
  });
}

function pieceFiles(packageName: string): Record<string, string> {
  return {
    "dist/powerhouse.manifest.json": manifestWithPiece(packageName),
    [`${PIECE_DIR}/index.mjs`]: PIECE_MODULE,
    [`${PIECE_DIR}/package.json`]: JSON.stringify({
      name: PIECE_NAME,
      version: VERSION,
      type: "module",
      main: "index.mjs",
      dependencies: {},
    }),
    [`${PIECE_DIR}/descriptor.json`]: JSON.stringify(descriptor, null, 2),
  };
}

let authToken: string;

async function ensureTestUser(): Promise<void> {
  if (authToken) return;
  const res = await fetch(`${REGISTRY_URL}/-/user/org.couchdb.user:pieceuser`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "pieceuser", password: "piecepassword" }),
  });
  const body = (await res.json()) as { token?: string };
  if (!body.token) throw new Error("test user creation returned no token");
  authToken = body.token;
}

async function publishPackage(
  name: string,
  version: string,
  files: Record<string, string>,
): Promise<Response> {
  const tarball = packTarball({ name, version, description: "test" }, files);
  const shasum = createHash("sha1").update(tarball).digest("hex");
  const shortName = name.startsWith("@") ? name.split("/")[1] : name;

  return fetch(`${REGISTRY_URL}/${encodeURIComponent(name)}`, {
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
          data: tarball.toString("base64"),
          length: tarball.length,
        },
      },
    }),
  });
}

async function publishOrThrow(
  name: string,
  version: string,
  files: Record<string, string>,
): Promise<void> {
  const res = await publishPackage(name, version, files);
  if (!res.ok) throw new Error(`publish ${name} failed: ${await res.text()}`);
}

interface CatalogEntry {
  name: string;
  displayName: string;
  description: string;
  logoUrl: string;
  version: string;
  actions: number;
  triggers: number;
  categories: string[];
  auth: unknown;
  package: string;
  packageVersion?: string;
  suggestedActions?: { name: string; displayName: string }[];
  suggestedTriggers?: { name: string; type: string }[];
}

async function catalog(query = ""): Promise<CatalogEntry[]> {
  const res = await fetch(`${REGISTRY_URL}/pieces${query}`);
  expect(res.ok).toBe(true);
  return (await res.json()) as CatalogEntry[];
}

describe("registry pieces", () => {
  const testDir = import.meta.dirname;
  // A directory of its own: tests/.test-output is wiped by e2e.test.ts's
  // own setup, which would pull this registry's storage out from under it.
  const workDir = path.join(testDir, "./.test-output-pieces");
  const bundleCache = path.join(workDir, "piece-bundle-cache");
  let server: Awaited<ReturnType<typeof runRegistry>>;
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    await rm(workDir, { recursive: true, force: true });
    await mkdir(path.join(workDir, DEFAULT_STORAGE_DIR_NAME), {
      recursive: true,
    });
    await mkdir(path.join(workDir, DEFAULT_REGISTRY_CDN_CACHE_DIR_NAME), {
      recursive: true,
    });

    server = await runRegistry({
      port: REGISTRY_PORT,
      storageDir: path.join(workDir, DEFAULT_STORAGE_DIR_NAME),
      cdnCacheDir: path.join(workDir, DEFAULT_REGISTRY_CDN_CACHE_DIR_NAME),
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

    await ensureTestUser();
    await publishOrThrow(PIECE_PKG, VERSION, pieceFiles(PIECE_PKG));
    await publishOrThrow(PLAIN_PKG, VERSION, {
      "dist/powerhouse.manifest.json": JSON.stringify({
        name: PLAIN_PKG,
        description: "no pieces here",
      }),
    });

    await vi.waitFor(
      async () => {
        expect((await catalog()).map((p) => p.name)).toContain(PIECE_NAME);
      },
      { timeout: POLL_TIMEOUT, interval: POLL_INTERVAL },
    );

    catalogModule = (await import(
      `${WORKFLOW_SRC}/reactor/piece-catalog.ts`
    )) as CatalogModule;
    searchModule = (await import(
      `${WORKFLOW_SRC}/reactor/block-search.ts`
    )) as SearchModule;
    fetchModule = (await import(
      `${WORKFLOW_SRC}/pieces/activepieces/fetch.ts`
    )) as FetchModule;

    vi.stubGlobal("fetch", (input: unknown, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request).url;
      const mapped = routeToRegistry(url);
      return realFetch(mapped ?? (input as string), init);
    });
  }, 60000);

  afterAll(() => {
    vi.unstubAllGlobals();
    server.close();
  });

  describe("GET /pieces", () => {
    it("indexes a package that ships pieces and skips one that does not", async () => {
      const entries = await catalog();
      expect(entries.map((p) => p.name)).toContain(PIECE_NAME);
      expect(entries.some((p) => p.package === PLAIN_PKG)).toBe(false);
    });

    it("returns the cloud list shape, counts included", async () => {
      const entry = (await catalog()).find((p) => p.name === PIECE_NAME);
      expect(entry).toMatchObject({
        name: PIECE_NAME,
        displayName: "Greeter",
        description: "Says hello",
        logoUrl: descriptor.logoUrl,
        version: VERSION,
        actions: 1,
        triggers: 1,
        categories: ["CONTENT_AND_FILES"],
        package: PIECE_PKG,
        packageVersion: VERSION,
      });
      expect(entry?.auth).toEqual(descriptor.auth);
      expect(entry?.suggestedActions).toBeUndefined();
    });

    it("carries the blocks inline for suggestionType=ACTION_AND_TRIGGER", async () => {
      const entries = await catalog("?suggestionType=ACTION_AND_TRIGGER");
      const entry = entries.find((p) => p.name === PIECE_NAME);
      expect(entry?.suggestedActions).toEqual([
        {
          name: "greet",
          displayName: "Greet",
          description: "Greets someone",
        },
      ]);
      expect(entry?.suggestedTriggers).toEqual([
        {
          name: "greeted",
          displayName: "Someone greeted",
          description: "Fires on a greeting",
          type: "POLLING",
        },
      ]);
    });
  });

  describe("GET /pieces/:name", () => {
    it("answers for a scoped name, URL-encoded or not", async () => {
      for (const spec of [encodeURIComponent(PIECE_NAME), PIECE_NAME]) {
        const res = await fetch(`${REGISTRY_URL}/pieces/${spec}`);
        expect(res.ok).toBe(true);
        const detail = (await res.json()) as Record<string, unknown>;
        expect(detail.name).toBe(PIECE_NAME);
        expect(detail.package).toBe(PIECE_PKG);
        expect(detail.packageVersion).toBe(VERSION);
        expect(detail.descriptorUrl).toBe(
          `${REGISTRY_URL}/-/cdn/${PIECE_PKG}@${VERSION}/${PIECE_DIR}/descriptor.json`,
        );
        expect(detail.bundleUrl).toBe(
          `${REGISTRY_URL}/-/pieces/bundled/@phtest-piece-greeter-${VERSION}.tgz`,
        );
      }
    });

    it("serves the descriptor it points at", async () => {
      const res = await fetch(`${REGISTRY_URL}/pieces/${PIECE_NAME}`);
      const detail = (await res.json()) as { descriptorUrl: string };
      const served = await fetch(detail.descriptorUrl);
      expect(served.ok).toBe(true);
      expect(await served.json()).toEqual(descriptor);
    });

    it("404s cleanly for a piece nobody published", async () => {
      const res = await fetch(`${REGISTRY_URL}/pieces/@phtest/piece-nothing`);
      expect(res.status).toBe(404);
      expect((await res.json()) as { error: string }).toEqual({
        error: "Piece not found: @phtest/piece-nothing",
      });
    });

    it("404s cleanly for a bundle nobody published", async () => {
      const res = await fetch(
        `${REGISTRY_URL}/-/pieces/bundled/@phtest-piece-nothing-9.9.9.tgz`,
      );
      expect(res.status).toBe(404);
    });
  });

  describe("piece tarball", () => {
    it("serves a gzipped bundle, cacheable forever", async () => {
      const res = await fetch(
        `${REGISTRY_URL}/-/pieces/bundled/@phtest-piece-greeter-${VERSION}.tgz`,
      );
      expect(res.ok).toBe(true);
      expect(res.headers.get("content-type")).toBe("application/gzip");
      expect(res.headers.get("cache-control")).toBe(
        "public, max-age=31536000, immutable",
      );
      const body = Buffer.from(await res.arrayBuffer());
      expect(body.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]));
    });

    it("extracts through the engine to a loadable, dependency-free piece", async () => {
      const bundle = await fetchModule.ensurePieceBundle({
        name: PIECE_NAME,
        version: VERSION,
        cacheDir: bundleCache,
      });
      expect(bundle.source).toBe("cdn");

      const pkg = JSON.parse(
        readFileSync(path.join(bundle.dir, "package.json"), "utf8"),
      ) as { name: string; dependencies: Record<string, string> };
      expect(pkg.name).toBe(PIECE_NAME);
      expect(pkg.dependencies).toEqual({});

      const loaded = (await import(
        pathToFileURL(path.join(bundle.dir, "index.mjs")).href
      )) as { greeter?: { displayName?: string } };
      expect(loaded.greeter?.displayName).toBe("Greeter");
    });
  });

  describe("the engine's own readers", () => {
    it("fetchPieceCatalog parses the listing", async () => {
      catalogModule.__resetCatalogCacheForTests();
      const summaries = await catalogModule.fetchPieceCatalog();
      const piece = summaries.find((p) => p.name === PIECE_NAME);
      expect(piece).toMatchObject({
        displayName: "Greeter",
        description: "Says hello",
        version: VERSION,
        actionCount: 1,
        triggerCount: 1,
        categories: ["CONTENT_AND_FILES"],
      });
    });

    it("fetchPieceDetail reads the detail endpoint", async () => {
      const detail = (await catalogModule.fetchPieceDetail(PIECE_NAME)) as {
        name: string;
        actions: Record<string, unknown>;
        triggers: Record<string, unknown>;
      };
      expect(detail.name).toBe(PIECE_NAME);
      expect(Object.keys(detail.actions)).toEqual(["greet"]);
      expect(Object.keys(detail.triggers)).toEqual(["greeted"]);
    });

    it("buildSearchIndex finds the blocks in the suggestion variant", async () => {
      const raw = await catalogModule.fetchCatalogWithSuggestions();
      const index = searchModule.buildSearchIndex(raw);
      const blockTypes = index.entries.map((e) => e.hit.blockType);
      expect(blockTypes).toContain(`${PIECE_NAME}@${VERSION}#greet`);
      expect(blockTypes).toContain(`${PIECE_NAME}@${VERSION}#trigger:greeted`);
      const trigger = index.entries.find((e) => e.hit.kind === "trigger")?.hit;
      expect(trigger?.strategy).toBe("POLLING");
      expect(trigger?.pieceDisplayName).toBe("Greeter");
    });
  });

  describe("publish", () => {
    it("refuses a package claiming a piece another package owns", async () => {
      const res = await publishPackage(
        RIVAL_PKG,
        VERSION,
        pieceFiles(RIVAL_PKG),
      );
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain(PIECE_NAME);
      expect(body.error).toContain(PIECE_PKG);
      expect(body.error).toContain(RIVAL_PKG);

      const entries = await catalog();
      expect(entries.find((p) => p.name === PIECE_NAME)?.package).toBe(
        PIECE_PKG,
      );
    });

    it("accepts a new version of the package that already owns the piece", async () => {
      const res = await publishPackage(PIECE_PKG, "1.0.1", {
        ...pieceFiles(PIECE_PKG),
        "dist/powerhouse.manifest.json": manifestWithPiece(PIECE_PKG),
      });
      expect(res.ok).toBe(true);

      await vi.waitFor(
        async () => {
          const entry = (await catalog()).find((p) => p.name === PIECE_NAME);
          expect(entry?.packageVersion).toBe("1.0.1");
        },
        { timeout: POLL_TIMEOUT, interval: POLL_INTERVAL },
      );
    });
  });
});
