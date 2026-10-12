import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { AttachmentHash } from "@powerhousedao/reactor";

/** Bytes read per `Blob.slice` when hashing a Blob incrementally. */
export const DEFAULT_HASH_CHUNK_BYTES = 8 * 1024 * 1024;

/** Largest Blob a browser hashes in one native WebCrypto call; it is held in memory. */
export const ONE_SHOT_HASH_MAX_BYTES = 256 * 1024 * 1024;

/** An incremental SHA-256: WebCrypto has none, so these fill the gap. */
export type IncrementalSha256 = {
  update(bytes: Uint8Array): void;
  hex(): string;
};

type NodeCrypto = {
  createHash(algorithm: "sha256"): {
    update(bytes: Uint8Array): unknown;
    digest(encoding: "hex"): string;
  };
};

// A call, not an import, so browser bundles never see node:crypto.
const nodeCrypto = (
  globalThis as {
    process?: { getBuiltinModule?: (id: string) => unknown };
  }
).process?.getBuiltinModule?.("node:crypto") as NodeCrypto | undefined;

/** Native SHA-256 from node:crypto, or undefined outside Node. */
export function nodeSha256(): IncrementalSha256 | undefined {
  if (!nodeCrypto) return undefined;
  const hash = nodeCrypto.createHash("sha256");
  return {
    update: (bytes) => void hash.update(bytes),
    hex: () => hash.digest("hex"),
  };
}

/** SHA-256 in JavaScript, for browsers; about 10x slower than native. */
export function jsSha256(): IncrementalSha256 {
  const hash = sha256.create();
  return {
    update: (bytes) => void hash.update(bytes),
    hex: () => bytesToHex(hash.digest()),
  };
}

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

export type BlobHashOptions = {
  chunkBytes?: number;
  /** Without a native hasher: up to this size, one WebCrypto call over the whole Blob. */
  oneShotMaxBytes?: number;
  /** The native incremental hasher; defaults to node:crypto, absent in a browser. */
  native?: () => IncrementalSha256 | undefined;
  signal?: AbortSignal;
};

/** Same digest as `sha256Hex`, in bounded memory: natively in slices in Node, and in a
 * browser whole up to `oneShotMaxBytes`, then in JavaScript slices (no ~2 GB read). */
export async function sha256HexOfBlob(
  blob: Blob,
  options?: BlobHashOptions,
): Promise<AttachmentHash> {
  const chunkBytes = options?.chunkBytes ?? DEFAULT_HASH_CHUNK_BYTES;
  if (!Number.isInteger(chunkBytes) || chunkBytes <= 0) {
    throw new RangeError("chunkBytes must be a positive integer");
  }
  options?.signal?.throwIfAborted();
  let hasher = (options?.native ?? nodeSha256)();
  if (!hasher) {
    if (blob.size <= (options?.oneShotMaxBytes ?? ONE_SHOT_HASH_MAX_BYTES)) {
      return sha256Hex(new Uint8Array(await blob.arrayBuffer()));
    }
    hasher = jsSha256();
  }
  for (let offset = 0; offset < blob.size; offset += chunkBytes) {
    options?.signal?.throwIfAborted();
    const chunk = blob.slice(offset, offset + chunkBytes);
    hasher.update(new Uint8Array(await chunk.arrayBuffer()));
  }
  return hasher.hex();
}
