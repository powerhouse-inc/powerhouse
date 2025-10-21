import { blake256 } from "@noble/hashes/blake1.js";
import { blake2b, blake2s, } from "@noble/hashes/blake2.js";
import { blake3 as blake3Hash } from "@noble/hashes/blake3.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { keccak_256, sha3_256, shake256, shake256_64 } from "@noble/hashes/sha3.js";

import {
  createBLAKE3 as blake3_wasm
} from "hash-wasm";

import stringifyJson from "safe-stable-stringify";
import { createHash as createSha1Hash } from "sha1-uint8array";
import type { ActionSignatureContext } from "./types.js";

/**
 * This should never be linked to directly. Instead, use the `#utils/misc`
 * module. This will automatically pick the correct implementation for the
 * current environment. See package.json for the mapping.
 *
 * Generates a secure UUID.
 */
export function generateUUIDBrowser() {
  if (typeof crypto === "undefined" || !crypto.randomUUID) {
    throw new Error("generateUUID is not available in unsecure contexts.");
  }

  return crypto.randomUUID();
}

export const supportedAlgorithms = [
  "sha1",
  "blake3",
  "blake1",
  "blake2b",
  "blake2s",
  "sha2_256",
  "sha2_512",
  "keccak_256",
  "sha3_256",
  "shake256",
  "shake256_64",
  //"blake2b_wasm",
  //"blake2s_wasm",
  "blake3_wasm",
];
export const supportedEncodings = ["base64", "hex"];
const defaultAlg = "sha1"
const defaultEnc = "base64"

export const hashBrowser = (
  data: string | Uint8Array | ArrayBufferView | DataView,
  algorithm = defaultAlg,
  encoding = defaultEnc,
  _params?: Record<string, unknown>,
) => {
  if (!supportedAlgorithms.includes(algorithm)) {
    throw new Error(
      `Hashing algorithm not supported: "${algorithm}". Available: ` + supportedAlgorithms.join(", "),
    );
  }

  if (!supportedEncodings.includes(encoding)) {
    throw new Error(
      `Hash encoding not supported: "${encoding}". Available: ` + supportedEncodings.join(', '),
    );
  }

  const hash = hashUIntArray(data, algorithm);
  switch (encoding) {
    case "hex":
      return uint8ArrayToHex(hash);
    default:
      return uint8ArrayToBase64(hash);
  }
};

function uint8ArrayToBase64(uint8Array: Uint8Array) {
  // Convert the Uint8Array to a binary string
  let binaryString = "";
  for (let i = 0; i < uint8Array.length; i++) {
    binaryString += String.fromCharCode(uint8Array[i]);
  }

  // Encode the binary string to base64
  return btoa(binaryString);
}

function uint8ArrayToHex(uint8Array: Uint8Array) {
  return Array.from(uint8Array)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function toUint8(data: string | Uint8Array | ArrayBufferView ): Uint8Array {
  const textEncoder = new TextEncoder();

  if (typeof data === "string") return textEncoder.encode(data);
  if (data instanceof Uint8Array) return data;
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  // Fallback
  return textEncoder.encode(String(data));
}

async function initAsyncHasher() {
  const hasher = await blake3_wasm();
  hasher.init();
  return hasher;
}
const aHasher = await initAsyncHasher()

function hashUIntArray(
  data: string | Uint8Array | ArrayBufferView,
  algorithm = "sha1",
): Uint8Array {
  const bytes = toUint8(data);

  switch (algorithm) {
    case "sha1":
      return createSha1Hash("sha1").update(bytes).digest();
    case "blake3":
      return blake3Hash(bytes);
    case "blake1":
      return blake256(bytes);
    case "blake2b":
      return blake2b(bytes);
    case "blake2s":
      return blake2s(bytes);
    case "sha2_256":
      return sha256(bytes);
    case "sha2_512":
      return sha512(bytes);
    case "keccak_256":
      return keccak_256(bytes);
    case "sha3_256":
      return sha3_256(bytes);
    case "shake256":
      return shake256(bytes);
    case "shake256_64":
      return shake256_64(bytes);
    case "blake3_wasm":
      aHasher.update(bytes);
      let hash = aHasher.digest("binary");
      aHasher.init();
      return hash;
    default:
      throw new Error(`Unsupported algorithm: ${algorithm}`);
  }
}

export function generateId(method?: "UUIDv4"): string {
  if (method && method.toString() !== "UUIDv4") {
    throw new Error(
      `Id generation method not supported: "${method.toString()}"`,
    );
  }

  return generateUUIDBrowser();
}

export function getUnixTimestamp(date: Date | string): string {
  return (new Date(date).getTime() / 1000).toFixed(0);
}

export function buildOperationSignatureParams({
  documentId,
  signer,
  action,
  previousStateHash,
  hashFormat,
}: ActionSignatureContext): [string, string, string, string,] {
  const { /*id, timestamp,*/ scope, type } = action;
  return [
    /*getUnixTimestamp(timestamp)*/ getUnixTimestamp(new Date()),
    signer.app.key,
    hashBrowser(
      [documentId, scope, /*id,*/ type, stringifyJson(action.input)].join(""),
      hashFormat?.algorithm || defaultAlg,
      hashFormat?.encoding || defaultEnc,
    ),
    previousStateHash,
  ];
}

const textEncode = new TextEncoder();

export function buildOperationSignatureMessage(
  params: [string, string, string, string],
): Uint8Array {
  const message = params.join("");
  const prefix = "\x19Signed Operation:\n" + message.length.toString();
  return textEncode.encode(prefix + message);
}

export function ab2hex(ab: ArrayBuffer | ArrayBufferView): string {
  const view = ArrayBuffer.isView(ab) ? ab : new Uint8Array(ab);
  return Array.prototype.map
    .call(view, (x: number) => ("00" + x.toString(16)).slice(-2))
    .join("");
}

export function hex2ab(hex: string) {
  return new Uint8Array(
    hex.match(/[\da-f]{2}/gi)?.map(function (h) {
      return parseInt(h, 16);
    }) ?? [],
  );
}
