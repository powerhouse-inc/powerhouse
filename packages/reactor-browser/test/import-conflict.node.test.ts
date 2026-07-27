import type { IReactorClient } from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { createZip } from "@powerhousedao/shared/document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addFileWithProgress,
  isDocumentIdTakenError,
} from "../src/actions/document.js";
import type { FileUploadProgress } from "../src/types/upload.js";

/**
 * Regression tests for importing a .phd whose document id is already owned by
 * the reactor — in particular by a soft-deleted document, whose retained
 * operation history rejects a CREATE_DOCUMENT at revision 0.
 *
 * A soft-deleted id cannot be detected before the write: the document view,
 * `resolveIdOrSlug` and `getOperations` all hide soft-deleted documents, so a
 * tombstoned id is indistinguishable from an unused one. The import therefore
 * attempts the create and recovers from the revision mismatch under a fresh id.
 */

/** The error the reactor's job executor surfaces for a taken document id. */
const REVISION_MISMATCH_ERROR = new Error(
  "Job failed after 4 attempts:\n[Attempt 1] Failed to write operation to " +
    "IOperationStore: Revision mismatch: expected 3, got 0",
);

describe("isDocumentIdTakenError", () => {
  it("recognizes the executor's wrapped revision mismatch", () => {
    expect(isDocumentIdTakenError(REVISION_MISMATCH_ERROR)).toBe(true);
  });

  it("unwraps the error wrapper addDocument adds", () => {
    const wrapped = new Error("There was an error adding document", {
      cause: REVISION_MISMATCH_ERROR,
    });
    expect(isDocumentIdTakenError(wrapped)).toBe(true);
  });

  it("does not match unrelated failures", () => {
    expect(isDocumentIdTakenError(new Error("Network unreachable"))).toBe(
      false,
    );
    expect(isDocumentIdTakenError("Revision mismatch")).toBe(false);
  });
});

