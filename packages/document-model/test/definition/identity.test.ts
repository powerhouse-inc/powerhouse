import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  type DefinitionIdentityRequest,
  DOCUMENT_MODEL_IDENTITY_NAMESPACE,
  definitionIdentityKey,
  deriveDefinitionId,
  uuidV5,
} from "../../src/definition/identity.js";

const DNS_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const UUID_V5_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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

function id(request: DefinitionIdentityRequest): string {
  const result = deriveDefinitionId(request);
  if (!result.ok) {
    throw new Error(result.diagnostic.message);
  }
  return result.id;
}

describe("uuidV5", () => {
  it("derives the frozen namespace from the DNS namespace and the documented name", () => {
    expect(
      uuidV5(DNS_NAMESPACE, "powerhouse.inc/document-model-identity"),
    ).toBe(DOCUMENT_MODEL_IDENTITY_NAMESPACE);
    expect(DOCUMENT_MODEL_IDENTITY_NAMESPACE).toBe(
      "f80a5a40-200a-5996-b2af-2c0996a4135e",
    );
  });

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
      const uuid = uuidV5(DOCUMENT_MODEL_IDENTITY_NAMESPACE, name);
      expect(uuid).toBe(nodeUuidV5(DOCUMENT_MODEL_IDENTITY_NAMESPACE, name));
      expect(uuid).toMatch(UUID_V5_PATTERN);
    },
  );

  it("accepts the name as bytes", () => {
    expect(
      uuidV5(
        DOCUMENT_MODEL_IDENTITY_NAMESPACE,
        new TextEncoder().encode("abc"),
      ),
    ).toBe(uuidV5(DOCUMENT_MODEL_IDENTITY_NAMESPACE, "abc"));
  });

  it("rejects a namespace that is not a canonical UUID", () => {
    expect(() => uuidV5("not-a-uuid", "x")).toThrow(
      new TypeError('UUID namespace "not-a-uuid" is not canonical.'),
    );
  });
});

