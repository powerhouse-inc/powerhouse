import { describe, expect, it, vi } from "vitest";
import { WorkerPackageLoader } from "../../src/rpc/worker-package-loader.js";

function model(id: string, version = 1) {
  return {
    reducer: () => undefined,
    version,
    documentModel: { global: { id, name: id } },
  };
}

function manifest(documentType: string, to: number) {
  return { documentType, upgrades: { [`1-${to}`]: () => undefined } };
}

/** A loader whose URL imports come from a table the test controls. */
function loaderOver(namespaces: Record<string, Record<string, unknown>>) {
  const importPackage = vi.fn((url: string) => {
    const namespace = namespaces[url];
    if (!namespace) return Promise.reject(new Error(`404 ${url}`));
    return Promise.resolve(namespace);
  });
  const loader = new WorkerPackageLoader({
    cdnUrl: "https://cdn.test",
    importPackage,
    resolvePackages: () => Promise.resolve([]),
  });
  return { loader, importPackage };
}

describe("WorkerPackageLoader sources", () => {
  it("loads models from a URL-addressed source", async () => {
    const { loader } = loaderOver({
      "https://host.test/pkg.js": { CardV1: model("test/card") },
    });

    await loader.loadSources([
      { name: "my-project", url: "https://host.test/pkg.js" },
    ]);

    expect(loader.models.map((m) => m.documentModel.global.id)).toEqual([
      "test/card",
    ]);
    expect(loader.loadFailures).toEqual([]);
  });

  it("collects upgrade manifests, named array or individual export", async () => {
    const { loader } = loaderOver({
      "https://host.test/a.js": {
        A: model("test/a"),
        upgradeManifests: [manifest("test/a", 2)],
      },
      "https://host.test/b.js": {
        B: model("test/b"),
        m: manifest("test/b", 3),
      },
    });

    await loader.loadSources([
      { name: "a", url: "https://host.test/a.js" },
      { name: "b", url: "https://host.test/b.js" },
    ]);

    expect(loader.upgradeManifests.map((m) => m.documentType).sort()).toEqual([
      "test/a",
      "test/b",
    ]);
  });

  it("is idempotent for an unchanged source", async () => {
    const { loader, importPackage } = loaderOver({
      "https://host.test/pkg.js": { CardV1: model("test/card") },
    });
    const source = { name: "my-project", url: "https://host.test/pkg.js" };

    await loader.loadSources([source]);
    await loader.loadSources([source]);

    expect(importPackage).toHaveBeenCalledTimes(1);
  });

  it("replaces a source on reload, keyed by name not URL", async () => {
    const { loader, importPackage } = loaderOver({
      "https://host.test/pkg.js?t=1": { CardV1: model("test/card") },
      // The rebuild renamed the type and bumped the manifest.
      "https://host.test/pkg.js?t=2": {
        LedgerV1: model("test/ledger"),
        upgradeManifests: [manifest("test/ledger", 2)],
      },
    });

    await loader.loadSources([
      { name: "my-project", url: "https://host.test/pkg.js?t=1" },
    ]);
    const { types } = await loader.reloadSources([
      { name: "my-project", url: "https://host.test/pkg.js?t=2" },
    ]);

    expect(importPackage).toHaveBeenCalledTimes(2);
    // The replaced type is gone, the new one is present.
    expect(loader.models.map((m) => m.documentModel.global.id)).toEqual([
      "test/ledger",
    ]);
    // Both the removed and the added type need registry replacement.
    expect([...types].sort()).toEqual(["test/card", "test/ledger"]);
    expect(loader.upgradeManifests.map((m) => m.documentType)).toEqual([
      "test/ledger",
    ]);
  });

  it("keeps other sources' models when one reloads", async () => {
    const { loader } = loaderOver({
      "https://host.test/a.js": { A: model("test/a") },
      "https://host.test/b.js?t=1": { B: model("test/b") },
      "https://host.test/b.js?t=2": { B: model("test/b", 2) },
    });

    await loader.loadSources([
      { name: "a", url: "https://host.test/a.js" },
      { name: "b", url: "https://host.test/b.js?t=1" },
    ]);
    await loader.reloadSources([
      { name: "b", url: "https://host.test/b.js?t=2" },
    ]);

    const ids = loader.models.map((m) => m.documentModel.global.id).sort();
    expect(ids).toEqual(["test/a", "test/b"]);
    expect(
      loader.models.find((m) => m.documentModel.global.id === "test/b")
        ?.version,
    ).toBe(2);
  });

  it("records a failing source without throwing", async () => {
    const { loader } = loaderOver({});

    await loader.loadSources([
      { name: "missing", url: "https://host.test/nope.js" },
    ]);

    expect(loader.models).toEqual([]);
    expect(loader.loadFailures).toHaveLength(1);
    expect(loader.loadFailures[0].url).toBe("https://host.test/nope.js");
  });

  it("retries a previously failed source on reload", async () => {
    const namespaces: Record<string, Record<string, unknown>> = {};
    const { loader, importPackage } = loaderOver(namespaces);

    await loader.loadSources([
      { name: "p", url: "https://host.test/p.js?t=1" },
    ]);
    expect(loader.models).toEqual([]);

    namespaces["https://host.test/p.js?t=2"] = { P: model("test/p") };
    await loader.reloadSources([
      { name: "p", url: "https://host.test/p.js?t=2" },
    ]);

    expect(importPackage).toHaveBeenCalledTimes(2);
    expect(loader.models.map((m) => m.documentModel.global.id)).toEqual([
      "test/p",
    ]);
  });
});
