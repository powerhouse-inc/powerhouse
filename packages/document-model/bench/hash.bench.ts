import stringifyJson from "safe-stable-stringify";
import { bench, describe } from "vitest";
import {
  buildOperationSignatureMessage,
  buildOperationSignatureParams,
  hashBrowser,
  supportedAlgorithms,
  supportedEncodings,
} from "../src/core/crypto.js";

// Node shim as it doesn't have `btoa`. Polyfill so the code's base64 path works if used
(globalThis as any).btoa ??= (bin: string) =>
  Buffer.from(bin, "binary").toString("base64");

// Helpers
function makeBytes(n: number): Uint8Array {
  // fast deterministic pseudo-random bytes (doesn't have RNG dependency)
  const u = new Uint8Array(n);
  for (let i = 0; i < n; i++) u[i] = (i * 31 + 97) & 0xff;
  return u;
}

const smallStr = "hello world";
const jsonStr = stringifyJson({
  doc: "abc123",
  scope: "test",
  type: "update",
  input: { a: 1, b: 2, c: [1, 2, 3] },
})!;

const data1k = makeBytes(1024);
const data64k = makeBytes(64 * 1024);
const data1m = makeBytes(1024 * 1024);

const stringPayloads = {"smallStr": smallStr, "jsonStr": jsonStr}
const bytePayloads = {"data1k":data1k, "data64k":data64k, "data1m":data1m};

const baseDocument = {
  documentId: "doc-123",
  previousStateHash: "",
  signer: { app: { key: "app-key-xyz" } },
  action: {
    scope: "doc",
    type: "update",
    input: { foo: "bar", n: 42 },
  },
} as const;

describe("hashBrowser - strings", () => {
  for (const algorithm of supportedAlgorithms) {
    for (const encoding of supportedEncodings) {
      for (const [strName, strValue] of Object.entries(stringPayloads)) {
        bench(`${algorithm} ${encoding}, ${strName}`, () => {
          hashBrowser(strValue, algorithm, encoding);
        });
      }
    }
  }
});

describe("hashBrowser - bytes", () => {
  for (const algorithm of supportedAlgorithms) {
    for (const encoding of supportedEncodings) {
      for (const [byteName, byteValue] of Object.entries(bytePayloads)) {
        bench(`${algorithm} ${encoding}, ${byteName}`, () => {
          hashBrowser(byteValue, algorithm, encoding);
        });
      }
    }
  }
});

describe("signature pipeline", () => {
  for (const algorithm of supportedAlgorithms) {
    for (const encoding of supportedEncodings) {
      bench(`buildOperationSignatureParams (${algorithm}/${encoding})`, () => {
        const params = buildOperationSignatureParams({
          ...baseDocument,
          hashFormat: { algorithm: algorithm, encoding: encoding },
        } as any);
        buildOperationSignatureMessage(params);
      });
    }
  }
});
