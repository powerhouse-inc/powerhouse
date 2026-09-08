import type {
  AddFolderInput,
  DocumentDriveDocument,
  FolderNode,
  Node,
} from "@powerhousedao/shared/document-drive";
import type { Action, PHDocument } from "@powerhousedao/shared/document-model";
import {
  createBaseState,
  createPresignedHeader,
  createZip,
  zipEntries,
} from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expandBulkArchive } from "../src/actions/bulk-archive.js";

const DRIVE_ID = "drive-1";
const DOC_TYPE = "test/grantee";

function fileNode(id: string, name: string, parent: string | null) {
  return {
    id,
    kind: "file",
    name,
    parentFolder: parent,
    documentType: DOC_TYPE,
  } as Node;
}
function folderNode(id: string, name: string, parent: string | null) {
  return { id, kind: "folder", name, parentFolder: parent } as Node;
}

function makeDrive(existingNodes: Node[]) {
  return {
    header: {
      ...createPresignedHeader(DRIVE_ID, "powerhouse/document-drive"),
      name: "D",
    },
    state: { global: { nodes: existingNodes }, local: {} },
  } as unknown as DocumentDriveDocument;
}

function doc(id: string) {
  const header = createPresignedHeader(id, DOC_TYPE);
  const state = createBaseState(undefined, { version: 1 });
  return {
    header,
    state,
    initialState: state,
    operations: {},
    clipboard: [],
  } as unknown as PHDocument;
}

function stubClient(initialNodes: Node[]) {
  let drive = makeDrive(initialNodes);
  const calls: Array<{ type: string; input: Record<string, unknown> }> = [];
  const client = {
    get: (id: string) =>
      id === DRIVE_ID ? Promise.resolve(drive) : Promise.resolve(doc(id)),
    execute: (_driveId: string, _branch: string, actions: Action[]) => {
      for (const action of actions) {
        // The only action these tests issue. Record the input with the
        // reducer's semantics: an absent parent means the drive root (null).
        const input = action.input as AddFolderInput;
        calls.push({
          type: action.type,
          input: { ...input, parentFolder: input.parentFolder ?? null },
        });
        if (action.type === "ADD_FOLDER") {
          drive = makeDrive([
            ...drive.state.global.nodes,
            folderNode(input.id, input.name, input.parentFolder ?? null),
          ]);
        }
      }
      return Promise.resolve(drive);
    },
  };
  window.ph = {
    ...window.ph,
    reactorClientModule: { kind: "browser", client, reactorModule: undefined },
    reactorClient: client,
  } as unknown as typeof window.ph;
  return { client, calls };
}

async function bulkArchiveFile(): Promise<File> {
  // Two inner documents (real document zips, so the import chain could parse them)
  const inner1 = await createZip(doc("g1"));
  const inner2 = await createZip(doc("g2"));
  const zip = await zipEntries({
    "Grant Recipients/": new Uint8Array(0),
    "Grant Recipients/2025/": new Uint8Array(0),
    "Grant Recipients/grantee-1.phdm.phd": new Uint8Array(inner1),
    "Grant Recipients/2025/grantee-2.phdm.phd": new Uint8Array(inner2),
  });
  return new File([new Uint8Array(zip)], "Grant Recipients.zip");
}

describe("expandBulkArchive", () => {
  afterEach(() => {
    delete (window as { ph?: unknown }).ph;
    vi.restoreAllMocks();
  });

  it("recreates the archive's folder tree and returns per-file jobs with target folders", async () => {
    const { calls } = stubClient([]);
    const jobs = await expandBulkArchive(
      await bulkArchiveFile(),
      DRIVE_ID,
      undefined,
    );

    expect(calls.map((c) => c.type)).toEqual(["ADD_FOLDER", "ADD_FOLDER"]);
    const [top, sub] = calls;
    expect(top.input).toMatchObject({
      name: "Grant Recipients",
      parentFolder: null,
    });
    expect(sub.input).toMatchObject({
      name: "2025",
      parentFolder: top.input.id,
    });

    expect(jobs.map((j) => j.file.name).sort()).toEqual([
      "grantee-1.phdm.phd",
      "grantee-2.phdm.phd",
    ]);
    const topNode = jobs.find((j) => j.file.name === "grantee-1.phdm.phd")
      ?.parent as FolderNode | undefined;
    expect(topNode?.name).toBe("Grant Recipients");
    const subJob = jobs.find((j) => j.file.name === "grantee-2.phdm.phd")!;
    expect(subJob.parent?.id).toBe(sub.input.id);
    expect(subJob.parent?.name).toBe("2025");
  });

  it("reuses an existing same-named folder instead of creating a duplicate", async () => {
    const existing = folderNode("existing-top", "Grant Recipients", null);
    const { calls } = stubClient([
      existing,
      fileNode("f0", "pre-existing", "existing-top"),
    ]);
    const jobs = await expandBulkArchive(
      await bulkArchiveFile(),
      DRIVE_ID,
      undefined,
    );

    expect(
      calls.filter((c) => c.input.name === "Grant Recipients"),
    ).toHaveLength(0);
    expect(jobs[0].parent?.id).toBe("existing-top");
  });

  it("targets the given parent folder for the recreated top folder", async () => {
    const target = folderNode("target", "Target", null);
    const { calls } = stubClient([target]);
    await expandBulkArchive(await bulkArchiveFile(), DRIVE_ID, target);
    expect(calls[0].input).toMatchObject({
      name: "Grant Recipients",
      parentFolder: "target",
    });
  });

  it("creates no folders when no leaf is an importable document", async () => {
    const { calls } = stubClient([]);
    const junk = await zipEntries({
      "Junk/": new Uint8Array(0),
      "Junk/nested/": new Uint8Array(0),
      "Junk/nested/readme.txt": new TextEncoder().encode("not a document"),
    });
    const file = new File([new Uint8Array(junk)], "Junk.zip");

    await expect(
      expandBulkArchive(file, DRIVE_ID, undefined),
    ).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it("passes a single-document zip through untouched", async () => {
    const { calls } = stubClient([]);
    const single = new File(
      [new Uint8Array(await createZip(doc("solo")))],
      "solo.phdm.phd",
    );
    const jobs = await expandBulkArchive(single, DRIVE_ID, undefined);
    expect(jobs).toEqual([{ file: single, parent: undefined }]);
    expect(calls).toEqual([]);
  });
});
