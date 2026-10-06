import { describe, expect, it } from "vitest";
import {
  extractDocumentModels,
  isDocumentModelModule,
} from "../src/packages/document-model-detection.js";

// One fixture table for the one rule all three loaders now share. Before
// the unification the http loader required documentModel to be non-null
// while the import and vite loaders accepted the bare key, so the rows
// below are exactly the shapes the loaders used to disagree on.
describe("document-model module acceptance", () => {
  const model = { documentModel: { id: "test/doc" }, reducers: {} };

  const rows: Array<{ name: string; value: unknown; accepted: boolean }> = [
    { name: "a module with a documentModel", value: model, accepted: true },
    {
      name: "a module whose documentModel is null",
      value: { documentModel: null },
      accepted: false,
    },
    {
      name: "a module whose documentModel is undefined",
      value: { documentModel: undefined },
      accepted: false,
    },
    { name: "null", value: null, accepted: false },
    { name: "a string", value: "documentModel", accepted: false },
    {
      name: "an object without the key",
      value: { reducers: {} },
      accepted: false,
    },
    {
      name: "an aggregate export such as upgradeManifests",
      value: [{ fromVersion: 1 }],
      accepted: false,
    },
  ];

  for (const row of rows) {
    it(`${row.accepted ? "accepts" : "rejects"} ${row.name}`, () => {
      expect(isDocumentModelModule(row.value)).toBe(row.accepted);
    });
  }

  it("collects only the accepted shapes from a namespace", () => {
    const namespace: Record<string, unknown> = Object.fromEntries(
      rows.map((row, index) => [`export${index}`, row.value]),
    );

    expect(extractDocumentModels(namespace)).toEqual([model]);
  });
});
