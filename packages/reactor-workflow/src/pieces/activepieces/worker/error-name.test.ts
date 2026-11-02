import { describe, expect, it } from "vitest";
import { errorName } from "./entry.js";

describe("errorName", () => {
  it("prefers the error's own name over a minified class name", () => {
    class mc extends Error {
      override name = "AI_APICallError";
    }
    expect(errorName(new mc("boom"), undefined)).toBe("AI_APICallError");
  });

  it("falls back to the class name when the name is the default", () => {
    class HttpError extends Error {}
    expect(errorName(new HttpError("boom"), undefined)).toBe("HttpError");
    expect(errorName("text", "Formatted")).toBe("Formatted");
  });
});
