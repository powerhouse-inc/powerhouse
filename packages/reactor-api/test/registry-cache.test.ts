// The registry cache against a real HTTP server serving a fake CDN tree.
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { HttpPackageLoader } from "../src/packages/http-loader.js";
import { isExpectedLoaderMiss } from "../src/packages/package-manager.js";
import {
  MANIFEST_FILE,
  RegistryPackageCache,
} from "../src/packages/registry-cache.js";

const PKG = "@test/models";
const VERSION = "1.0.0";
const root = (version: string) => `/-/cdn/${PKG}@${version}/`;
const ROOT = root(VERSION);

// Every version's model and subgraph say which version they came from.
function tree(version: string): Record<string, string> {
  return {
    "node/document-models/index.mjs": [
      `export { TodoV1 } from "../module-abc.mjs";`,
      `export * from "./extra/index.mjs";`,
    ].join("\n"),
    "node/module-abc.mjs": [
      `import { helper } from "./shared/helper.mjs";`,
      `import { init } from "es-module-lexer";`,
      `import { readFileSync } from "node:fs";`,
      `const name = "./nope.mjs";`,
      `export const loadAny = () => import(name);`,
      `export const loadLazy = () => import("./chunk-lazy.mjs");`,
      `export const TodoV1 = {`,
      `  version: 1,`,
      `  reducer: () => helper,`,
      `  documentModel: { global: { id: "test/todo", name: "${version}" } },`,
      `  actions: {}, utils: {}, lexerReady: typeof init, read: typeof readFileSync,`,
      `};`,
    ].join("\n"),
    "node/shared/helper.mjs": `export const helper = 42;`,
    "node/chunk-lazy.mjs": `export const lazy = "lazy";`,
    "node/document-models/extra/index.mjs": `export const extra = 1;`,
    "node/subgraphs/index.mjs": `export * as Todo from "./todo/index.mjs";`,
    "node/subgraphs/todo/index.mjs": [
      `import { TodoV1 } from "../../module-abc.mjs";`,
      `export class Subgraph { static model = TodoV1; static version = "${version}"; }`,
    ].join("\n"),
  };
}

const TREE = tree(VERSION);

type Served = { body: string; status?: number; delayMs?: number };

let server: Server;
let registryUrl: string;
let files: Map<string, Served>;
let requests: string[];

function serveTree(at: string, entries: Record<string, string>, delayMs = 0) {
  for (const [rel, body] of Object.entries(entries)) {
    files.set(`${at}${rel}`, { body, delayMs });
  }
}

function serveVersion(version: string): void {
  files.set(`${root(version)}package.json`, {
    body: JSON.stringify({ version }),
  });
  serveTree(root(version), tree(version));
}

// What the CDN calls the latest version of the package.
function serveLatest(version: string): void {
  files.set(`/-/cdn/${PKG}/package.json`, {
    body: JSON.stringify({ version }),
  });
}

function resetServer(): void {
  files = new Map();
  requests = [];
  serveVersion(VERSION);
  serveLatest(VERSION);
  files.set(`/packages/by-document-type`, { body: JSON.stringify([PKG]) });
}

beforeAll(async () => {
  server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url!, "http://x").pathname);
    requests.push(pathname);
    const served = files.get(pathname);
    if (!served) {
      res.statusCode = 404;
      res.end();
      return;
    }
    setTimeout(() => {
      res.statusCode = served.status ?? 200;
      res.setHeader("content-type", "application/javascript");
      res.end(served.body);
    }, served.delayMs ?? 0);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  registryUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

let projectDir: string;
let cacheDir: string;

function newCache(): RegistryPackageCache {
  return new RegistryPackageCache({ registryUrl, cacheDir });
}

// A fresh loader stands in for a fresh process.
function newLoader(): HttpPackageLoader {
  return new HttpPackageLoader({ registryUrl, cacheDir });
}

const entryDir = (version = VERSION) =>
  path.join(cacheDir, `${PKG}@${version}`);

beforeEach(async () => {
  resetServer();
  // An empty project: nothing it imports resolves from here.
  projectDir = await mkdtemp(path.join(tmpdir(), "ph-registry-cache-"));
  cacheDir = path.join(projectDir, ".ph", "registry-packages");
});

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true });
});

