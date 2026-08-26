import { describe, expect, it } from "vitest";
import { z } from "zod";
import { generateMock as deprecatedGenerateMock } from "./utils.js";
import { generateMock } from "./mock.js";

describe("generateMock barrel stub", () => {
  it("throws with the new import path", () => {
    expect(() => deprecatedGenerateMock(z.object({}))).toThrow(
      /document-model\/mock/,
    );
  });

  it("is not the real implementation", () => {
    expect(deprecatedGenerateMock).not.toBe(generateMock);
    expect(() => generateMock(z.object({ a: z.string() }))).not.toThrow();
  });
});
