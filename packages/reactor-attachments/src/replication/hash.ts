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
  // Copied into a view WebCrypto accepts: `BufferSource` excludes a
  // SharedArrayBuffer-backed Uint8Array, which `Uint8Array` alone permits.
  const view = new Uint8Array(bytes.byteLength);
  view.set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", view);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
