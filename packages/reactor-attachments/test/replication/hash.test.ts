import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type BlobHashOptions,
  nodeSha256,
  sha256Hex,
  sha256HexOfBlob,
} from "../../src/replication/hash.js";

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

function patterned(size: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[i] = (i * 31 + (i >> 8)) & 0xff;
  return bytes;
}

// Each way a Blob can be hashed, all run here in Node.
const paths = {
  node: {},
  "browser, sliced through JavaScript": {
    native: () => undefined,
    oneShotMaxBytes: 0,
  },
  "browser, one WebCrypto call": { native: () => undefined },
} satisfies Record<string, BlobHashOptions>;

describe("sha256HexOfBlob", () => {
  it("finds node:crypto in Node", () => {
    expect(nodeSha256()).toBeDefined();
  });

  describe.each(Object.entries(paths))("%s", (_, path) => {
    it.each([
      [0, 7],
      [1, 7],
      [64, 64],
      [1000, 7],
      [1000, 1000],
      [4096, 1024],
      [100_003, 4096],
      [100_003, 1_000_000],
    ])(
      "equals the one-shot WebCrypto digest (%i bytes, %i-byte chunks)",
      async (size, chunkBytes) => {
        const bytes = patterned(size);
        expect(
          await sha256HexOfBlob(new Blob([bytes]), { ...path, chunkBytes }),
        ).toBe(await sha256Hex(bytes));
      },
    );

    it("equals the one-shot digest with the default chunk size", async () => {
      const bytes = patterned(9 * 1024 * 1024 + 5);
      expect(await sha256HexOfBlob(new Blob([bytes]), path)).toBe(
        await sha256Hex(bytes),
      );
    });
  });

  it.each([
    ["node", paths.node],
    [
      "the browser past oneShotMaxBytes",
      paths["browser, sliced through JavaScript"],
    ],
  ])(
    "reads the blob in slices of at most chunkBytes in %s",
    async (_, path) => {
      const blob = new Blob([patterned(10_000)]);
      const slice = vi.spyOn(blob, "slice");
      await sha256HexOfBlob(blob, { ...path, chunkBytes: 3000 });
      expect(slice.mock.calls).toEqual([
        [0, 3000],
        [3000, 6000],
        [6000, 9000],
        [9000, 12000],
      ]);
    },
  );

  it("reads a browser Blob up to oneShotMaxBytes whole, into WebCrypto", async () => {
    const blob = new Blob([patterned(10_000)]);
    const slice = vi.spyOn(blob, "slice");
    const digest = vi.spyOn(globalThis.crypto.subtle, "digest");
    await sha256HexOfBlob(blob, {
      native: () => undefined,
      oneShotMaxBytes: 10_000,
      chunkBytes: 3000,
    });
    expect(slice).not.toHaveBeenCalled();
    expect(digest).toHaveBeenCalledTimes(1);
    digest.mockRestore();
  });

  it("rejects a non-positive chunk size", async () => {
    await expect(
      sha256HexOfBlob(new Blob([]), { chunkBytes: 0 }),
    ).rejects.toThrow(RangeError);
  });

  it("stops between chunks once aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      sha256HexOfBlob(new Blob([patterned(10)]), {
        chunkBytes: 4,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });
});
