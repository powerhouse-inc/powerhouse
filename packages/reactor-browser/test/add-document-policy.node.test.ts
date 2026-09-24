// @vitest-environment happy-dom
import type {
  DocumentModelModule,
  PHDocument,
  SignaturePolicy,
} from "@powerhousedao/shared/document-model";
import {
  baseCreateDocument,
  createBaseState,
  hasDerivedDocumentId,
  isDerivedDocumentId,
  signaturePolicyOf,
} from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it } from "vitest";
import { addDocument } from "../src/actions/document.js";
import type { PHGlobal } from "../src/types/global.js";

const DOCUMENT_TYPE = "test/policy";

function install(policy: SignaturePolicy): PHDocument[] {
  const added: PHDocument[] = [];
  const module = {
    version: 1,
    documentModel: { global: { id: DOCUMENT_TYPE } },
    utils: {
      createDocument: () =>
        baseCreateDocument(
          (state) => ({ ...createBaseState(), ...state }),
          undefined,
          DOCUMENT_TYPE,
        ),
    },
  } as unknown as DocumentModelModule;
  const client = {
    getCreateSignaturePolicy: () => Promise.resolve(policy),
    getDocumentModelModule: () => Promise.resolve(module),
    drives: {
      addFile: (_driveId: string, document: PHDocument) => {
        added.push(document);
        return Promise.resolve(document);
      },
    },
  };
  window.ph = {
    reactorClientModule: { kind: "browser", client, reactorModule: undefined },
  } as unknown as PHGlobal;
  return added;
}

describe("addDocument", () => {
  afterEach(() => {
    window.ph = {};
  });

  it("creates a new document v2-required under a derived id by default", async () => {
    const added = install("v2-required");

    const node = await addDocument("drive-1", "Doc", DOCUMENT_TYPE);

    expect(signaturePolicyOf(added[0].header)).toBe("v2-required");
    expect(hasDerivedDocumentId(added[0].header)).toBe(true);
    expect(node.id).toBe(added[0].header.id);
    expect(added[0].header.name).toBe("Doc");
  });

  it("creates a legacy document under a random id with a legacy creation default", async () => {
    const added = install("legacy");

    await addDocument("drive-1", "Doc", DOCUMENT_TYPE);

    expect(signaturePolicyOf(added[0].header)).toBe("legacy");
    expect(isDerivedDocumentId(added[0].header.id)).toBe(false);
  });
});
