import type {
  DocumentDriveDocument,
  FolderNode,
  Node,
} from "@powerhousedao/shared/document-drive";
import type {
  DocumentOperations,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  createBaseState,
  createPresignedHeader,
} from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFolderZip } from "../src/actions/folder-zip.js";
import { unzipAsync } from "./utils/unzip.js";

const DRIVE_ID = "drive-1";
const DOC_TYPE = "test/grantee";

function node(
  id: string,
  name: string,
  parentFolder: string | null,
  documentType?: string,
): Node {
  return (
    documentType
      ? { id, kind: "file", name, parentFolder, documentType }
      : { id, kind: "folder", name, parentFolder }
  ) as Node;
}

function driveDocument(): DocumentDriveDocument {
  const nodes: Node[] = [
    node("A", "Recipients", null),
    node("B", "Batch A", "A"),
    node("g1", "grantee-1", "A", DOC_TYPE),
    node("g2", "grantee-2", "B", DOC_TYPE),
    node("g3", "dup", "A", DOC_TYPE),
    node("g4", "dup", "A", "other/type"),
    node("C", "Outside", null),
    node("g5", "other-doc", "C", DOC_TYPE),
  ];
  return {
    header: {
      ...createPresignedHeader(DRIVE_ID, "powerhouse/document-drive"),
      name: "Arb Drive",
    },
    state: { global: { nodes }, local: {} },
  } as unknown as DocumentDriveDocument;
}

function sourceDocument(
  id: string,
  name: string,
  documentType = DOC_TYPE,
): PHDocument {
  const header = createPresignedHeader(id, documentType);
  header.name = name;
  const state = createBaseState(undefined, { version: 1 });
  return {
    header,
    state,
    initialState: state,
    operations: {},
    clipboard: [],
  } as unknown as PHDocument;
}

/** Upgrade op so extractInitialState has something to find. */
function upgradeOps(document: PHDocument): DocumentOperations {
  return {
    document: [
      {
        id: "op-1",
        index: 0,
        skip: 0,
        timestampUtcMs: "1",
        hash: "h",
        action: {
          id: "a-1",
          type: "UPGRADE_DOCUMENT",
          timestampUtcMs: "1",
          scope: "document",
          input: { initialState: document.state },
        },
      },
    ],
  };
}

function stubClient(documents: Record<string, PHDocument | undefined>) {
  const client = {
    get: (identifier: string) => {
      if (identifier === DRIVE_ID) return Promise.resolve(driveDocument());
      const doc = documents[identifier];
      if (!doc) return Promise.reject(new Error(`no document ${identifier}`));
      return Promise.resolve(doc);
    },
    getOperations: (_id: string) =>
      Promise.resolve({ results: [], nextCursor: "" }),
    getDocumentModelModules: () =>
      Promise.resolve({
        results: [
          {
            version: 1,
            documentModel: { global: { id: DOC_TYPE } },
            utils: { fileExtension: "phdm" },
          },
          {
            version: 1,
            documentModel: { global: { id: "other/type" } },
            utils: { fileExtension: "" },
          },
        ],
        options: { cursor: "", limit: 10 },
      }),
  };
  window.ph = {
    ...window.ph,
    reactorClientModule: {
      kind: "browser",
      client,
      reactorModule: undefined,
    },
    reactorClient: client,
  } as unknown as typeof window.ph;
  return client;
}

function allDocs(): Record<string, PHDocument> {
  return {
    g1: sourceDocument("g1", "grantee-1"),
    g2: sourceDocument("g2", "grantee-2"),
    g3: sourceDocument("g3", "dup"),
    g4: sourceDocument("g4", "dup", "other/type"),
    g5: sourceDocument("g5", "other-doc"),
  };
}

function fakeFetch(client: { get: (id: string) => Promise<PHDocument> }) {
  return async (id: string) => {
    const doc = await client.get(id);
    const operations = upgradeOps(doc);
    return { ...doc, operations, initialState: doc.state } as PHDocument;
  };
}

