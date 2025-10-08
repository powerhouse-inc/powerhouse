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
