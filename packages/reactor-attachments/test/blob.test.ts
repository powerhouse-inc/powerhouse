import { describe, expect, it } from "vitest";
import { isBlob } from "../src/blob.js";

describe("isBlob", () => {
  it("tells a Blob from a stream", () => {
    expect(isBlob(new Blob(["x"]))).toBe(true);
    expect(isBlob(new File(["x"], "x.txt"))).toBe(true);
    expect(isBlob(new Blob(["x"]).stream())).toBe(false);
  });

  it("accepts a Blob that fails instanceof, as one from another realm does", () => {
    const foreign = Object.setPrototypeOf(
      { size: 1, type: "", stream: () => new Blob(["x"]).stream() },
      null,
    ) as Blob;
    expect(foreign instanceof Blob).toBe(false);
    expect(isBlob(foreign)).toBe(true);
  });
});
