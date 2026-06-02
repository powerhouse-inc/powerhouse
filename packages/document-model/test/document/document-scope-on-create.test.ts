import {
  baseLoadFromInput,
  createZip,
  documentModelReducer,
  validateOperations,
} from "@powerhousedao/shared/document-model";
import { documentModelCreateDocument } from "../../index.js";
import { describe, expect, it } from "vitest";

describe("document-scope operations on create", () => {
  it("seeds CREATE_DOCUMENT + UPGRADE_DOCUMENT capturing initial state", () => {
    const doc = documentModelCreateDocument();
    const ops = doc.operations.document ?? [];

    expect(ops.map((op) => op.action.type)).toEqual([
      "CREATE_DOCUMENT",
      "UPGRADE_DOCUMENT",
    ]);
    expect(ops.map((op) => op.index)).toEqual([0, 1]);
    expect(ops.every((op) => op.skip === 0)).toBe(true);
    expect(validateOperations(doc.operations)).toHaveLength(0);

    const upgrade = ops.find((op) => op.action.type === "UPGRADE_DOCUMENT");
    const input = upgrade?.action.input as { initialState?: unknown };
    expect(input.initialState).toBeDefined();
  });

  it("exports the document scope into the zip and reloads it", async () => {
    const doc = documentModelCreateDocument();
    const zipped = await createZip(doc);
    const reloaded = await baseLoadFromInput(zipped, documentModelReducer);

    expect(Object.keys(reloaded.operations)).toContain("document");
    expect(reloaded.operations.document).toHaveLength(2);
    expect(reloaded.state.global.id).toBe(doc.state.global.id);
  });
});
