import { describe, expect, it } from "vitest";
import { createTestRelationalDb } from "../../test/helpers/pglite.js";
import { WorkflowRunStore } from "./store.js";

describe("run documents", () => {
  it("keeps each document a run was handed once, per run", async () => {
    const store = await WorkflowRunStore.create(createTestRelationalDb());

    await store.recordRunDocuments("docs-run-a", ["doc-1", "doc-2", "doc-1"]);
    await store.recordRunDocuments("docs-run-a", ["doc-2"]);
    await store.recordRunDocuments("docs-run-b", ["doc-3"]);
    await store.recordRunDocuments("docs-run-b", []);

    expect((await store.getRunDocuments("docs-run-a")).sort()).toEqual([
      "doc-1",
      "doc-2",
    ]);
    expect(await store.getRunDocuments("docs-run-b")).toEqual(["doc-3"]);
    expect(await store.getRunDocuments("docs-run-c")).toEqual([]);
  });
});
