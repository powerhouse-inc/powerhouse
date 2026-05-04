import { describe, it, expect } from "vitest";
import type { AttachmentRef } from "@powerhousedao/reactor";
import { parseRef, createRef } from "../src/ref.js";
import { InvalidAttachmentRef } from "../src/errors.js";

describe("parseRef", () => {
  it("parses a v1 ref", () => {
    const result = parseRef("attachment://v1:abc123" as AttachmentRef);
    expect(result).toEqual({ version: 1, hash: "abc123" });
  });

  it("parses a multi-digit version", () => {
    const result = parseRef("attachment://v42:somehash" as AttachmentRef);
    expect(result).toEqual({ version: 42, hash: "somehash" });
  });

  it("throws InvalidAttachmentRef for empty string", () => {
    expect(() => parseRef("" as AttachmentRef)).toThrow(InvalidAttachmentRef);
  });

  it("throws InvalidAttachmentRef for missing version", () => {
    expect(() => parseRef("attachment://abc123" as AttachmentRef)).toThrow(
      InvalidAttachmentRef,
    );
  });

  it("throws InvalidAttachmentRef for non-matching prefix", () => {
    expect(() => parseRef("http://v1:abc123" as AttachmentRef)).toThrow(
      InvalidAttachmentRef,
    );
  });

  it("throws InvalidAttachmentRef for missing hash", () => {
    expect(() => parseRef("attachment://v1:" as AttachmentRef)).toThrow(
      InvalidAttachmentRef,
    );
  });
});

describe("createRef", () => {
  it("creates a v1 ref by default", () => {
    expect(createRef("abc123")).toBe("attachment://v1:abc123");
  });

  it("creates a ref with explicit version", () => {
    expect(createRef("abc123", 2)).toBe("attachment://v2:abc123");
  });

  it("round-trips with parseRef", () => {
    const hash = "deadbeef0123456789abcdef";
    const ref = createRef(hash);
    const parsed = parseRef(ref);
    expect(parsed).toEqual({ version: 1, hash });
  });
});
