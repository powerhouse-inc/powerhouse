// `multioption` hands `from` the raw values it collected, so a single
// `--document-types "a,b"` arrives as one string that has to be split.

import { describe, expect, it } from "vitest";
import {
  CommaSeparatedStrings,
  splitCommaSeparated,
} from "../src/utils/comma-separated.js";

describe("splitCommaSeparated", () => {
  it("splits a comma-separated value into one entry per item", () => {
    expect(
      splitCommaSeparated(["pfnur/rto-company,pfnur/toll-statement"]),
    ).toEqual(["pfnur/rto-company", "pfnur/toll-statement"]);
  });

  it("leaves repeated options untouched", () => {
    expect(splitCommaSeparated(["a/one", "b/two"])).toEqual(["a/one", "b/two"]);
  });

  it("trims whitespace and drops empty entries", () => {
    expect(splitCommaSeparated([" a/one , ,b/two,"])).toEqual([
      "a/one",
      "b/two",
    ]);
    expect(splitCommaSeparated([])).toEqual([]);
  });
});

describe("CommaSeparatedStrings", () => {
  it("parses both comma-separated and repeated values", async () => {
    await expect(CommaSeparatedStrings.from(["a,b"])).resolves.toEqual([
      "a",
      "b",
    ]);
    await expect(CommaSeparatedStrings.from(["a", "b"])).resolves.toEqual([
      "a",
      "b",
    ]);
  });
});
