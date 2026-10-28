import { describe, expect, it } from "vitest";
import { previousVersionPath } from "./source-files.js";

describe("previousVersionPath", () => {
  it("points a versioned file at the version before it", () => {
    expect(
      previousVersionPath("/p/document-models/doc/v2/tests/a.test.ts", 2),
    ).toBe("/p/document-models/doc/v1/tests/a.test.ts");
  });

  it("reads a Windows path", () => {
    expect(
      previousVersionPath("D:\\p\\document-models\\doc\\v3\\src\\a.ts", 3),
    ).toBe("D:\\p\\document-models\\doc\\v2\\src\\a.ts");
  });
});
