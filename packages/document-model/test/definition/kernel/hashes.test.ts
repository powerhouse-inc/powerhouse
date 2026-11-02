import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { sha256, uuidV5 } from "../../../src/definition/kernel/hashes.js";

const DNS_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const UUID_V5_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function nodeSha256(input: string): string {
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

function nodeUuidV5(namespace: string, name: string): string {
  const digest = createHash("sha1")
    .update(Buffer.from(namespace.replaceAll("-", ""), "hex"))
    .update(Buffer.from(name, "utf8"))
    .digest()
    .subarray(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

describe("sha256", () => {
  it("pins the standard vectors", () => {
    expect(sha256("")).toBe(
      "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256("abc")).toBe(
      "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  const inputs: readonly string[] = [
    "",
    "a",
    "a".repeat(55),
    "a".repeat(56),
    "a".repeat(63),
    "a".repeat(64),
    "a".repeat(65),
    "a".repeat(119),
    "a".repeat(120),
    "x".repeat(1000),
    "ünïcödé 😀 文字",
  ];

  it.each(inputs.map((input, index) => [index, input] as const))(
    "matches node:crypto for input %i",
    (_index, input) => {
      expect(sha256(input)).toBe(nodeSha256(input));
    },
  );

  it("returns a digest synchronously when WebCrypto is absent", () => {
    vi.stubGlobal("crypto", undefined);
    try {
      const digest: unknown = sha256("abc");
      expect(typeof digest).toBe("string");
      expect(digest).toBe(
        "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("uuidV5", () => {
  it("reproduces the RFC 4122 example", () => {
    expect(uuidV5(DNS_NAMESPACE, "www.example.com")).toBe(
      "2ed6657d-e927-568b-95e1-2665a8aea6a2",
    );
  });

  const names = [
    "",
    "a",
    "a".repeat(55),
    "a".repeat(56),
    "a".repeat(64),
    "a".repeat(1000),
    "ünïcödé 😀 文字",
    '["powerhouse.document-model.identity",1,"powerhouse/invoice","module","lineItems"]',
  ];

  it.each(names.map((name, index) => [index, name] as const))(
    "matches node:crypto for name %i and sets the version and variant bits",
    (_index, name) => {
      const uuid = uuidV5(DNS_NAMESPACE, name);
      expect(uuid).toBe(nodeUuidV5(DNS_NAMESPACE, name));
      expect(uuid).toMatch(UUID_V5_PATTERN);
    },
  );

  it("rejects a namespace that is not a canonical UUID", () => {
    expect(() => uuidV5("not-a-uuid", "x")).toThrow(
      new TypeError('UUID namespace "not-a-uuid" is not canonical.'),
    );
  });
});
