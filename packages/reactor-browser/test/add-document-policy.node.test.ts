// @vitest-environment happy-dom
import type {
  DocumentModelModule,
  PHDocument,
  SignaturePolicy,
} from "@powerhousedao/shared/document-model";
import type { NewDocumentOptions } from "@powerhousedao/reactor";
import {
  baseCreateDocument,
  createBaseState,
  hasDerivedDocumentId,
  headNewDocument,
  isDerivedDocumentId,
  signaturePolicyOf,
} from "@powerhousedao/shared/document-model";
import { withHalves } from "./utils/client-halves.js";
import { afterEach, describe, expect, it } from "vitest";
import { addDocument } from "../src/actions/document.js";
import { peekDriveNode } from "../src/hooks/drive-nodes.js";
import type { PHGlobal } from "../src/types/global.js";

const DOCUMENT_TYPE = "test/policy";

function install(
  policy: SignaturePolicy,
  store: Partial<PHGlobal> = {},
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
  const client = withHalves({
    newDocument: (_type: string, options?: NewDocumentOptions) => {
      selectedFor.push(options?.parentIdentifier);
      return Promise.resolve(
        headNewDocument(module, options, policy, { "base-reducer": 3 }),
      );
    },
    drives: {
      addFile: (_driveId: string, document: PHDocument) => {
        added.push(document);
        return Promise.resolve(document);
      },
    },
  });
  window.ph = {
    ...store,
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

  it("puts the new file in the drive's loaded node cache", async () => {
    const getNode = (_driveId: string, id: string) =>
      Promise.resolve({
        id,
        kind: "file",
        name: "Doc",
        documentType: DOCUMENT_TYPE,
        parentFolder: null,
      });
    install("legacy", {
      reactorClient: { read: { drives: { getNode } } },
      driveNodes: new Map([
        ["drive-1", { byId: new Map(), nodes: [], loaded: "all" }],
      ]),
    } as unknown as Partial<PHGlobal>);

    const node = await addDocument("drive-1", "Doc", DOCUMENT_TYPE);

    expect(peekDriveNode("drive-1", node.id)?.name).toBe("Doc");
    expect(window.ph?.driveNodes?.get("drive-1")?.nodes).toHaveLength(1);
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
