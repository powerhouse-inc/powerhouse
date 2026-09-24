import { describe, expect, it } from "vitest";
import { canonicalJson } from "./action-signature.js";
import type { PHDocument } from "./documents.js";
import { baseCreateDocument } from "./documents.js";
import { createZip, documentModelLoadFromInput } from "./files.js";
import {
  createCopyHeader,
  createPresignedHeader,
  hasDerivedDocumentId,
} from "./header.js";
import { loadStateOperation } from "./operations.js";
import {
  deriveDocumentId,
  isDerivedDocumentId,
  signaturePolicyOf,
  v2RequiredProtocolVersions,
  type DocumentIdParams,
} from "./signature-policy.js";
import { createBaseState } from "./state.js";
import type {
  CreateDocumentActionInput,
  UpgradeDocumentAction,
} from "./types.js";
import { applyUpgradeDocumentAction } from "./upgrades.js";

const params: DocumentIdParams = {
  documentType: "test/doc",
  createdAtUtcIso: "2026-09-23T00:00:00.000Z",
  nonce: "nonce-1",
  protocolVersions: { "base-reducer": 2, signature: 2 },
};

function base64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function createInputOf(document: PHDocument): CreateDocumentActionInput {
  return document.operations.document![0].action
    .input as CreateDocumentActionInput;
}

describe("signaturePolicyOf", () => {
  it("is legacy without a signature protocol and v2-required at 2", () => {
    expect(signaturePolicyOf(undefined)).toBe("legacy");
    expect(signaturePolicyOf({})).toBe("legacy");
    expect(signaturePolicyOf({ "base-reducer": 2 })).toBe("legacy");
    expect(signaturePolicyOf({ signature: 2 })).toBe("v2-required");
    expect(signaturePolicyOf({ protocolVersions: { "base-reducer": 2 } })).toBe(
      "legacy",
    );
    expect(
      signaturePolicyOf({ protocolVersions: v2RequiredProtocolVersions() }),
    ).toBe("v2-required");
  });
});

describe("deriveDocumentId", () => {
  it("is base64url SHA-256 over the canonical params", async () => {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(canonicalJson(params)),
    );
    const id = deriveDocumentId(params);
    expect(id).toBe(base64Url(digest));
    expect(isDerivedDocumentId(id)).toBe(true);
  });

  it("ignores key order and changes with every param", () => {
    const id = deriveDocumentId(params);
    expect(
      deriveDocumentId({
        ...params,
        protocolVersions: { signature: 2, "base-reducer": 2 },
      }),
    ).toBe(id);
    for (const changed of [
      { documentType: "test/other" },
      { createdAtUtcIso: "2026-09-23T00:00:00.001Z" },
      { nonce: "nonce-2" },
      { protocolVersions: { "base-reducer": 1, signature: 2 } },
    ]) {
      expect(deriveDocumentId({ ...params, ...changed })).not.toBe(id);
    }
  });

  it("does not take a uuid for a derived id", () => {
    expect(isDerivedDocumentId(crypto.randomUUID())).toBe(false);
  });
});

describe("createPresignedHeader", () => {
  it("keeps a random id and no protocol versions by default", () => {
    const header = createPresignedHeader(undefined, "test/doc");
    expect(header.protocolVersions).toBeUndefined();
    expect(header.sig.nonce).toBe("");
    expect(isDerivedDocumentId(header.id)).toBe(false);
  });

  it("keeps the given id for a legacy header", () => {
    const header = createPresignedHeader("doc-1", "test/doc", {
      "base-reducer": 2,
    });
    expect(header.id).toBe("doc-1");
    expect(header.protocolVersions).toEqual({ "base-reducer": 2 });
  });

  it("derives the id of a v2-required header from a fresh nonce", () => {
    const protocolVersions = v2RequiredProtocolVersions();
    const first = createPresignedHeader(
      undefined,
      "test/doc",
      protocolVersions,
    );
    const second = createPresignedHeader(
      undefined,
      "test/doc",
      protocolVersions,
    );

    expect(first.sig.nonce).not.toBe("");
    expect(first.id).toBe(
      deriveDocumentId({
        documentType: "test/doc",
        createdAtUtcIso: first.createdAtUtcIso,
        nonce: first.sig.nonce,
        protocolVersions,
      }),
    );
    expect(second.id).not.toBe(first.id);
    expect(first.protocolVersions).not.toBe(protocolVersions);
  });

  it("refuses an id for a v2-required header", () => {
    expect(() =>
      createPresignedHeader("doc-1", "test/doc", v2RequiredProtocolVersions()),
    ).toThrow(/derived/);
  });
});

