import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { selectCreatableModules } from "./select-creatable-modules.js";

function makeModule(id: string, version: number): DocumentModelModule {
  return {
    version,
    documentModel: { global: { id } },
  } as unknown as DocumentModelModule;
}

const invoiceV1 = makeModule("test/invoice", 1);
const invoiceV2 = makeModule("test/invoice", 2);
const noteV1 = makeModule("test/note", 1);

describe("selectCreatableModules", () => {
  it("keeps only the latest version of each type outside studio mode", () => {
    const result = selectCreatableModules(
      [invoiceV1, invoiceV2, noteV1],
      false,
    );
    expect(result).toEqual([invoiceV2, noteV1]);
  });

  it("is order-independent when picking the latest version", () => {
    const result = selectCreatableModules(
      [invoiceV2, noteV1, invoiceV1],
      false,
    );
    expect(result).toContain(invoiceV2);
    expect(result).not.toContain(invoiceV1);
  });

  it("keeps every version in studio mode", () => {
    const result = selectCreatableModules([invoiceV1, invoiceV2, noteV1], true);
    expect(result).toEqual([invoiceV1, invoiceV2, noteV1]);
  });

  it("returns an empty list for no modules", () => {
    expect(selectCreatableModules([], false)).toEqual([]);
  });
});
