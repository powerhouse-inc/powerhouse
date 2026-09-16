// Tests for the WorkerPackageLoader shared-deps path: with a sharedImports
// table the loader fetches the package source, rewrites shared/relative
// imports to absolute URLs, and blob-imports the result via importSource.
// Without a rewrite (or without sharedImports) the plain importPackage path
// is used untouched.

import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkerPackageLoader } from "../src/rpc/worker-package-loader.js";
import type { WorkerPackageLoaderOptions } from "../src/rpc/worker-package-loader.js";

const CDN = "https://cdn.example.com";
const PKG_URL = `${CDN}/@scope/pkg/browser/document-models/index.js`;
const VENDOR_DOC = `${CDN}/__vendor__/document-model.js`;

function fakeModule(id: string) {
  return {
    documentModel: { global: { id } },
    version: 1,
    reducer: (s: unknown) => s,
  };
}

function makeLoader(over: Partial<WorkerPackageLoaderOptions>) {
  return new WorkerPackageLoader({
    cdnUrl: CDN,
    importPackage: vi.fn().mockResolvedValue({ mod: fakeModule("doc-a") }),
    ...over,
  });
}

describe("WorkerPackageLoader shared-deps import path", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rewrites shared + relative imports and blob-imports via importSource", async () => {
    const source = [
      'import "document-model";',
      'import { x } from "./helper.js";',
      "export const mod = x;",
    ].join("\n");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => ({ text: () => Promise.resolve(source) })),
    );
    const importSource = vi
      .fn()
      .mockResolvedValue({ mod: fakeModule("doc-a") });
    const importPackage = vi.fn();
    const loader = makeLoader({
      sharedImports: { "document-model": VENDOR_DOC },
      importSource,
      importPackage,
    });
    await loader.loadPackages(["@scope/pkg"]);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(importSource).toHaveBeenCalledTimes(1);
    const rewritten = importSource.mock.calls[0][0] as string;
    expect(rewritten).toContain(VENDOR_DOC);
    expect(rewritten).toContain(
      `${CDN}/@scope/pkg/browser/document-models/helper.js`,
    );
    expect(importPackage).not.toHaveBeenCalled();
  });

  it("uses importPackage untouched when nothing was rewritten", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => ({ text: () => Promise.resolve("export {};") })),
    );
    const importSource = vi.fn();
    const importPackage = vi
      .fn()
      .mockResolvedValue({ mod: fakeModule("doc-a") });
    const loader = makeLoader({
      sharedImports: { "document-model": VENDOR_DOC },
      importPackage,
    });
    await loader.loadPackages(["@scope/pkg"]);

    expect(importPackage).toHaveBeenCalledWith(PKG_URL);
    expect(importSource).not.toHaveBeenCalled();
  });

  it("keeps the old behavior when sharedImports is absent (no fetch)", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const importPackage = vi
      .fn()
      .mockResolvedValue({ mod: fakeModule("doc-a") });
    const loader = makeLoader({ importPackage });
    await loader.loadPackages(["@scope/pkg"]);

    expect(fetch).not.toHaveBeenCalled();
    expect(importPackage).toHaveBeenCalledWith(PKG_URL);
  });

  it("records a load failure when importSource is missing but a rewrite would happen", async () => {
    const source = 'import "document-model";\nexport const mod = {};';
    vi.stubGlobal(
      "fetch",
      vi.fn(() => ({ text: () => Promise.resolve(source) })),
    );
    const importPackage = vi.fn();
    const loader = makeLoader({
      sharedImports: { "document-model": VENDOR_DOC },
      importPackage,
    });
    await loader.loadPackages(["@scope/pkg"]);

    expect(importPackage).not.toHaveBeenCalled();
    expect(loader.loadFailures).toHaveLength(1);
    expect(String(loader.loadFailures[0].error)).toContain(
      "importSource is required",
    );
  });
});
