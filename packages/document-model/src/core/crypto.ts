import {
  createBLAKE2b as blake2b_wasm,
  createBLAKE3 as blake3_wasm,
  createSHA1 as sha1_wasm,
} from "hash-wasm";

import farmhash from "farmhash";
import highwayhash from "highwayhash";

import stringifyJson from "safe-stable-stringify";
import { createHash as createSha1Hash } from "sha1-uint8array";
import type { HashConfig } from "./ph-types.js";
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
  "sha1_wasm",
  "blake2b_wasm",
  "blake3_wasm",
  "highwayhash",
  "farmhash",
];
export const supportedEncodings = ["base64", "hex"];
const defaultAlg = "sha1"
const defaultEnc = "base64"
const HH_KEY = Buffer.from(
  "70503c5cbe39a8da0fffd7c236f932700baf4906c048c8ebe3963ffff3871953",
  "hex"
);

const textEncoder = new TextEncoder();

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
  if (typeof data === "string") return textEncoder.encode(data);
  if (data instanceof Uint8Array) return data;
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  // Fallback
  return textEncoder.encode(String(data));
}

async function initAsyncSHA1Hasher() {
  const hasher = await sha1_wasm();
  hasher.init();
  return hasher;
}
const sha1Hasher = await initAsyncSHA1Hasher();

async function initAsyncBlake2bHasher() {
  const hasher = await blake2b_wasm();
  hasher.init();
  return hasher;
}
const blake2bHasher = await initAsyncBlake2bHasher();

async function initAsyncBlake3Hasher() {
  const hasher = await blake3_wasm();
  hasher.init();
  return hasher;
}
const blake3Hasher = await initAsyncBlake3Hasher();

function hashUIntArray(
  data: string | Uint8Array | ArrayBufferView,
  algorithm = "sha1",
): Uint8Array {
  const bytes = toUint8(data);

  switch (algorithm) {
    case "sha1":
      return createSha1Hash("sha1").update(bytes).digest();
    case "sha1_wasm":
      sha1Hasher.update(bytes);
      let sha1Hash = sha1Hasher.digest("binary");
      sha1Hasher.init();
      return sha1Hash;
    case "blake2b_wasm":
      blake2bHasher.update(bytes);
      let blake2bHash = blake2bHasher.digest("binary");
      blake2bHasher.init();
      return blake2bHash;
    case "blake3_wasm":
      blake3Hasher.update(bytes);
      let blake3HashDigest = blake3Hasher.digest("binary");
      blake3Hasher.init();
      return blake3HashDigest;
    case "farmhash":
      const buffer = Buffer.allocUnsafe(8);
      buffer.writeBigUInt64BE(BigInt(farmhash.fingerprint64(Buffer.from(bytes))));
      return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    case "highwayhash":
      let buf = highwayhash.asBuffer(HH_KEY, Buffer.from(bytes));
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
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
}: ActionSignatureContext,
hashFormat?: HashConfig): [string, string, string, string,] {
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

export function buildOperationSignatureMessage(
  params: [string, string, string, string],
): Uint8Array {
  const message = params.join("");
  const prefix = "\x19Signed Operation:\n" + message.length.toString();
  return textEncoder.encode(prefix + message);
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
