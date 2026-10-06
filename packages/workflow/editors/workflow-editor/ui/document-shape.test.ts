import { describe, expect, it } from "vitest";
import { documentShape, stateFieldsFromSdl } from "./document-shape.js";

describe("stateFieldsFromSdl", () => {
  it("roots at the model's state type and nests its object types", async () => {
    const fields = await stateFieldsFromSdl({
      name: "Invoice",
      schema: `
type AddressState { street: String! }
type InvoiceState { total: Float!, billTo: AddressState, tags: [String!]! }
`,
    });
    expect(fields).toEqual({
      total: "Float!",
      billTo: { street: "String!" },
      tags: "[String!]!",
    });
  });

  it("gives no fields for a missing or broken schema", async () => {
    expect(await stateFieldsFromSdl({ name: "X", schema: null })).toEqual({});
    expect(await stateFieldsFromSdl({ name: "X", schema: "type {" })).toEqual(
      {},
    );
  });
});

describe("documentShape", () => {
  it("fills the header from the reference", () => {
    const shape = documentShape(
      {
        documentId: "d1",
        documentType: "acme/invoice",
        branch: "main",
        revision: { global: 2 },
      },
      { total: "Float!" },
    );
    expect(shape).toMatchObject({
      header: {
        id: "d1",
        documentType: "acme/invoice",
        branch: "main",
        revision: { global: 2 },
      },
      state: { global: { total: "Float!" } },
    });
  });
});
