import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { getUniqueDocumentModels } from "../src/packages/package-manager.js";

function fakeModule(id: string, version?: number): DocumentModelModule {
  return {
    ...(version === undefined ? {} : { version }),
    documentModel: { global: { id } },
    reducer: () => undefined,
    actions: {},
    utils: {},
  } as unknown as DocumentModelModule;
}

describe("getUniqueDocumentModels", () => {
  it("keeps every version of a versioned document type", () => {
    const models = getUniqueDocumentModels([
      fakeModule("test/versioned", 1),
      fakeModule("test/versioned", 2),
    ]);

    expect(models.map((m) => m.version).sort()).toEqual([1, 2]);
  });

  it("dedupes the same (type, version) across lists, last wins", () => {
    const first = fakeModule("test/versioned", 1);
    const second = fakeModule("test/versioned", 1);
    const models = getUniqueDocumentModels([first], [second]);

    expect(models).toHaveLength(1);
    expect(models[0]).toBe(second);
  });

  it("treats an unversioned module as version 1", () => {
    const models = getUniqueDocumentModels([
      fakeModule("test/versioned"),
      fakeModule("test/versioned", 1),
      fakeModule("test/versioned", 2),
    ]);

    expect(models).toHaveLength(2);
    expect(models.map((m) => m.version ?? 1).sort()).toEqual([1, 2]);
  });
});
