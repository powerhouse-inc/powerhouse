import { describe, expect, it, vi } from "vitest";
import { WorkerPackageLoader } from "../../src/rpc/worker-package-loader.js";

function fakeModel(id: string, version?: number) {
  return {
    documentModel: { global: { id } },
    reducer: () => undefined,
    ...(version === undefined ? {} : { version }),
  };
}

function manifest(documentType: string, to: number) {
  return { documentType, upgrades: { [`1-${to}`]: () => undefined } };
}

type Namespace = Record<string, unknown>;

function deferred() {
  let resolve!: (namespace: Namespace) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Namespace>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A loader whose URL imports come from a table the test controls. */
function loaderOver(
  namespaces: Record<string, Namespace | (() => Promise<Namespace>)>,
  packageNames: string[] = [],
) {
  const importPackage = vi.fn((url: string) => {
    if (!(url in namespaces)) return Promise.reject(new Error(`404 ${url}`));
    const entry = namespaces[url];
    return typeof entry === "function" ? entry() : Promise.resolve(entry);
  });
  const loader = new WorkerPackageLoader({
    cdnUrl: "https://cdn.test",
    importPackage,
    resolvePackages: () => Promise.resolve(packageNames),
  });
  return { loader, importPackage };
}

function moduleKeys(loader: WorkerPackageLoader): string[] {
  return loader.models
    .map((m) => `${m.documentModel.global.id}@${m.version ?? 1}`)
    .sort();
}

describe("WorkerPackageLoader", () => {
  it("imports each package's document-models subpath and collects models", async () => {
    const urls: string[] = [];
    const loader = new WorkerPackageLoader({
      cdnUrl: "https://cdn.example/-/cdn",
      importPackage: (url) => {
        urls.push(url);
        return Promise.resolve({
          DriveModule: fakeModel("powerhouse/document-drive"),
          notAModel: 42,
        });
      },
    });
    const models = await loader.loadPackages(["@powerhousedao/common@1.2.3"]);
    expect(urls).toEqual([
      "https://cdn.example/-/cdn/@powerhousedao/common/browser/document-models/index.js",
    ]);
    expect(models).toHaveLength(1);
    expect(models[0]?.documentModel.global.id).toBe(
      "powerhouse/document-drive",
    );
  });

  it("resolves loaded models by document type and rejects unknown ones", async () => {
    const loader = new WorkerPackageLoader({
      cdnUrl: "https://cdn.example",
      importPackage: () =>
        Promise.resolve({ M: fakeModel("powerhouse/document-drive") }),
      resolvePackages: () => Promise.resolve([]),
    });
    await loader.loadPackages(["pkg"]);
    const module = await loader.load("powerhouse/document-drive");
    expect(module.documentModel.global.id).toBe("powerhouse/document-drive");
    await expect(loader.load("does/not-exist")).rejects.toThrow(
      "No package found for document model: does/not-exist",
    );
  });

  it("loads an unknown type on demand via discovery", async () => {
    const urls: string[] = [];
    const loader = new WorkerPackageLoader({
      cdnUrl: "https://cdn.example",
      importPackage: (url) => {
        urls.push(url);
        return Promise.resolve({ M: fakeModel("ph/lazy") });
      },
      resolvePackages: (documentType) =>
        Promise.resolve(documentType === "ph/lazy" ? ["lazy-pkg"] : []),
    });
    const module = await loader.load("ph/lazy");
    expect(module.documentModel.global.id).toBe("ph/lazy");
    expect(urls).toEqual([
      "https://cdn.example/lazy-pkg/browser/document-models/index.js",
    ]);
  });

  it("preserves the import error as the cause when on-demand load fails", async () => {
    const importError = new Error("404");
    const loader = new WorkerPackageLoader({
      cdnUrl: "https://cdn.example",
      importPackage: () => Promise.reject(importError),
      resolvePackages: () => Promise.resolve(["broken-pkg"]),
    });
    await expect(loader.load("ph/lazy")).rejects.toMatchObject({
      message: expect.stringContaining("broken-pkg") as string,
      cause: importError,
    });
  });

  it("imports each spec only once across repeated loadPackages calls", async () => {
    const urls: string[] = [];
    const loader = new WorkerPackageLoader({
      cdnUrl: "https://cdn.example",
      importPackage: (url) => {
        urls.push(url);
        return Promise.resolve({ M: fakeModel("ok/model") });
      },
    });
    await loader.loadPackages(["pkg@1.0.0"]);
    await loader.loadPackages(["pkg@1.0.0"]);
    expect(urls).toHaveLength(1);
  });

  it("retries a previously failed spec on a later load", async () => {
    let attempt = 0;
    const loader = new WorkerPackageLoader({
      cdnUrl: "https://cdn.example",
      importPackage: () => {
        attempt += 1;
        return attempt === 1
          ? Promise.reject(new Error("404"))
          : Promise.resolve({ M: fakeModel("ok/model") });
      },
    });
    expect(await loader.loadPackages(["pkg"])).toHaveLength(0);
    const models = await loader.loadPackages(["pkg"]);
    expect(models).toHaveLength(1);
    expect(attempt).toBe(2);
  });

  it("keeps every version of a type a package exports", async () => {
    const loader = new WorkerPackageLoader({
      cdnUrl: "https://cdn.example",
      importPackage: () =>
        Promise.resolve({
          TodoV1: fakeModel("ph/todo", 1),
          TodoV2: fakeModel("ph/todo", 2),
        }),
    });

    const models = await loader.loadPackages(["todo-pkg"]);

    expect(models.map((m) => m.version).sort()).toEqual([1, 2]);
  });

  it("resolves a bare load to the highest registered version", async () => {
    const loader = new WorkerPackageLoader({
      cdnUrl: "https://cdn.example",
      importPackage: (url) =>
        Promise.resolve(
          url.includes("v1")
            ? { TodoV1: fakeModel("ph/todo", 1) }
            : { TodoV2: fakeModel("ph/todo", 2) },
        ),
    });
    await loader.loadPackages(["todo-v2", "todo-v1"]);

    const module = await loader.load("ph/todo");

    expect(module.version).toBe(2);
  });

  it("records a failed package without aborting the others", async () => {
    const loader = new WorkerPackageLoader({
      cdnUrl: "https://cdn.example",
      importPackage: (url) =>
        url.includes("broken")
          ? Promise.reject(new Error("404"))
          : Promise.resolve({ M: fakeModel("ok/model") }),
    });
    const models = await loader.loadPackages(["broken", "ok"]);
    expect(models).toHaveLength(1);
    expect(models[0]?.documentModel.global.id).toBe("ok/model");
    expect(loader.loadFailures).toHaveLength(1);
    expect(loader.loadFailures[0]?.name).toBe("broken");
  });

  it("names each failed package by its package name", async () => {
    const { loader } = loaderOver({});
    await loader.loadPackages([
      "@scope/versioned@1.2.3",
      "plain@1.2.3",
      "unversioned",
      "@scope/unversioned",
    ]);
    await loader.loadSources([
      { name: "@scope/source", url: "https://host.test/s.js" },
      { name: "source", version: "1.0.0", url: "https://host.test/t.js" },
    ]);
    const { failures } = await loader.reloadSources([
      { name: "@scope/source", url: "https://host.test/s.js?t=2" },
    ]);

    expect(loader.loadFailures.map((failure) => failure.name)).toEqual([
      "@scope/versioned",
      "plain",
      "unversioned",
      "@scope/unversioned",
      "@scope/source",
      "source",
      "@scope/source",
    ]);
    expect(failures.map((failure) => failure.name)).toEqual(["@scope/source"]);
  });

  it("keeps a source's models and manifests when its reload fails", async () => {
    const importError = new Error("syntax error");
    const { loader } = loaderOver({
      "https://host.test/p.js?t=1": {
        P: fakeModel("test/p"),
        upgradeManifests: [manifest("test/p", 2)],
      },
      "https://host.test/p.js?t=2": () => Promise.reject(importError),
    });
    await loader.loadSources([
      { name: "p", url: "https://host.test/p.js?t=1" },
    ]);

    const result = await loader.reloadSources([
      { name: "p", url: "https://host.test/p.js?t=2" },
    ]);

    expect(result.types).toEqual([]);
    expect(result.failures).toEqual([
      { name: "p", url: "https://host.test/p.js?t=2", error: importError },
    ]);
    expect(moduleKeys(loader)).toEqual(["test/p@1"]);
    expect(loader.upgradeManifests.map((m) => m.documentType)).toEqual([
      "test/p",
    ]);
  });

  it("lets the newest of two overlapping reloads win", async () => {
    const first = deferred();
    const second = deferred();
    const { loader } = loaderOver({
      "https://host.test/p.js?t=1": { P: fakeModel("test/p") },
      "https://host.test/p.js?t=2": () => first.promise,
      "https://host.test/p.js?t=3": () => second.promise,
    });
    await loader.loadSources([
      { name: "p", url: "https://host.test/p.js?t=1" },
    ]);

    const older = loader.reloadSources([
      { name: "p", url: "https://host.test/p.js?t=2" },
    ]);
    const newer = loader.reloadSources([
      { name: "p", url: "https://host.test/p.js?t=3" },
    ]);
    second.resolve({ P2: fakeModel("test/p", 2) });
    const newerResult = await newer;
    first.resolve({
      P3: fakeModel("test/p", 3),
      Extra: fakeModel("test/extra"),
    });
    const olderResult = await older;

    expect(newerResult).toEqual({ types: ["test/p"], failures: [] });
    expect(olderResult).toEqual({ types: [], failures: [] });
    expect(moduleKeys(loader)).toEqual(["test/p@2"]);
    expect(loader.loadFailures).toEqual([]);
  });

  it("drops and reports a type a reloaded source no longer exports", async () => {
    const { loader } = loaderOver({
      "https://host.test/p.js?t=1": {
        A: fakeModel("test/a"),
        B: fakeModel("test/b"),
      },
      "https://host.test/p.js?t=2": { A: fakeModel("test/a") },
    });
    await loader.loadSources([
      { name: "p", url: "https://host.test/p.js?t=1" },
    ]);

    const { types } = await loader.reloadSources([
      { name: "p", url: "https://host.test/p.js?t=2" },
    ]);

    expect(types.sort()).toEqual(["test/a", "test/b"]);
    expect(moduleKeys(loader)).toEqual(["test/a@1"]);
  });

  it("shares one import between concurrent loads of the same package", async () => {
    const { loader, importPackage } = loaderOver(
      {
        "https://cdn.test/pkg/browser/document-models/index.js": {
          M: fakeModel("ph/lazy"),
        },
      },
      ["pkg"],
    );

    const [a, b] = await Promise.all([
      loader.load("ph/lazy"),
      loader.load("ph/lazy"),
    ]);

    expect(a.documentModel.global.id).toBe("ph/lazy");
    expect(b).toBe(a);
    expect(importPackage).toHaveBeenCalledTimes(1);
  });
});