describe("createCopyHeader", () => {
  it("keeps the given id for a copy of a legacy document", () => {
    const copy = createCopyHeader(
      createPresignedHeader("doc-1", "test/doc"),
      "copy-1",
    );
    expect(copy.id).toBe("copy-1");
    expect(signaturePolicyOf(copy)).toBe("legacy");
  });

  it("derives a fresh id for a copy of a v2-required document", () => {
    const source = createPresignedHeader(
      undefined,
      "test/doc",
      v2RequiredProtocolVersions(),
    );
    const copy = createCopyHeader(source, "copy-1");
    expect(copy.id).not.toBe("copy-1");
    expect(copy.id).not.toBe(source.id);
    expect(hasDerivedDocumentId(copy)).toBe(true);
    expect(hasDerivedDocumentId(source)).toBe(true);
    expect(hasDerivedDocumentId({ ...source, id: "copy-1" })).toBe(false);
  });
});

describe("baseCreateDocument", () => {
  it("seeds a legacy document by default", () => {
    const document = baseCreateDocument(
      () => createBaseState(),
      undefined,
      "test/doc",
    );
    expect(document.header.protocolVersions).toEqual({ "base-reducer": 2 });
    expect(createInputOf(document).protocolVersions).toEqual({
      "base-reducer": 2,
    });
  });

  it("seeds a v2-required document whose CREATE recomputes its id", () => {
    const document = baseCreateDocument(
      () => createBaseState(),
      undefined,
      "test/doc",
      v2RequiredProtocolVersions(),
    );
    const input = createInputOf(document);

    expect(signaturePolicyOf(document.header)).toBe("v2-required");
    expect(input.documentId).toBe(document.header.id);
    expect(
      deriveDocumentId({
        documentType: input.model,
        createdAtUtcIso: input.signing!.createdAtUtcIso,
        nonce: input.signing!.nonce,
        protocolVersions: input.protocolVersions!,
      }),
    ).toBe(document.header.id);
  });
});

describe("protocolVersions are fixed at creation", () => {
  function v2Document(): PHDocument {
    return baseCreateDocument(
      () => createBaseState(undefined, { version: 1 }),
      undefined,
      "test/doc",
      v2RequiredProtocolVersions(),
    );
  }

  function upgrade(
    documentId: string,
    initialState?: Record<string, unknown>,
  ): UpgradeDocumentAction {
    return {
      id: "upgrade-1",
      type: "UPGRADE_DOCUMENT",
      scope: "document",
      timestampUtcMs: "2026-09-23T00:00:00.000Z",
      input: {
        documentId,
        model: "test/doc",
        fromVersion: 1,
        toVersion: 2,
        initialState,
      },
    } as UpgradeDocumentAction;
  }

  it("restores them after an upgrade reducer rewrites the header", () => {
    const document = v2Document();
    const upgraded = applyUpgradeDocumentAction(
      document,
      upgrade(document.header.id),
      [
        {
          toVersion: 2,
          upgradeReducer: (from) => ({
            ...from,
            header: { ...from.header, protocolVersions: { "base-reducer": 2 } },
          }),
        },
      ],
    );

    expect(upgraded.state.document.version).toBe(2);
    expect(upgraded.header.protocolVersions).toEqual(
      v2RequiredProtocolVersions(),
    );
  });

  it("does not take them from an upgrade's initialState", () => {
    const document = v2Document();
    const upgraded = applyUpgradeDocumentAction(
      document,
      upgrade(document.header.id, {
        header: { protocolVersions: {} },
        protocolVersions: {},
      }),
    );
    expect(upgraded.header.protocolVersions).toEqual(
      v2RequiredProtocolVersions(),
    );
  });

  it("does not take them from LOAD_STATE", () => {
    const document = v2Document();
    const loaded = loadStateOperation(document, {
      state: {
        name: "loaded",
        data: {
          ...document.state,
          header: { protocolVersions: {} },
        } as never,
      },
      operations: 0,
    });
    expect(loaded.header.name).toBe("loaded");
    expect(loaded.header.protocolVersions).toEqual(
      v2RequiredProtocolVersions(),
    );
  });

  it("takes a zip's from its CREATE_DOCUMENT, not header.json", async () => {
    const v2 = v2Document();
    const claimsLegacy = await createZip({
      ...v2,
      header: { ...v2.header, protocolVersions: { "base-reducer": 2 } },
    });
    expect(
      (await documentModelLoadFromInput(claimsLegacy)).header.protocolVersions,
    ).toEqual(v2RequiredProtocolVersions());

    const legacy = baseCreateDocument(
      () => createBaseState(undefined, { version: 1 }),
      undefined,
      "test/doc",
    );
    const claimsV2 = await createZip({
      ...legacy,
      header: {
        ...legacy.header,
        protocolVersions: v2RequiredProtocolVersions(),
      },
    });
    const loaded = await documentModelLoadFromInput(claimsV2);
    expect(signaturePolicyOf(loaded.header)).toBe("legacy");
    expect(loaded.header.protocolVersions).toEqual({ "base-reducer": 2 });
  });
});
