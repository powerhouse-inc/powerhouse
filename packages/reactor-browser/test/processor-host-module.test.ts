import type { IDocumentIndexer, IDocumentView } from "@powerhousedao/reactor";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { IProcessorHostModule } from "../src/types/processor-host-module.js";

describe("IProcessorHostModule.getReadModel", () => {
  // A single generic implementation must satisfy both overloads, as hosts do.
  const module: Pick<IProcessorHostModule, "getReadModel"> = {
    getReadModel<T>(name: string): T {
      return { name } as unknown as T;
    },
  };

  it("resolves reactor read models to their interface by name", () => {
    const view = module.getReadModel("document-view");
    expectTypeOf(view).toEqualTypeOf<IDocumentView>();
    expectTypeOf(
      module.getReadModel("document-indexer"),
    ).toEqualTypeOf<IDocumentIndexer>();
    expect(view).toEqual({ name: "document-view" });
  });

  it("keeps the caller-typed fallback for custom read models", () => {
    type Custom = { custom: true };
    expectTypeOf(module.getReadModel<Custom>("custom")).toEqualTypeOf<Custom>();
  });
});
