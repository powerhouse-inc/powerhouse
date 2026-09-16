import { describe, expect, it, vi } from "vitest";
import { PackageManager } from "../../src/packages/package-manager.js";
import type { IPackageLoader } from "../../src/packages/types.js";

const WORKFLOW_PACKAGE = "@powerhousedao/workflow";

// Enough of a document model module for the shape check the loader applies.
const model = (id: string) => ({
  documentModel: { global: { id } },
  reducer: () => undefined,
});

// No packages to load, so no loader is ever consulted.
const noLoaders: IPackageLoader[] = [];

function managerWith(options: {
  workflows?: boolean;
  workflowDocumentModels?: () => Promise<Record<string, unknown>>;
}) {
  return new PackageManager(noLoaders, { packages: [], ...options });
}

describe("PackageManager with workflows", () => {
  it("never calls the loader when workflows are off", async () => {
    const load = vi.fn();
    const manager = managerWith({
      workflows: false,
      workflowDocumentModels: load,
    });

    const result = await manager.init();

    expect(load).not.toHaveBeenCalled();
    expect(
      result.documentModels.map((m) => m.documentModel.global.id),
    ).not.toContain("powerhouse/workflow");
  });

  it("registers the package's document models when workflows are on", async () => {
    const load = vi.fn(() =>
      Promise.resolve({
        workflowDocumentModelModule: model("powerhouse/workflow"),
        connectionDocumentModelModule: model("powerhouse/connection"),
        // Not a document model module; the shape check drops it.
        documentModels: [],
      }),
    );
    const manager = managerWith({
      workflows: true,
      workflowDocumentModels: load,
    });

    const result = await manager.init();

    expect(load).toHaveBeenCalledTimes(1);
    const ids = result.documentModels.map((m) => m.documentModel.global.id);
    expect(ids).toContain("powerhouse/workflow");
    expect(ids).toContain("powerhouse/connection");
  });

  it("fails loudly, naming the package, when it cannot be loaded", async () => {
    const cause = new Error("ERR_MODULE_NOT_FOUND");
    const manager = managerWith({
      workflows: true,
      workflowDocumentModels: () => Promise.reject(cause),
    });

    await expect(manager.init()).rejects.toThrow(
      new RegExp(`workflows are enabled but ${WORKFLOW_PACKAGE} `),
    );
    await expect(
      managerWith({
        workflows: true,
        workflowDocumentModels: () => Promise.reject(cause),
      }).init(),
    ).rejects.toMatchObject({ cause });
  });
});