describe("deriveDefinitionId", () => {
  const invoice = "powerhouse/invoice";

  it("reproduces both locked vectors", () => {
    expect(
      id({ kind: "module", documentType: invoice, moduleKey: "lineItems" }),
    ).toBe("4c323bb9-fd39-5600-9af2-bc0c28489e37");
    expect(
      id({
        kind: "operation",
        documentType: invoice,
        moduleKey: "lineItems",
        operationKey: "addLineItem",
      }),
    ).toBe("f9ba524d-2a61-53f3-bbd9-452ed03b7523");
  });

  it("reproduces the error and example IDs of the normative fixture", () => {
    expect(
      id({
        kind: "error",
        documentType: invoice,
        moduleKey: "lineItems",
        operationKey: "addLineItem",
        errorKey: "InvoiceAlreadyIssued",
      }),
    ).toBe("580a9129-daff-5fd7-a92b-25a90031595d");
    expect(
      id({
        kind: "operation-example",
        documentType: invoice,
        moduleKey: "lineItems",
        operationKey: "addLineItem",
        exampleKey: "item",
      }),
    ).toBe("7081d8a7-0cef-55ad-8d2f-99a978fdfde0");
    expect(
      id({
        kind: "state-example",
        documentType: invoice,
        scope: "global",
        exampleKey: "empty",
      }),
    ).toBe("d165bf74-2083-508b-a927-8f45a153fdc7");
  });

  it("names the UUID with the canonical JSON tuple, not a delimited string", () => {
    expect(
      uuidV5(
        DOCUMENT_MODEL_IDENTITY_NAMESPACE,
        '["powerhouse.document-model.identity",1,"powerhouse/invoice","module","lineItems"]',
      ),
    ).toBe("4c323bb9-fd39-5600-9af2-bc0c28489e37");
    expect(
      uuidV5(
        DOCUMENT_MODEL_IDENTITY_NAMESPACE,
        "powerhouse.document-model.identity:1:powerhouse/invoice:module:lineItems",
      ),
    ).not.toBe("4c323bb9-fd39-5600-9af2-bc0c28489e37");
  });

  it("rejects a key segment carrying the identity-key separator", () => {
    for (const request of [
      { kind: "module", documentType: "a", moduleKey: "b/c" },
      {
        kind: "operation",
        documentType: "a",
        moduleKey: "b",
        operationKey: "c/d",
      },
      {
        kind: "state-example",
        documentType: "a",
        scope: "global",
        exampleKey: "c/d",
      },
    ] as const) {
      expect(deriveDefinitionId(request)).toMatchObject({
        ok: false,
        diagnostic: { code: "PH-DM-IDENTITY-INVALID" },
      });
    }
    // The document type is not part of an identity key, and every document
    // type in this repository carries a slash.
    expect(
      deriveDefinitionId({
        kind: "module",
        documentType: "powerhouse/invoice",
        moduleKey: "lineItems",
      }).ok,
    ).toBe(true);
  });

  it("builds the identity key a compatibility map is keyed by", () => {
    expect(
      definitionIdentityKey({
        kind: "module",
        documentType: "powerhouse/invoice",
        moduleKey: "lineItems",
      }),
    ).toBe("module/lineItems");
    expect(
      definitionIdentityKey({
        kind: "operation",
        documentType: "powerhouse/invoice",
        moduleKey: "lineItems",
        operationKey: "addLineItem",
      }),
    ).toBe("operation/lineItems/addLineItem");
    expect(
      definitionIdentityKey({
        kind: "error",
        documentType: "powerhouse/invoice",
        moduleKey: "lineItems",
        operationKey: "addLineItem",
        errorKey: "InvoiceAlreadyIssued",
      }),
    ).toBe("error/lineItems/addLineItem/InvoiceAlreadyIssued");
    expect(
      definitionIdentityKey({
        kind: "state-example",
        documentType: "powerhouse/invoice",
        scope: "global",
        exampleKey: "empty",
      }),
    ).toBe("state-example/global/empty");
    expect(
      definitionIdentityKey({
        kind: "operation-example",
        documentType: "powerhouse/invoice",
        moduleKey: "lineItems",
        operationKey: "addLineItem",
        exampleKey: "item",
      }),
    ).toBe("operation-example/lineItems/addLineItem/item");
  });

  it("keeps tuples apart that a naive join would merge", () => {
    // A module key may not carry the identity-key separator, so the ambiguity
    // a slash could create is rejected rather than resolved.
    expect(
      deriveDefinitionId({
        kind: "module",
        documentType: "a",
        moduleKey: "b/c",
      }),
    ).toMatchObject({
      ok: false,
      diagnostic: { code: "PH-DM-IDENTITY-INVALID", path: ["moduleKey"] },
    });
    expect(
      id({ kind: "module", documentType: "a", moduleKey: 'b","operation","c' }),
    ).not.toBe(
      id({
        kind: "operation",
        documentType: "a",
        moduleKey: "b",
        operationKey: "c",
      }),
    );
    expect(
      id({
        kind: "state-example",
        documentType: "a",
        scope: "global",
        exampleKey: "x",
      }),
    ).not.toBe(
      id({
        kind: "operation-example",
        documentType: "a",
        moduleKey: "global",
        operationKey: "x",
        exampleKey: "x",
      }),
    );
  });

  it("carries no model version, so every version of a family shares its IDs", () => {
    const result = deriveDefinitionId({
      kind: "module",
      documentType: invoice,
      moduleKey: "lineItems",
      // @ts-expect-error the identity tuple has no version segment
      version: 2,
    });
    expect(result).toStrictEqual({
      ok: true,
      id: "4c323bb9-fd39-5600-9af2-bc0c28489e37",
    });
  });

  it("rejects a non-NFC segment with PH-DM-IDENTITY-INVALID instead of normalizing it", () => {
    const decomposed = "cafe\u0301";
    const composed = "caf\u00e9";
    expect(
      id({ kind: "module", documentType: invoice, moduleKey: composed }),
    ).toMatch(UUID_V5_PATTERN);
    const result = deriveDefinitionId(
      { kind: "module", documentType: invoice, moduleKey: decomposed },
      ["specifications", 0],
    );
    expect(result).toStrictEqual({
      ok: false,
      diagnostic: {
        code: "PH-DM-IDENTITY-INVALID",
        severity: "error",
        phase: "definition",
        path: ["specifications", 0, "moduleKey"],
        message:
          'moduleKey "cafe\\u{301}" is not in Unicode NFC, so its derived ID would depend on how the source was encoded.',
        expected: "an identity segment already in Unicode NFC",
        received: '"cafe\\u{301}"',
        repair: 'Rewrite moduleKey in the source as "caf\\u{e9}".',
      },
    });
  });

  it("reports the first non-NFC field in tuple order, including the document type", () => {
    const result = deriveDefinitionId({
      kind: "error",
      documentType: "powerhouse/invoic\u0327e",
      moduleKey: "a",
      operationKey: "b",
      errorKey: "c\u0327",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostic.path).toStrictEqual(["documentType"]);
    }
  });

  it("produces identical IDs across two cold imports of the module", async () => {
    vi.resetModules();
    const first = await import("../../src/definition/identity.js");
    vi.resetModules();
    const second = await import("../../src/definition/identity.js");
    expect(first).not.toBe(second);
    const request: DefinitionIdentityRequest = {
      kind: "operation",
      documentType: invoice,
      moduleKey: "lineItems",
      operationKey: "addLineItem",
    };
    expect(first.deriveDefinitionId(request)).toStrictEqual(
      second.deriveDefinitionId(request),
    );
    expect(first.deriveDefinitionId(request)).toStrictEqual({
      ok: true,
      id: "f9ba524d-2a61-53f3-bbd9-452ed03b7523",
    });
  });
});

describe("identity.ts source", () => {
  it("uses no host crypto and no randomness", () => {
    const source = readFileSync(
      new URL("../../src/definition/identity.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/node:|\bcrypto\b|Math\.random|Date\.now/);
  });
});
