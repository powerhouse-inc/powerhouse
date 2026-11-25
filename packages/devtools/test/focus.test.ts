import { describe, expect, it } from "vitest";
import { modelFocus, parseModelFocus } from "../src/project/focus.js";

const TYPES = ["acme/invoice", "acme/invoice-line", "acme/customer"];
const parse = (id: string, types = TYPES) =>
  parseModelFocus({ kind: "model", id }, types);

describe("the document model focus", () => {
  it("reads the type, the version and the outline item", () => {
    expect(parse("acme/invoice")).toEqual({ documentType: "acme/invoice" });
    expect(parse("acme/invoice#op:ADD_LINE_ITEM")).toEqual({
      documentType: "acme/invoice",
      item: "op:ADD_LINE_ITEM",
    });
    expect(parse("acme/invoice@v2")).toEqual({
      documentType: "acme/invoice",
      version: 2,
    });
    expect(parse("acme/invoice@v1#state:global")).toEqual({
      documentType: "acme/invoice",
      version: 1,
      item: "state:global",
    });
  });

  it("does not take a type for another that starts the same", () => {
    expect(parse("acme/invoice-line#files")).toEqual({
      documentType: "acme/invoice-line",
      item: "files",
    });
  });

  it("reads a type that contains # or ends like a version whole", () => {
    const types = ["acme/a", "acme/a#b", "acme/a@v2"];
    expect(parse("acme/a#b", types)).toEqual({ documentType: "acme/a#b" });
    expect(parse("acme/a#b#types", types)).toEqual({
      documentType: "acme/a#b",
      item: "types",
    });
    expect(parse("acme/a@v2", types)).toEqual({ documentType: "acme/a@v2" });
    expect(parse("acme/a@v2@v3#files", types)).toEqual({
      documentType: "acme/a@v2",
      version: 3,
      item: "files",
    });
    expect(parse("acme/a@v3#op:X", types)).toEqual({
      documentType: "acme/a",
      version: 3,
      item: "op:X",
    });
  });

  it("names no model for a type the project does not have, or another focus", () => {
    expect(parse("acme/order#files")).toBeUndefined();
    expect(parse("acme/invoicex")).toBeUndefined();
    expect(
      parseModelFocus({ kind: "module", id: "acme/invoice" }, TYPES),
    ).toBeUndefined();
    expect(parseModelFocus(undefined, TYPES)).toBeUndefined();
  });

  it.each([
    { documentType: "acme/invoice" },
    { documentType: "acme/invoice", version: 2 },
    { documentType: "acme/invoice", item: "op:SET_STATUS" },
    { documentType: "acme/a#b", version: 1, item: "used-by" },
  ])("reads back what it wrote: %j", (selection) => {
    expect(
      parseModelFocus(modelFocus(selection), [
        ...TYPES,
        selection.documentType,
      ]),
    ).toEqual(selection);
  });
});