describe("RegistryPackageCache", () => {
  it("crawls every entry's module graph, dynamic chunks included", async () => {
    const cached = await newCache().ensurePackage(PKG, VERSION);

    expect(cached.dir).toBe(entryDir());
    expect(cached.entries.documentModels).toBe(
      path.join(cached.dir, "node/document-models/index.mjs"),
    );
    expect(cached.entries.subgraphs).toBe(
      path.join(cached.dir, "node/subgraphs/index.mjs"),
    );
    expect(cached.entries.processors).toBeUndefined();
    for (const rel of Object.keys(TREE)) {
      expect(await readFile(path.join(cached.dir, rel), "utf8")).toBe(
        TREE[rel],
      );
    }
    await expect(
      stat(path.join(cached.dir, MANIFEST_FILE)),
    ).resolves.toBeDefined();
    // No staging dirs left beside the entry.
    expect(await readdir(path.join(cacheDir, "@test"))).toEqual([
      `models@${VERSION}`,
    ]);
  });

  it("links a bare import only reactor-api provides, and the cached file imports", async () => {
    const cached = await newCache().ensurePackage(PKG, VERSION);

    const link = path.join(cacheDir, "node_modules", "es-module-lexer");
    expect(path.isAbsolute(await readlink(link))).toBe(true);
    const mod = (await import(
      /* @vite-ignore */ pathToFileURL(cached.entries.documentModels!).href
    )) as { TodoV1: { lexerReady: string }; extra: number };
    expect(mod.TodoV1.lexerReady).toBe("object");
    expect(mod.extra).toBe(1);
  });

  it("shares one download between concurrent callers in a process", async () => {
    serveTree(ROOT, TREE, 20);
    const cache = newCache();

    const [a, b] = await Promise.all([
      cache.ensurePackage(PKG, VERSION),
      cache.ensurePackage(PKG, VERSION),
    ]);

    expect(a.dir).toBe(b.dir);
    const entryFetches = requests.filter((r) =>
      r.endsWith("node/document-models/index.mjs"),
    );
    expect(entryFetches).toHaveLength(1);
  });

  it("fills atomically when two processes race for the same entry", async () => {
    serveTree(ROOT, TREE, 20);

    const results = await Promise.all([
      newCache().ensurePackage(PKG, VERSION),
      newCache().ensurePackage(PKG, VERSION),
      newCache().ensurePackage(PKG, VERSION),
    ]);

    for (const result of results) {
      expect(result.dir).toBe(results[0].dir);
    }
    for (const rel of Object.keys(TREE)) {
      expect(await readFile(path.join(entryDir(), rel), "utf8")).toBe(
        TREE[rel],
      );
    }
    expect(await readdir(path.join(cacheDir, "@test"))).toEqual([
      `models@${VERSION}`,
    ]);
    // A later process takes the copy on disk without downloading.
    requests = [];
    const later = await newCache().ensurePackage(PKG, VERSION);
    expect(later.source).toBe("cache");
    expect(requests).toEqual([]);
  });

  it("fetches a corrupted cached file again", async () => {
    await newCache().ensurePackage(PKG, VERSION);
    const helper = path.join(entryDir(), "node/shared/helper.mjs");
    await writeFile(helper, "export const helper = 'tampered';");
    requests = [];

    const second = await newCache().ensurePackage(PKG, VERSION);

    expect(second.source).toBe("download");
    expect(await readFile(helper, "utf8")).toBe(TREE["node/shared/helper.mjs"]);
    expect(requests).toContain(`${ROOT}node/shared/helper.mjs`);
  });

  it("downloads again when the manifest is missing", async () => {
    await newCache().ensurePackage(PKG, VERSION);
    await rm(path.join(entryDir(), MANIFEST_FILE));

    const second = await newCache().ensurePackage(PKG, VERSION);

    expect(second.source).toBe("download");
    await expect(
      stat(path.join(entryDir(), MANIFEST_FILE)),
    ).resolves.toBeDefined();
  });

  it("sweeps leftovers of dead processes but not of live ones", async () => {
    const parent = path.join(cacheDir, "@test");
    const dead = path.join(parent, `models@0.9.0.tmp-4194303-deadbeef`);
    const live = path.join(
      parent,
      `models@0.9.0.stale-${process.ppid}-cafef00d`,
    );
    const fresh = path.join(parent, `models@0.9.0.tmp-4194302-0badf00d`);
    for (const dir of [dead, live, fresh]) {
      await mkdir(dir, { recursive: true });
    }
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000);
    await utimes(dead, tenMinutesAgo, tenMinutesAgo);
    await utimes(live, tenMinutesAgo, tenMinutesAgo);

    await newCache().ensurePackage(PKG, VERSION);

    expect((await readdir(parent)).sort()).toEqual(
      [`models@${VERSION}`, path.basename(live), path.basename(fresh)].sort(),
    );
  });

  it("rejects an import that climbs out of the package", async () => {
    files = new Map();
    serveTree(ROOT, {
      "node/document-models/index.mjs": `export * from "../../../../evil.mjs";`,
    });
    files.set(`/-/cdn/evil.mjs`, { body: "export const evil = 1;" });

    await expect(newCache().ensurePackage(PKG, VERSION)).rejects.toThrow(
      /outside the package/,
    );
    expect(requests).not.toContain("/-/cdn/evil.mjs");
    await expect(readdir(path.join(cacheDir, "@test"))).resolves.toEqual([]);
  });

  it("rejects an import of another origin", async () => {
    files = new Map();
    serveTree(ROOT, {
      "node/document-models/index.mjs": `export * from "https://evil.example/x.mjs";`,
    });

    await expect(newCache().ensurePackage(PKG, VERSION)).rejects.toThrow(
      /outside the package/,
    );
  });

  it("rejects names and versions that could leave the cache dir", async () => {
    const cache = newCache();
    await expect(cache.ensurePackage("../escape", VERSION)).rejects.toThrow(
      /Invalid registry package name/,
    );
    await expect(cache.ensurePackage("@a/../../b", VERSION)).rejects.toThrow(
      /Invalid registry package name/,
    );
    await expect(cache.ensurePackage(PKG, "latest")).rejects.toThrow(
      /Invalid registry package version/,
    );
    await expect(cache.ensurePackage(PKG, "1.0.0/../../x")).rejects.toThrow(
      /Invalid registry package version/,
    );
  });
});

