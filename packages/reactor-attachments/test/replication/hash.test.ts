import { afterEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "../../src/replication/hash.js";

const EMPTY =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

describe("sha256Hex", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("digests an ArrayBuffer-backed view in place", async () => {
    const digest = vi.spyOn(globalThis.crypto.subtle, "digest");
    const bytes = new Uint8Array(0);

    expect(await sha256Hex(bytes)).toBe(EMPTY);
    expect(digest.mock.calls[0][1]).toBe(bytes);
  });

  it("copies a SharedArrayBuffer-backed view before digesting", async () => {
    const digest = vi.spyOn(globalThis.crypto.subtle, "digest");
    const bytes = new Uint8Array(new SharedArrayBuffer(0));

    expect(await sha256Hex(bytes)).toBe(EMPTY);
    const passed = digest.mock.calls[0][1] as Uint8Array;
    expect(passed).not.toBe(bytes);
    expect(passed.buffer).toBeInstanceOf(ArrayBuffer);
  });
});
