import { describe, expect, it } from "vitest";
import { WorkerPackageLoader } from "../../src/rpc/worker-package-loader.js";

function fakeModel(id: string, version?: number) {
  return {
    documentModel: { global: { id } },
    reducer: () => undefined,
    ...(version === undefined ? {} : { version }),
  };
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
});