describe("buildFolderZip", () => {
  afterEach(() => {
    delete window.ph;
    vi.restoreAllMocks();
  });

  it("zips a folder subtree: dirs for folders, named leaves, no outside nodes", async () => {
    const client = stubClient(allDocs());
    const drive = driveDocument();
    const folder = (drive.state.global.nodes as Node[]).find(
      (n) => n.id === "A",
    ) as FolderNode;

    const result = await buildFolderZip(drive, folder, fakeFetch(client));

    const entries = await unzipAsync(result.zip);
    expect(entries["Recipients/grantee-1.phdm.phd"]).toBeInstanceOf(Uint8Array);
    expect(entries["Recipients/"]).toBeDefined();
    expect(result.archiveName).toBe("Recipients.zip");
    expect(result.entryCount).toBe(4);
    expect(result.failed).toEqual([]);
    expect(result.zip).toBeInstanceOf(Uint8Array);
    expect(result.zip.byteLength).toBeGreaterThan(0);
  });

  it("names leaves by node name + extension and suffixes name collisions", async () => {
    const client = stubClient(allDocs());
    const drive = driveDocument();
    const folder = (drive.state.global.nodes as Node[]).find(
      (n) => n.id === "A",
    ) as FolderNode;

    const { zip } = await buildFolderZip(drive, folder, fakeFetch(client));

    const entries = await unzipAsync(zip);

    expect(Object.keys(entries).sort()).toEqual([
      "Recipients/",
      "Recipients/Batch A/",
      "Recipients/Batch A/grantee-2.phdm.phd",
      "Recipients/dup (copy) 1.phd",
      "Recipients/dup.phdm.phd",
      "Recipients/grantee-1.phdm.phd",
    ]);
  });

  it("dedups leaf names per folder, not across the whole export", async () => {
    // Same document name in two different folders: a drive collision is
    // same-parent-folder, so neither leaf may be renamed.
    const nodes: Node[] = [
      node("Y1", "2024", null),
      node("Y2", "2025", null),
      node("r1", "report", "Y1", DOC_TYPE),
      node("r2", "report", "Y2", DOC_TYPE),
    ];
    const drive = {
      header: {
        ...createPresignedHeader(DRIVE_ID, "powerhouse/document-drive"),
        name: "Arb Drive",
      },
      state: { global: { nodes }, local: {} },
    } as unknown as DocumentDriveDocument;
    const client = stubClient({
      r1: sourceDocument("r1", "report"),
      r2: sourceDocument("r2", "report"),
    });

    const { zip } = await buildFolderZip(drive, undefined, fakeFetch(client));

    const entries = await unzipAsync(zip);
    expect(Object.keys(entries).sort()).toEqual([
      "Arb Drive/",
      "Arb Drive/2024/",
      "Arb Drive/2024/report.phdm.phd",
      "Arb Drive/2025/",
      "Arb Drive/2025/report.phdm.phd",
    ]);
  });

  it("exports the whole drive when no folder is given (top dir = drive name)", async () => {
    const client = stubClient(allDocs());
    const { zip, archiveName } = await buildFolderZip(
      driveDocument(),
      undefined,
      fakeFetch(client),
    );
    expect(archiveName).toBe("Arb Drive.zip");
    const entries = await unzipAsync(zip);
    expect(Object.keys(entries).sort()).toEqual([
      "Arb Drive/",
      "Arb Drive/Outside/",
      "Arb Drive/Outside/other-doc.phdm.phd",
      "Arb Drive/Recipients/",
      "Arb Drive/Recipients/Batch A/",
      "Arb Drive/Recipients/Batch A/grantee-2.phdm.phd",
      "Arb Drive/Recipients/dup (copy) 1.phd",
      "Arb Drive/Recipients/dup.phdm.phd",
      "Arb Drive/Recipients/grantee-1.phdm.phd",
    ]);
  });

  it("records per-document failures without aborting the rest", async () => {
    const docs = allDocs();
    delete docs.g2; // fetch will fail for this one
    const client = stubClient(docs);
    const drive = driveDocument();
    const folder = (drive.state.global.nodes as Node[]).find(
      (n) => n.id === "A",
    ) as FolderNode;

    const result = await buildFolderZip(drive, folder, fakeFetch(client));
    expect(result.failed).toEqual(["grantee-2"]);
    expect(result.entryCount).toBe(3);
  });
});
