import {
  parseFilterValues,
  renderProcessorFilter,
} from "@powerhousedao/codegen/templates";
import { describe, expect, it } from "bun:test";

describe("parseFilterValues", () => {
  it("splits a comma-separated value into one entry per document type", () => {
    expect(
      parseFilterValues(["pfnur/rto-company,pfnur/toll-statement"]),
    ).toEqual(["pfnur/rto-company", "pfnur/toll-statement"]);
  });

  it("treats a repeated option the same as a comma-separated one", () => {
    expect(parseFilterValues(["a/one", "b/two"])).toEqual(["a/one", "b/two"]);
    expect(parseFilterValues(["a/one,b/two"])).toEqual(["a/one", "b/two"]);
  });

  it("trims whitespace and drops empty entries", () => {
    expect(parseFilterValues([" a/one , , b/two,"])).toEqual([
      "a/one",
      "b/two",
    ]);
  });

  it("returns an empty list for no values", () => {
    expect(parseFilterValues([])).toEqual([]);
    expect(parseFilterValues(undefined)).toEqual([]);
    expect(parseFilterValues([""])).toEqual([]);
  });
});

describe("renderProcessorFilter", () => {
  it("omits empty fields instead of emitting a wildcard that matches nothing", () => {
    const filter = renderProcessorFilter({
      branch: ["main"],
      documentId: ["*"],
      documentType: [],
      scope: [],
    });

    expect(filter).toContain(`branch: ["main"],`);
    expect(filter).toContain(`documentId: ["*"],`);
    expect(filter).not.toContain("documentType");
    expect(filter).not.toContain("scope");
  });

  it("renders an empty object when every field is empty", () => {
    expect(renderProcessorFilter({})).toBe("{}");
  });

  it("renders a comma-separated document type list as separate entries", () => {
    expect(renderProcessorFilter({ documentType: ["a/one,b/two"] })).toContain(
      `documentType: ["a/one", "b/two"],`,
    );
  });
});