describe("addFileWithProgress with a taken document id", () => {
  const driveDoc = driveDocumentModelModule.utils.createDocument();
  const driveId = driveDoc.header.id;

  let fileDoc: ReturnType<typeof driveDocumentModelModule.utils.createDocument>;
  let fileBuffer: Uint8Array;
  let events: FileUploadProgress[];

  beforeEach(async () => {
    fileDoc = driveDocumentModelModule.utils.createDocument();
    fileBuffer = await createZip(fileDoc);
    events = [];
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    vi.restoreAllMocks();
  });

  /**
   * Builds a reactor client that tracks created documents, so `get` resolves
   * for ids the import has just written — as a real reactor does.
   */
  function makeClient(options: {
    /** The file's own id already resolves before the import (live duplicate). */
    fileIdLive?: boolean;
    /** Creating under the file's own id is rejected (soft-deleted owner). */
    rejectFileId?: boolean;
    /** Replaces the addFile mock outright. */
    addFile?: ReturnType<typeof vi.fn>;
  }) {
    const created = new Set<string>();

    const addFile =
      options.addFile ??
      vi.fn((_driveId: string, document: { header: { id: string } }) => {
        if (options.rejectFileId && document.header.id === fileDoc.header.id) {
          return Promise.reject(REVISION_MISMATCH_ERROR);
        }
        created.add(document.header.id);
        return Promise.resolve(document);
      });

    // Mirrors the reactor: the node is removed, then tombstoning the child
    // document that was never created reports a failure.
    const removeNode = vi.fn(() =>
      Promise.reject(new Error("Document was deleted at 2026-07-27T00:00:00Z")),
    );

    const get = vi.fn((id: string): Promise<unknown> => {
      if (id === driveId) return Promise.resolve(driveDoc);
      if (created.has(id)) return Promise.resolve(fileDoc);
      if (id === fileDoc.header.id && options.fileIdLive) {
        return Promise.resolve(fileDoc);
      }
      return Promise.reject(new Error("Document not found"));
    });

    const client = {
      resolveIdOrSlug: vi.fn((id: string) => Promise.resolve(id)),
      get,
      getDocumentModelModules: vi.fn(() =>
        // `createDocument` stamps UPGRADE_DOCUMENT.toVersion 0, so the replay
        // config must key this module's reducer at version 0.
        Promise.resolve({
          results: [{ ...driveDocumentModelModule, version: 0 }],
        }),
      ),
      getDocumentModelModule: vi.fn(() =>
        Promise.resolve(driveDocumentModelModule),
      ),
      drives: { addFile, removeNode },
    };

    (globalThis as { window?: unknown }).window = {
      ph: { reactorClient: client as unknown as IReactorClient },
    };

    return { addFile, removeNode };
  }

  function run() {
    return addFileWithProgress(
      fileBuffer as unknown as File,
      driveId,
      undefined,
      undefined,
      (progress) => events.push(progress),
    );
  }

  function idOfCall(addFile: ReturnType<typeof vi.fn>, call: number): string {
    return (addFile.mock.calls[call][1] as { header: { id: string } }).header
      .id;
  }

  it("imports a copy when the id is owned by a soft-deleted document", async () => {
    const { addFile } = makeClient({ rejectFileId: true });

    const result = await run();

    expect(result).toBeDefined();
    // The first attempt reuses the file's id and is rejected; the retry mints one.
    expect(addFile).toHaveBeenCalledTimes(2);
    expect(idOfCall(addFile, 0)).toBe(fileDoc.header.id);
    expect(idOfCall(addFile, 1)).not.toBe(fileDoc.header.id);
    expect(events.at(-1)?.stage).toBe("complete");
    expect(events.some((e) => e.stage === "failed")).toBe(false);
  });

  it("clears the node the failed create left behind, before retrying", async () => {
    const { addFile, removeNode } = makeClient({ rejectFileId: true });

    await run();

    expect(removeNode).toHaveBeenCalledTimes(1);
    expect(removeNode).toHaveBeenCalledWith(driveId, fileDoc.header.id);
    // Cleanup has to precede the retry, or the copy lands beside a phantom node.
    expect(removeNode.mock.invocationCallOrder[0]).toBeLessThan(
      addFile.mock.invocationCallOrder[1],
    );
  });

  it("does not touch existing nodes when no conflict occurs", async () => {
    const { removeNode } = makeClient({});

    await run();

    expect(removeNode).not.toHaveBeenCalled();
  });

  it("returns the copy under the freshly minted id", async () => {
    const { addFile } = makeClient({ rejectFileId: true });

    const result = await run();

    expect(result?.id).toBe(idOfCall(addFile, 1));
  });

  it("does not retry failures that are not id conflicts", async () => {
    const addFile = vi.fn(() => Promise.reject(new Error("Network down")));
    makeClient({ addFile });

    await expect(run()).rejects.toThrow(/error adding document/);
    expect(addFile).toHaveBeenCalledTimes(1);
    expect(events.at(-1)?.stage).toBe("failed");
  });

  it("silently mints a fresh id for a live duplicate id (existing behavior)", async () => {
    const { addFile } = makeClient({ fileIdLive: true });

    const result = await run();

    expect(result).toBeDefined();
    expect(addFile).toHaveBeenCalledTimes(1);
    expect(idOfCall(addFile, 0)).not.toBe(fileDoc.header.id);
    expect(events.some((e) => e.stage === "conflict")).toBe(false);
  });

  it("keeps the file's id when it is free (existing behavior)", async () => {
    const { addFile } = makeClient({});

    const result = await run();

    expect(result).toBeDefined();
    expect(addFile).toHaveBeenCalledTimes(1);
    expect(idOfCall(addFile, 0)).toBe(fileDoc.header.id);
    expect(events.some((e) => e.stage === "conflict")).toBe(false);
  });
});
