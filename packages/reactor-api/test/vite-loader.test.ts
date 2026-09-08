import type { ViteDevServer } from "vite";
import { describe, expect, it, vi } from "vitest";
import { VitePackageLoader } from "../src/packages/vite-loader.mjs";

function model(id: string, version?: number) {
  return {
    documentModel: { global: { id } },
    reducer: () => undefined,
    ...(version === undefined ? {} : { version }),
  };
}

function manifest(documentType: string) {
  return {
    documentType,
    latestVersion: 2,
    supportedVersions: [1, 2],
    upgrades: {
      v2: {
        toVersion: 2,
        upgradeReducer: (document: unknown) => document,
      },
    },
  };
}

function loaderWith(ssrLoadModule: ViteDevServer["ssrLoadModule"]) {
  return new VitePackageLoader({ ssrLoadModule } as ViteDevServer);
}

describe("VitePackageLoader", () => {
  it("keeps Vite's shallow truthy-documentModel predicate", async () => {
    const v1 = model("test/model", 1);
    const v2 = model("test/model", 2);
    const loader = loaderWith(
      vi.fn(() =>
        Promise.resolve({
          documentModels: [v1, v2],
          duplicateV1: v1,
          notAModel: { documentModel: true },
        }),
      ),
    );

    await expect(loader.loadDocumentModels("package", true)).resolves.toEqual([
      v1,
      { documentModel: true },
    ]);
  });

  it("ignores a genuinely missing standalone manifest entry", async () => {
    const missing = Object.assign(
      new Error(
        "Failed to load url package/document-models/upgrade-manifests (resolved id: package/document-models/upgrade-manifests). Does the file exist?",
      ),
      { code: "ERR_LOAD_URL" },
    );
    const ssrLoadModule = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(missing);
    const loader = loaderWith(ssrLoadModule);

    await expect(loader.loadUpgradeManifests("package")).resolves.toEqual([]);
  });

  it("propagates standalone manifest evaluation errors", async () => {
    const evaluationError = new Error("migration module crashed");
    const ssrLoadModule = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(evaluationError);
    const loader = loaderWith(ssrLoadModule);

    await expect(loader.loadUpgradeManifests("package")).rejects.toBe(
      evaluationError,
    );
  });

  it("propagates missing nested imports", async () => {
    const missingDependency = Object.assign(
      new Error(
        "Failed to load url ./missing-dependency (resolved id: ./missing-dependency) in package/document-models/upgrade-manifests. Does the file exist?",
      ),
      { code: "ERR_LOAD_URL" },
    );
    const ssrLoadModule = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(missingDependency);
    const loader = loaderWith(ssrLoadModule);

    await expect(loader.loadUpgradeManifests("package")).rejects.toBe(
      missingDependency,
    );
  });

  it("does not hide aggregate evaluation errors with the standalone fallback", async () => {
    const evaluationError = new Error("aggregate module crashed");
    const ssrLoadModule = vi
      .fn()
      .mockRejectedValueOnce(evaluationError)
      .mockResolvedValueOnce({});
    const loader = loaderWith(ssrLoadModule);

    await expect(loader.loadUpgradeManifests("package")).rejects.toBe(
      evaluationError,
    );
    expect(ssrLoadModule).toHaveBeenCalledTimes(1);
  });

  it("loads a valid standalone manifest when the aggregate has none", async () => {
    const upgradeManifest = manifest("test/model");
    const ssrLoadModule = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ upgradeManifests: [upgradeManifest] });
    const loader = loaderWith(ssrLoadModule);

    await expect(loader.loadUpgradeManifests("package")).resolves.toEqual([
      upgradeManifest,
    ]);
  });
});
