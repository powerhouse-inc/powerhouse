import type { IReactorClient } from "@powerhousedao/reactor";
import type {
  DocumentModelModule,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  createBaseState,
  createPresignedHeader,
  createZip,
} from "@powerhousedao/shared/document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addFileWithProgress } from "../src/actions/document.js";

const DOCUMENT_TYPE = "test/import";
const SOURCE_ID = "source-document-id";
const DRIVE_ID = "drive-1";

function sourceDocument(): PHDocument {
  const header = createPresignedHeader(SOURCE_ID, DOCUMENT_TYPE);
  header.name = "Imported";
  header.protocolVersions = { "base-reducer": 2 };
  const state = {
    ...createBaseState(undefined, { version: 1 }),
    global: { value: "x" },
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

function documentModelModule(): DocumentModelModule {
  return {
    version: 1,
    documentModel: { global: { id: DOCUMENT_TYPE } },
    reducer: (document: PHDocument) => document,
    utils: { fileExtension: "phd" },
  } as unknown as DocumentModelModule;
}

function driveDocument(): PHDocument {
  return {
    header: createPresignedHeader(DRIVE_ID, "powerhouse/document-drive"),
    state: { global: { nodes: [] }, local: {} },
  } as unknown as PHDocument;
}

function takenIdError(documentId: string): Error {
  const error = new Error(`Document ${documentId} already exists`);
  error.name = "DocumentAlreadyExistsError";
  return error;
}

/**
 * Records the id the import claims, which is the decision under test.
 *
 * `rejectClaims` decides which claims the write rejects as a taken id, standing
 * in for an id claimed between the check and the create.
 */
function stubReactorClient(
  isDocumentIdTaken: () => Promise<boolean>,
  rejectClaims: (documentId: string, attempt: number) => boolean = () => false,
) {
  const claimed: string[] = [];
  const modules = [documentModelModule()];
  const client = {
    get: (identifier: string) => {
      if (identifier === DRIVE_ID) {
        return Promise.resolve(driveDocument());
      }
      return Promise.resolve(sourceDocument());
    },
    getDocumentModelModules: () =>
      Promise.resolve({
        results: modules,
        options: { cursor: "", limit: 10 },
      }),
    getDocumentModelModule: () => Promise.resolve(modules[0]),
    isDocumentIdTaken: vi.fn(isDocumentIdTaken),
    drives: {
      addFile: (_driveId: string, document: PHDocument) => {
        claimed.push(document.header.id);
        if (rejectClaims(document.header.id, claimed.length)) {
          return Promise.reject(takenIdError(document.header.id));
        }
        return Promise.resolve(document);
      },
    },
  };
  return { client, claimed };
}

function installClient(client: unknown): void {
  window.ph = {
    ...window.ph,
    reactorClientModule: {
      kind: "browser",
      client: client as IReactorClient,
      reactorModule: undefined,
    },
  } as unknown as typeof window.ph;
}

describe("importing a .phd whose id may be taken", () => {
  let file: File;

  beforeEach(async () => {
    const data = await createZip(sourceDocument());
    file = new File([new Uint8Array(data)], "source.phd");
  });

  afterEach(() => {
    delete window.ph;
  });

  it("keeps the file's id when the id is free", async () => {
    const { client, claimed } = stubReactorClient(() => Promise.resolve(false));
    installClient(client);

    await addFileWithProgress(file, DRIVE_ID);

    expect(client.isDocumentIdTaken).toHaveBeenCalledWith(SOURCE_ID);
    expect(claimed).toEqual([SOURCE_ID]);
  });

  it("mints a new id when the id is taken", async () => {
    const { client, claimed } = stubReactorClient(() => Promise.resolve(true));
    installClient(client);

    await addFileWithProgress(file, DRIVE_ID);

    expect(client.isDocumentIdTaken).toHaveBeenCalledWith(SOURCE_ID);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).not.toBe(SOURCE_ID);
    expect(claimed[0]).toBeTruthy();
  });

  it("fails the import rather than reusing the id when the check throws", async () => {
    const { client, claimed } = stubReactorClient(() =>
      Promise.reject(new Error("transport down")),
    );
    installClient(client);

    await expect(addFileWithProgress(file, DRIVE_ID)).rejects.toThrow(
      "transport down",
    );
    expect(claimed).toEqual([]);
  });

  it("retries under a new id when the id is claimed between the check and the create", async () => {
    // The check says free, the write disagrees: the id was claimed in between.
    const { client, claimed } = stubReactorClient(
      () => Promise.resolve(false),
      (_documentId, attempt) => attempt === 1,
    );
    installClient(client);

    await addFileWithProgress(file, DRIVE_ID);

    expect(claimed).toHaveLength(2);
    expect(claimed[0]).toBe(SOURCE_ID);
    expect(claimed[1]).not.toBe(SOURCE_ID);
    expect(claimed[1]).toBeTruthy();
  });

  it("gives up after a bounded number of ids rather than retrying forever", async () => {
    const { client, claimed } = stubReactorClient(
      () => Promise.resolve(false),
      () => true,
    );
    installClient(client);

    await expect(addFileWithProgress(file, DRIVE_ID)).rejects.toThrow();

    expect(claimed).toHaveLength(3);
    expect(new Set(claimed).size).toBe(3);
  });

  it("does not retry a failure that a new id cannot fix", async () => {
    const { client, claimed } = stubReactorClient(() => Promise.resolve(false));
    client.drives.addFile = (_driveId: string, document: PHDocument) => {
      claimed.push(document.header.id);
      return Promise.reject(new Error("transport down"));
    };
    installClient(client);

    await expect(addFileWithProgress(file, DRIVE_ID)).rejects.toThrow();

    expect(claimed).toHaveLength(1);
  });

  it("fails the import when the drive cannot be read", async () => {
    const { client, claimed } = stubReactorClient(() => Promise.resolve(false));
    client.get = () => Promise.reject(new Error("drive read failed"));
    installClient(client);

    await expect(addFileWithProgress(file, DRIVE_ID)).rejects.toThrow(
      "drive read failed",
    );
    expect(claimed).toEqual([]);
  });
});