type SubgraphWithModel = { model: unknown; version: string };

describe("HttpPackageLoader", () => {
  it("loads models and subgraphs from one version while latest moves", async () => {
    serveVersion("2.0.0");
    const loader = newLoader();

    const models = await loader.loadDocumentModels(PKG);
    serveLatest("2.0.0");
    const [subgraph] = (await loader.loadSubgraphs(
      PKG,
    )) as unknown as SubgraphWithModel[];

    expect(models.map((m) => m.documentModel.global.name)).toEqual([VERSION]);
    expect(subgraph.version).toBe(VERSION);
    expect(requests.filter((r) => r.includes("@2.0.0/node/"))).toEqual([]);
  });

  it("imports a chunk shared by models and subgraphs once", async () => {
    const loader = newLoader();

    const [model] = await loader.loadDocumentModels(PKG);
    const [subgraph] = (await loader.loadSubgraphs(
      PKG,
    )) as unknown as SubgraphWithModel[];

    expect(subgraph.model).toBe(model);
    expect(
      requests.filter((r) => r.endsWith("node/module-abc.mjs")),
    ).toHaveLength(1);
  });

  it("refuses an entry the package does not ship, as an expected miss", async () => {
    const error: unknown = await newLoader()
      .loadProcessors(PKG)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(isExpectedLoaderMiss(error, PKG, "processors")).toBe(true);
  });

  it("loads an explicitly pinned version without asking for latest", async () => {
    serveVersion("2.0.0");

    const models = await newLoader().loadDocumentModels(`${PKG}@2.0.0`);

    expect(models.map((m) => m.documentModel.global.name)).toEqual(["2.0.0"]);
    expect(requests.filter((r) => r.endsWith("package.json"))).toEqual([]);
  });

  it("uses the one cached version while the registry is down", async () => {
    await newLoader().loadDocumentModels(PKG);
    files = new Map([
      [`/-/cdn/${PKG}/package.json`, { body: "down", status: 503 }],
    ]);
    requests = [];

    const models = await newLoader().loadDocumentModels(PKG);

    expect(models.map((m) => m.documentModel.global.name)).toEqual([VERSION]);
    expect(requests.filter((r) => r.endsWith(".mjs"))).toEqual([]);
  });

  it("does not guess between several cached versions while the registry is down", async () => {
    serveVersion("2.0.0");
    await newLoader().loadDocumentModels(`${PKG}@1.0.0`);
    await newLoader().loadDocumentModels(`${PKG}@2.0.0`);
    files = new Map([
      [`/-/cdn/${PKG}/package.json`, { body: "down", status: 503 }],
    ]);

    await expect(newLoader().loadDocumentModels(PKG)).rejects.toThrow();
  });

  it("hands the resolver a file source for a dynamically loaded type", async () => {
    const source = await newLoader().documentModelLoader.load("test/todo");

    expect(source).toEqual({
      filePath: path.join(entryDir(), "node/document-models/index.mjs"),
    });
  });
});
