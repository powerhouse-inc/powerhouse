import stringifyJson from "safe-stable-stringify";
import { bench, describe } from "vitest";
import {
  buildOperationSignatureMessage,
  buildOperationSignatureParams,
  hashBrowser,
  supportedAlgorithms,
  supportedEncodings,
} from "../src/core/crypto.js";

import type { HashConfig } from "../src/core/ph-types.js";

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
const data64m = makeBytes(64 * 1024 * 1024);

const stringPayloads = {"smallStr": smallStr, "jsonStr": jsonStr}

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

describe("hashBrowser - bytes (1kb)", () => {
  for (const algorithm of supportedAlgorithms) {
    for (const encoding of supportedEncodings) {
      bench(`${algorithm} ${encoding}, 1kb`, () => {
        hashBrowser(data1k, algorithm, encoding);
      });
    }
  }
});

describe("hashBrowser - bytes (64kb)", () => {
  for (const algorithm of supportedAlgorithms) {
    for (const encoding of supportedEncodings) {
      bench(`${algorithm} ${encoding}, 64kb`, () => {
        hashBrowser(data64k, algorithm, encoding);
      });
    }
  }
});

describe("hashBrowser - bytes (1mb)", () => {
  for (const algorithm of supportedAlgorithms) {
    for (const encoding of supportedEncodings) {
      bench(`${algorithm} ${encoding}, 1mb`, () => {
        hashBrowser(data1m, algorithm, encoding);
      });
    }
  }
});

describe("hashBrowser - bytes (64mb)", () => {
  for (const algorithm of supportedAlgorithms) {
    for (const encoding of supportedEncodings) {
      bench(`${algorithm} ${encoding}, 64mb`, () => {
        hashBrowser(data64m, algorithm, encoding);
      });
    }
  }
});

describe("signature pipeline", () => {
  for (const algorithm of supportedAlgorithms) {
    for (const encoding of supportedEncodings) {
      bench(`buildOperationSignatureParams (${algorithm}/${encoding})`, () => {
        const params = buildOperationSignatureParams(
          {...baseDocument} as any,
          { algorithm, encoding } as HashConfig,
        );
        buildOperationSignatureMessage(params);
      });
    }
  }
});
