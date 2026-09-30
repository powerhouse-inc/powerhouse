import type { DocumentChangeEvent } from "@powerhousedao/reactor";
import { DocumentChangeType } from "@powerhousedao/reactor-browser";
import { describe, expect, it, vi } from "vitest";
import { closeDeletedSelection } from "../../src/utils/deleted-selection.js";

function deleted(childId: string, purged?: true): DocumentChangeEvent {
  return {
    type: DocumentChangeType.Deleted,
    documents: [],
    context: { childId, ...(purged ? { purged } : {}) },
  };
}

function host() {
  return {
    selectedDriveId: "drive-1",
    selectedNodeId: "doc-1",
    closeDrive: vi.fn(),
    closeNode: vi.fn(),
    notify: vi.fn(),
  };
}

describe("closeDeletedSelection", () => {
  it("closes a deleted open document with the deleted notice", () => {
    const selection = host();
    closeDeletedSelection(deleted("doc-1"), selection);
    expect(selection.closeNode).toHaveBeenCalledOnce();
    expect(selection.notify).toHaveBeenCalledWith(
      "The document you were editing has been deleted",
    );
  });

  it("closes an erased open document with the erased notice", () => {
    const selection = host();
    closeDeletedSelection(deleted("doc-1", true), selection);
    expect(selection.closeNode).toHaveBeenCalledOnce();
    expect(selection.closeDrive).not.toHaveBeenCalled();
    expect(selection.notify).toHaveBeenCalledWith(
      "The document you were editing has been erased",
    );
  });

  it("closes an erased open drive with the erased notice", () => {
    const selection = host();
    closeDeletedSelection(deleted("drive-1", true), selection);
    expect(selection.closeDrive).toHaveBeenCalledOnce();
    expect(selection.closeNode).not.toHaveBeenCalled();
    expect(selection.notify).toHaveBeenCalledWith(
      "The drive you were viewing has been erased",
    );
  });

  it("ignores a deletion of a document that is not open", () => {
    const selection = host();
    closeDeletedSelection(deleted("doc-2", true), selection);
    expect(selection.closeNode).not.toHaveBeenCalled();
    expect(selection.notify).not.toHaveBeenCalled();
  });

  it("ignores events other than Deleted", () => {
    const selection = host();
    closeDeletedSelection(
      {
        type: DocumentChangeType.Updated,
        documents: [],
        context: { childId: "doc-1" },
      },
      selection,
    );
    expect(selection.closeNode).not.toHaveBeenCalled();
    expect(selection.notify).not.toHaveBeenCalled();
  });
});
