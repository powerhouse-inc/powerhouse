import { describe, expect, it } from "vitest";
import { WorkerPackageLoader } from "../../src/rpc/worker-package-loader.js";

function fakeModel(id: string) {
  return { documentModel: { global: { id } }, reducer: () => undefined };
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
    });
    await loader.loadPackages(["pkg"]);
    const module = await loader.load("powerhouse/document-drive");
    expect(module.documentModel.global.id).toBe("powerhouse/document-drive");
    await expect(loader.load("does/not-exist")).rejects.toThrow(
      "Document model not loaded",
    );
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
