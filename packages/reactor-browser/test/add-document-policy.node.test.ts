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

function install(
  policy: SignaturePolicy,
): PHDocument[] & { selectedFor: (string | undefined)[] } {
  const added: PHDocument[] = [];
  const selectedFor: (string | undefined)[] = [];
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
    getCreateProtocolVersions: ({
      parentIdentifier,
    }: {
      parentIdentifier?: string;
    }) => {
      selectedFor.push(parentIdentifier);
      return Promise.resolve({ "base-reducer": 3 });
    },
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
  return Object.assign(added, { selectedFor });
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

  it("heads a new document at the versions the client selects for the drive", async () => {
    const added = install("v2-required");

    await addDocument("drive-1", "Doc", DOCUMENT_TYPE);

    expect(added.selectedFor).toEqual(["drive-1"]);
    expect(added[0].header.protocolVersions).toEqual({
      "base-reducer": 3,
      signature: 2,
    });
  });
});
