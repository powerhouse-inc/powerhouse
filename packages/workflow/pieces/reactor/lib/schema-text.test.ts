import { describe, expect, it } from "vitest";
import { folderOptions, withReferencedEnums } from "./schema-text.js";

describe("folderOptions", () => {
  it("lists only folders, labelled by their path", () => {
    const state = {
      nodes: [
        { id: "f1", name: "Invoices", kind: "folder", parentFolder: null },
        { id: "f2", name: "2026", kind: "folder", parentFolder: "f1" },
        { id: "f3", name: "2026", kind: "folder", parentFolder: "f4" },
        { id: "f4", name: "Orders", kind: "folder" },
        { id: "d1", name: "Q1.pdf", kind: "file", parentFolder: "f2" },
      ],
    };
    expect(folderOptions(state)).toEqual([
      { label: "Invoices", value: "f1" },
      { label: "Invoices / 2026", value: "f2" },
      { label: "Orders", value: "f4" },
      { label: "Orders / 2026", value: "f3" },
    ]);
  });

  it("survives a parent cycle and state without nodes", () => {
    const cyclic = {
      nodes: [
        { id: "a", name: "A", kind: "folder", parentFolder: "b" },
        { id: "b", name: "B", kind: "folder", parentFolder: "a" },
      ],
    };
    expect(folderOptions(cyclic).map((option) => option.label)).toEqual([
      "A / B",
      "B / A",
    ]);
    expect(folderOptions(undefined)).toEqual([]);
  });
});

describe("withReferencedEnums", () => {
  const input = `input AddStepRetryPolicyInput {
    backoff: BackoffKind!
    retryOn: [String!]!
}

input AddStepInput {
    retry: AddStepRetryPolicyInput
    mode: [RunMode!]
}`;
  const state = `enum BackoffKind {
  FIXED
  EXPONENTIAL
}

enum RunMode {
  AUTO
  MANUAL
}

enum Unused {
  X
}`;

  it("appends the enums the input references, and only those", () => {
    const sdl = withReferencedEnums(input, state);
    expect(sdl).toContain("enum BackoffKind {");
    expect(sdl).toContain("enum RunMode {");
    expect(sdl).not.toContain("enum Unused");
  });

  it("leaves the input alone without a state schema", () => {
    expect(withReferencedEnums(input, null)).toBe(input);
  });
});
