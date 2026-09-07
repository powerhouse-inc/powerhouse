import { describe, expect, it } from "vitest";
import { flowPorts } from "./model.js";
import type { BlockForm } from "./forms.js";
import {
  isEmptyValue,
  missingForBlock,
  missingRequired,
} from "./validation.js";

const form: BlockForm = {
  title: "Send",
  requireAuth: true,
  auth: "required",
  props: [
    { name: "to", displayName: "To", type: "SHORT_TEXT", required: true },
    { name: "cc", displayName: "Cc", type: "ARRAY", required: false },
    { name: "tags", displayName: "Tags", type: "ARRAY", required: true },
    { name: "note", displayName: "Note", type: "MARKDOWN", required: true },
    {
      name: "mode",
      displayName: "Mode",
      type: "STATIC_DROPDOWN",
      required: true,
      defaultValue: "plain",
    },
  ],
};

describe("isEmptyValue", () => {
  it("treats blank strings, empty arrays and nullish as empty", () => {
    expect(isEmptyValue("")).toBe(true);
    expect(isEmptyValue("  ")).toBe(true);
    expect(isEmptyValue([])).toBe(true);
    expect(isEmptyValue(null)).toBe(true);
    expect(isEmptyValue(undefined)).toBe(true);
    expect(isEmptyValue(0)).toBe(false);
    expect(isEmptyValue(false)).toBe(false);
    expect(isEmptyValue({})).toBe(false);
    expect(isEmptyValue("{{steps.a.output}}")).toBe(false);
  });
});

describe("missingRequired", () => {
  it("lists required props without a value, honouring defaults", () => {
    expect(missingRequired(form.props, { to: "", tags: [] })).toEqual([
      "To",
      "Tags",
    ]);
    expect(missingRequired(form.props, { to: "a@b", tags: ["x"] })).toEqual([]);
    expect(missingRequired(form.props, "not an object")).toEqual([
      "To",
      "Tags",
    ]);
  });
});

describe("missingForBlock", () => {
  it("adds the connection first when the block requires one", () => {
    expect(missingForBlock(form, { to: "a@b" }, null)).toEqual([
      "Connection",
      "Tags",
    ]);
    expect(missingForBlock(form, { to: "a@b", tags: ["x"] }, "conn")).toEqual(
      [],
    );
  });

  it("treats loading or missing forms as complete", () => {
    expect(missingForBlock("loading", {}, null)).toEqual([]);
    expect(missingForBlock(null, {}, null)).toEqual([]);
    expect(missingForBlock(undefined, {}, null)).toEqual([]);
  });
});

describe("flowPorts", () => {
  it("gives a plain step one onward port", () => {
    expect(flowPorts("@activepieces/piece-discord@0.5.7#send_message")).toEqual(
      ["next"],
    );
  });

  it("gives a branch both outcomes", () => {
    expect(flowPorts("core#branch")).toEqual(["true", "false"]);
  });

  it("leaves the error route out", () => {
    expect(flowPorts("core#branch")).not.toContain("error");
    expect(flowPorts("core#assert")).not.toContain("error");
  });
});
