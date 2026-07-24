import { stringify as stringifyJson } from "safe-stable-stringify";
import { createHash as createSha1Hash } from "sha1-uint8array";
import type { ActionSignatureContext } from "./types.js";

export const hashBrowser = (
  data: string | Uint8Array | ArrayBufferView | DataView,
  algorithm = "sha1",
  encoding = "base64",
  _params?: Record<string, unknown>,
) => {
  if (!["sha1"].includes(algorithm)) {
    throw new Error(
      `Hashing algorithm not supported: "${algorithm}". Available: sha1`,
    );
  }

  if (!["base64", "hex"].includes(encoding)) {
    throw new Error(
      `Hash encoding not supported: "${encoding}". Available: base64, hex`,
    );
  }

  const hash = hashUIntArray(data, algorithm);

  if (encoding === "hex") {
    return uint8ArrayToHex(hash);
  }

  return uint8ArrayToBase64(hash);
};

function uint8ArrayToBase64(uint8Array: Uint8Array) {
  // Convert the Uint8Array to a binary string
  let binaryString = "";
  for (let i = 0; i < uint8Array.length; i++) {
    binaryString += String.fromCharCode(uint8Array[i]);
  }

  // Encode the binary string to base64
  const base64String = btoa(binaryString);
  return base64String;
}

function uint8ArrayToHex(uint8Array: Uint8Array) {
  return Array.from(uint8Array)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hashUIntArray(
  data: string | Uint8Array | ArrayBufferView,
  algorithm = "sha1",
) {
  if (!["sha1"].includes(algorithm)) {
    throw new Error("Hashing algorithm not supported: Available: sha1");
  }
  return createSha1Hash("sha1")
    .update(data as string)
    .digest();
}

export function getUnixTimestamp(date: Date | string): string {
  return (new Date(date).getTime() / 1000).toFixed(0);
}

export function buildOperationSignatureParams({
  documentId,
  signer,
  action,
  previousStateHash,
}: ActionSignatureContext): [string, string, string, string] {
  const { /*id, timestamp,*/ scope, type } = action;
  return [
    /*getUnixTimestamp(timestamp)*/ getUnixTimestamp(new Date()),
    signer.app.key,
    hashBrowser(
      [documentId, scope, /*id,*/ type, stringifyJson(action.input)].join(""),
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

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Decodes a base58btc (Bitcoin/IPFS alphabet) string to bytes. Returns null on
 * any character outside the alphabet.
 */
export function base58Decode(input: string): Uint8Array | null {
  const bytes: number[] = [];
  for (const ch of input) {
    let carry = BASE58_ALPHABET.indexOf(ch);
    if (carry === -1) {
      return null;
    }
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Each leading "1" is a leading zero byte.
  for (let k = 0; k < input.length && input[k] === "1"; k++) {
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}

/** Decodes a base64url string to bytes (portable across node, browsers, workers). */
export function base64UrlToBytes(input: string): Uint8Array {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  let binary: string;
  if (typeof atob === "function") {
    binary = atob(padded);
  } else {
    binary = Buffer.from(padded, "base64").toString("binary");
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
