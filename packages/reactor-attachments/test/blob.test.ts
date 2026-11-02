import { describe, expect, it } from "vitest";
import { blobStream, isBlob } from "../src/blob.js";

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

describe("blobStream", () => {
  it("delivers every byte in order, in slices of the given size", async () => {
    const reader = blobStream(new Blob(["abcdefg"]), 3).getReader();
    const chunks: string[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(new TextDecoder().decode(value));
    }
    expect(chunks).toEqual(["abc", "def", "g"]);
  });

  it("closes at once on an empty blob", async () => {
    const { done } = await blobStream(new Blob([])).getReader().read();
    expect(done).toBe(true);
  });

  it("reads nothing until asked, so an unread stream costs nothing", async () => {
    const blob = new Blob(["abc"]);
    let slices = 0;
    const slice = blob.slice.bind(blob);
    blob.slice = (...args) => {
      slices += 1;
      return slice(...args);
    };

    const stream = blobStream(blob);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(slices).toBe(0);

    await stream.getReader().read();
    expect(slices).toBe(1);
  });
});
