import { describe, it, expect, beforeEach } from "vitest";
import type { OperationWithContext } from "@powerhousedao/reactor";
import { DocumentCountReadModel } from "./document-count-read-model.js";

function makeOp(
  documentType: string,
  documentId = "doc-1",
  ordinal = 0,
): OperationWithContext {
  return {
    operation: {
      id: "op-1",
      index: 0,
      skip: 0,
      timestampUtcMs: String(Date.now()),
      hash: "abc",
      action: {
        id: "act-1",
        type: "SOME_ACTION",
        timestampUtcMs: String(Date.now()),
        input: {},
        scope: "global",
      },
    },
    context: {
      documentId,
      documentType,
      scope: "global",
      branch: "main",
      ordinal,
    },
  };
}

describe("DocumentCountReadModel", () => {
  let readModel: DocumentCountReadModel;

  beforeEach(() => {
    readModel = new DocumentCountReadModel();
  });

  it("counts operations by document type", async () => {
    await readModel.indexOperations([
      makeOp("powerhouse/budget"),
      makeOp("powerhouse/budget"),
      makeOp("powerhouse/scope"),
    ]);

    expect(readModel.getCount("powerhouse/budget")).toBe(2);
    expect(readModel.getCount("powerhouse/scope")).toBe(1);
  });

  it("accumulates across multiple indexOperations calls", async () => {
    await readModel.indexOperations([makeOp("powerhouse/budget")]);
    await readModel.indexOperations([makeOp("powerhouse/budget")]);
    await readModel.indexOperations([makeOp("powerhouse/scope")]);

    expect(readModel.getCount("powerhouse/budget")).toBe(2);
    expect(readModel.getCount("powerhouse/scope")).toBe(1);
  });

  it("returns 0 for unknown document types", () => {
    expect(readModel.getCount("unknown/type")).toBe(0);
  });

  it("returns all counts via getCounts()", async () => {
    await readModel.indexOperations([
      makeOp("type/a"),
      makeOp("type/b"),
      makeOp("type/a"),
    ]);

    const counts = readModel.getCounts();
    expect(counts.get("type/a")).toBe(2);
    expect(counts.get("type/b")).toBe(1);
    expect(counts.size).toBe(2);
  });

  it("resets on clear()", async () => {
    await readModel.indexOperations([makeOp("type/a")]);
    expect(readModel.getCount("type/a")).toBe(1);

    readModel.clear();
    expect(readModel.getCount("type/a")).toBe(0);
    expect(readModel.getCounts().size).toBe(0);
  });

  it("handles empty operations array", async () => {
    await readModel.indexOperations([]);
    expect(readModel.getCounts().size).toBe(0);
  });

  it("tracks different documents of the same type", async () => {
    await readModel.indexOperations([
      makeOp("powerhouse/budget", "doc-1"),
      makeOp("powerhouse/budget", "doc-2"),
    ]);

    // Counts are per-type, not per-document
    expect(readModel.getCount("powerhouse/budget")).toBe(2);
  });
});
