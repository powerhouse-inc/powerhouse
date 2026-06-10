import type { IReactorClient, PagedResults } from "@powerhousedao/reactor";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import { describe, expect, it, vi } from "vitest";
import { createGetParentIdsFn } from "../src/services/get-parent-ids.js";

function mockDocument(id: string): PHDocument {
  return { header: { id } } as PHDocument;
}

describe("createGetParentIdsFn", () => {
  it("resolves parents from incoming child relationships", async () => {
    const getIncomingRelationships = vi.fn().mockResolvedValue({
      results: [mockDocument("parent-1"), mockDocument("parent-2")],
      options: { limit: 10, cursor: "" },
    } as PagedResults<PHDocument>);
    const reactorClient = {
      getIncomingRelationships,
    } as unknown as IReactorClient;

    const getParentIds = createGetParentIdsFn(reactorClient);

    expect(await getParentIds("child-doc")).toEqual(["parent-1", "parent-2"]);
    expect(getIncomingRelationships).toHaveBeenCalledWith("child-doc", "child");
  });

  it("resolves to no parents when the relationship lookup fails", async () => {
    const reactorClient = {
      getIncomingRelationships: vi.fn().mockRejectedValue(new Error("down")),
    } as unknown as IReactorClient;

    const getParentIds = createGetParentIdsFn(reactorClient);

    expect(await getParentIds("child-doc")).toEqual([]);
  });
});
