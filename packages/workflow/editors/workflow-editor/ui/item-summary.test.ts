import { describe, expect, it } from "vitest";
import type { BlockFormProp } from "./forms.js";
import { addItemLabel, itemSummary } from "./PropertyForm.js";

const fields: BlockFormProp[] = [
  { name: "name", displayName: "Name", type: "SHORT_TEXT", required: true },
  {
    name: "description",
    displayName: "Description",
    type: "LONG_TEXT",
    required: false,
  },
  {
    name: "type",
    displayName: "Data type",
    type: "STATIC_DROPDOWN",
    required: true,
    staticOptions: [
      { label: "Text", value: "string" },
      { label: "Number", value: "number" },
    ],
  },
  {
    name: "isRequired",
    displayName: "Required",
    type: "CHECKBOX",
    required: false,
  },
];

describe("itemSummary", () => {
  it("lists the filled values, option labels and set switches", () => {
    expect(
      itemSummary(fields, {
        name: "vendor",
        description: "Who issued the invoice",
        type: "string",
        isRequired: true,
      }),
    ).toBe("vendor · Who issued the invoice · Text · required");
  });

  it("skips empty values and unset switches", () => {
    expect(
      itemSummary(fields, {
        name: "total",
        description: " ",
        isRequired: false,
      }),
    ).toBe("total");
    expect(itemSummary(fields, {})).toBe("");
  });

  it("cuts a long value", () => {
    const summary = itemSummary(fields, { description: "x".repeat(100) });
    expect(summary).toBe(`${"x".repeat(60)}…`);
  });
});

describe("addItemLabel", () => {
  it.each([
    ["Branches", "Add branch"],
    ["Headers", "Add header"],
    ["Addresses", "Add address"],
    ["Properties", "Add property"],
    ["Inputs", "Add input"],
    ["Responses", "Add response"],
    ["Boxes", "Add box"],
    ["Allowed values", "Add item"],
    ["Address", "Add item"],
    ["Data", "Add item"],
  ])("%s adds %s", (name, label) => {
    expect(addItemLabel(name)).toBe(label);
  });
});
