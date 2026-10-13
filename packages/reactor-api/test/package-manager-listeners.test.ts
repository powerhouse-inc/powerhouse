import type { SubgraphClass } from "@powerhousedao/reactor-api";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import { PackageManager } from "../src/packages/package-manager.js";
import type { IPackageLoader } from "../src/packages/types.js";

function makeLoader(): IPackageLoader {
  return {
    name: "fake-loader",
    loadDocumentModels: () => Promise.resolve([] as DocumentModelModule[]),
    loadSubgraphs: () =>
      Promise.resolve([
        class extends BaseSubgraph {
          name = "alpha";
        },
      ] as SubgraphClass[]),
    loadProcessors: () => Promise.resolve(null),
    loadPieces: () => Promise.resolve([]),
  };
}

const nextMacrotask = () =>
  new Promise<void>((resolve) => setImmediate(resolve));

describe("PackageManager change listeners", () => {
  const unhandled: unknown[] = [];
  const capture = (reason: unknown) => {
    unhandled.push(reason);
  };

  beforeEach(() => {
    unhandled.length = 0;
    process.on("unhandledRejection", capture);
  });

  afterEach(() => {
    process.off("unhandledRejection", capture);
  });

  it("delivers every event to every listener when one throws or rejects", async () => {
    const manager = new PackageManager([makeLoader()], {
      packages: ["pkg-a"],
    });
    manager.onDocumentModelsChange(() => {
      throw new Error("document models listener failed");
    });
    manager.onDocumentModelsChange(() =>
      Promise.reject(new Error("document models listener rejected")),
    );
    const documentModels = vi.fn();
    manager.onDocumentModelsChange(documentModels);
    const subgraphs = vi.fn();
    manager.onSubgraphsChange(subgraphs);
    const processors = vi.fn();
    manager.onProcessorsChange(processors);
    const pieces = vi.fn();
    manager.onPiecesChange(pieces);

    await expect(manager.init()).resolves.toBeDefined();
    await nextMacrotask();

    expect(documentModels).toHaveBeenCalledOnce();
    expect(subgraphs).toHaveBeenCalledOnce();
    expect(subgraphs.mock.calls[0][0].has("pkg-a")).toBe(true);
    expect(processors).toHaveBeenCalledOnce();
    expect(pieces).toHaveBeenCalledOnce();
    expect(unhandled).toEqual([]);
  });

  it("removes a package completely when a listener throws", async () => {
    const manager = new PackageManager([makeLoader()], {
      packages: ["pkg-a"],
    });
    await manager.init();
    manager.onSubgraphsChange(() => {
      throw new Error("subgraphs listener failed");
    });
    const processors = vi.fn();
    manager.onProcessorsChange(processors);
    const pieces = vi.fn();
    manager.onPiecesChange(pieces);

    expect(() => manager.removePackage("pkg-a")).not.toThrow();
    await nextMacrotask();

    expect(processors).toHaveBeenCalledOnce();
    expect(pieces).toHaveBeenCalledOnce();
    expect(unhandled).toEqual([]);
  });

  it("reports a listener's failure through reportError", async () => {
    const reportError = vi.fn();
    const failure = new Error("subgraphs listener failed");
    const manager = new PackageManager([makeLoader()], {
      packages: ["pkg-a"],
      reportError,
    });
    manager.onSubgraphsChange(() => Promise.reject(failure));

    await manager.init();
    await nextMacrotask();

    expect(reportError).toHaveBeenCalledExactlyOnceWith(failure);
  });
});
