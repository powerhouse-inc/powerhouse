import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpPackageLoader } from "../src/packages/http-loader.js";

function manifest(documentType = "test/model") {
  return {
    documentType,
    latestVersion: 1,
    supportedVersions: [1],
    upgrades: {},
  };
}

describe("HttpPackageLoader", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("reads manifests only from the aggregate document-model entry", async () => {
    const upgradeManifest = manifest();
    const importPackage = vi.fn(() =>
      Promise.resolve({ upgradeManifests: [upgradeManifest] }),
    );
    const loader = new HttpPackageLoader({
      registryUrl: "https://registry.example",
      importPackage,
    });

    await expect(loader.loadUpgradeManifests("test-package")).resolves.toEqual([
      upgradeManifest,
    ]);
    expect(importPackage).toHaveBeenCalledTimes(1);
    expect(importPackage).toHaveBeenCalledWith(
      "https://registry.example/-/cdn/test-package/node/document-models/index.mjs",
    );
  });

  it("propagates aggregate entry evaluation failures", async () => {
    const evaluationError = new Error("aggregate bundle evaluation failed");
    const loader = new HttpPackageLoader({
      registryUrl: "https://registry.example",
      importPackage: () => Promise.reject(evaluationError),
    });

    await expect(loader.loadUpgradeManifests("test-package")).rejects.toBe(
      evaluationError,
    );
  });

  it.each([
    "../../escape",
    "test-package@../../escape",
    "test-package@tag?query",
    "test-package@tag#fragment",
    "test-package@bad\u0000tag",
  ])("rejects an unsafe package spec before importing: %j", async (spec) => {
    const importPackage = vi.fn(() => Promise.resolve({}));
    const loader = new HttpPackageLoader({
      registryUrl: "https://registry.example",
      importPackage,
    });

    await expect(loader.loadDocumentModels(spec)).rejects.toThrow("Invalid");
    expect(importPackage).not.toHaveBeenCalled();
  });

  it("rejects a sparse package list returned by discovery", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(Array<string>(1)),
        }),
      ),
    );
    const loader = new HttpPackageLoader({
      registryUrl: "https://registry.example",
      importPackage: () => Promise.resolve({}),
    });

    await expect(loader.documentModelLoader.load("test/model")).rejects.toThrow(
      "sparse package list",
    );
  });

  it("encodes a valid scoped package range as one safe CDN segment", async () => {
    const importPackage = vi.fn(() => Promise.resolve({}));
    const loader = new HttpPackageLoader({
      registryUrl: "https://registry.example",
      importPackage,
    });

    await expect(
      loader.loadDocumentModels("@scope/package@^1.2.3 || ~2.0.0"),
    ).resolves.toEqual([]);
    expect(importPackage).toHaveBeenCalledWith(
      "https://registry.example/-/cdn/@scope/package@%5E1.2.3%20%7C%7C%20~2.0.0/node/document-models/index.mjs",
    );
  });

  it.each([
    ["an object", { package: "test-package" }],
    ["a non-string entry", [42]],
    ["an unsafe spec", ["test-package@../../escape"]],
  ])("rejects %s returned by document-type discovery", async (_label, body) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(body),
        }),
      ),
    );
    const importPackage = vi.fn(() => Promise.resolve({}));
    const loader = new HttpPackageLoader({
      registryUrl: "https://registry.example",
      importPackage,
    });

    await expect(loader.documentModelLoader.load("test/model")).rejects.toThrow(
      "invalid package",
    );
    expect(importPackage).not.toHaveBeenCalled();
  });

  it("chooses discovered packages with a deterministic code-unit order", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(["pkg.z", "pkg-z"]),
        }),
      ),
    );
    const importPackage = vi.fn(() =>
      Promise.resolve({
        Model: {
          documentModel: { global: { id: "test/model" } },
          reducer: () => undefined,
        },
      }),
    );
    const loader = new HttpPackageLoader({
      registryUrl: "https://registry.example",
      importPackage,
    });

    await expect(
      loader.documentModelLoader.load("test/model"),
    ).resolves.toEqual(
      expect.objectContaining({
        documentModel: { global: { id: "test/model" } },
      }),
    );
    expect(importPackage).toHaveBeenCalledWith(
      "https://registry.example/-/cdn/pkg-z/node/document-models/index.mjs",
    );
  });
});
