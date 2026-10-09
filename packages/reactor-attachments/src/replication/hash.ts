import type { AttachmentHash } from "@powerhousedao/reactor";

/**
 * Lowercase SHA-256 hex of `bytes` -- the `attachment://v1:` hash format
 * (`packages/reactor/src/attachments/types.ts`).
 *
 * WebCrypto, so the same code runs in Node and in a browser realm. There is no
 * streaming digest in WebCrypto, which is why verification happens over
 * collected bytes.
 */
export async function sha256Hex(bytes: Uint8Array): Promise<AttachmentHash> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    digestable(bytes),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** WebCrypto refuses a SharedArrayBuffer-backed view, so only that one is copied. */
function digestable(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  if (
    typeof SharedArrayBuffer !== "undefined" &&
    bytes.buffer instanceof SharedArrayBuffer
  ) {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy;
  }
  return bytes as Uint8Array<ArrayBuffer>;
}
