import type {
  Action,
  DocumentModelModule,
  PHDocument,
  PHDocumentHeader,
  SignaturePolicy,
} from "@powerhousedao/shared/document-model";
import {
  createBaseState,
  createPresignedHeader,
  hasDerivedDocumentId,
  signaturePolicyOf,
  v2RequiredProtocolVersions,
} from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it } from "vitest";
import { copyNode } from "../src/actions/document.js";

const DOCUMENT_TYPE = "test/copy";
const DRIVE_ID = "drive-1";

function sourceDocument(header: PHDocumentHeader): PHDocument {
  const state = {
    ...createBaseState(undefined, { version: 1 }),
    global: {},
    local: {},
  };
  return {
    header,
    state,
    initialState: state,
    operations: {},
    clipboard: [],
  } as unknown as PHDocument;
}

function install(
  source: PHDocument,
  createPolicy: SignaturePolicy = "v2-required",
) {
  const added: PHDocumentHeader[] = [];
  const executed: Action[] = [];
  const node = {
    id: source.header.id,
    kind: "file",
    name: "Doc",
    documentType: DOCUMENT_TYPE,
    parentFolder: null,
  };
  const drive = {
    header: createPresignedHeader(DRIVE_ID, "powerhouse/document-drive"),
    state: { global: { nodes: [node] }, local: {} },
  };
  const module = {
    version: 1,
    documentModel: { global: { id: DOCUMENT_TYPE } },
    reducer: (document: PHDocument) => document,
  } as unknown as DocumentModelModule;
  const client = {
    get: (id: string) => Promise.resolve(id === DRIVE_ID ? drive : source),
    getCreateSignaturePolicy: () => Promise.resolve(createPolicy),
    getCreateProtocolVersions: () => Promise.resolve({ "base-reducer": 2 }),
    getDocumentModelModules: () =>
      Promise.resolve({ results: [module], options: { cursor: "", limit: 1 } }),
    drives: {
      addFile: (_driveId: string, document: PHDocument) => {
        added.push(document.header);
        return Promise.resolve(document);
      },
    },
  };
  window.ph = {
    ...window.ph,
    reactorClientModule: { kind: "browser", client, reactorModule: undefined },
    reactorClient: {
      execute: (_id: string, _branch: string, actions: Action[]) => {
        executed.push(...actions);
        return Promise.resolve(drive);
      },
    },
  } as unknown as typeof window.ph;
  return { node, added, executed };
}

describe("copyNode", () => {
  afterEach(() => {
    delete window.ph;
  });

  it("gives a copy of a v2-required file a derived id and names it in the drive", async () => {
    const source = sourceDocument(
      createPresignedHeader(
        undefined,
        DOCUMENT_TYPE,
        v2RequiredProtocolVersions(),
      ),
    );
    const { node, added, executed } = install(source);

    await copyNode(DRIVE_ID, node as never, undefined);

    expect(added).toHaveLength(1);
    expect(signaturePolicyOf(added[0])).toBe("v2-required");
    expect(hasDerivedDocumentId(added[0])).toBe(true);
    expect(added[0].id).not.toBe(source.header.id);
    expect(executed.map((action) => action.input)).toMatchObject([
      { srcId: source.header.id, targetId: added[0].id },
    ]);
  });

  function legacySource(): PHDocument {
    return sourceDocument({
      ...createPresignedHeader("legacy-1", DOCUMENT_TYPE),
      protocolVersions: { "base-reducer": 2 },
    });
  }

  it("copies a legacy file as v2-required by default", async () => {
    const { node, added, executed } = install(legacySource());

    await copyNode(DRIVE_ID, node as never, undefined);

    expect(added).toHaveLength(1);
    expect(added[0].protocolVersions).toEqual(v2RequiredProtocolVersions());
    expect(hasDerivedDocumentId(added[0])).toBe(true);
    expect(executed.map((action) => action.input)).toMatchObject([
      { srcId: "legacy-1", targetId: added[0].id },
    ]);
  });

  it("keeps a copy of a legacy file legacy under a legacy creation default", async () => {
    const { node, added, executed } = install(legacySource(), "legacy");

    await copyNode(DRIVE_ID, node as never, undefined);

    expect(signaturePolicyOf(added[0])).toBe("legacy");
    expect(added[0].protocolVersions).toEqual({ "base-reducer": 2 });
    expect(executed.map((action) => action.input)).toMatchObject([
      { srcId: "legacy-1", targetId: added[0].id },
    ]);
  });

  it("never copies a v2-required file as legacy", async () => {
    const source = sourceDocument(
      createPresignedHeader(
        undefined,
        DOCUMENT_TYPE,
        v2RequiredProtocolVersions(),
      ),
    );
    const { node, added } = install(source, "legacy");

    await copyNode(DRIVE_ID, node as never, undefined);

    expect(signaturePolicyOf(added[0])).toBe("v2-required");
    expect(hasDerivedDocumentId(added[0])).toBe(true);
  });
});
