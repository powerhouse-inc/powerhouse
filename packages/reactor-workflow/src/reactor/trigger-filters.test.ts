import { describe, expect, it } from "vitest";
import {
  lifecycleKindForDocumentAction,
  lifecycleKindForDriveAction,
  matchesEventFilter,
  matchesLifecycleFilter,
  parseEventFilter,
  parseLifecycleFilter,
} from "./trigger-filters.js";

describe("parseEventFilter", () => {
  it("accepts strings, lists and omissions", () => {
    expect(
      parseEventFilter({
        documentType: "a/b",
        documentId: ["x", "y"],
      }),
    ).toEqual({
      documentType: ["a/b"],
      documentId: ["x", "y"],
      actionType: undefined,
    });
  });

  it("treats empty strings and empty lists as unset", () => {
    expect(parseEventFilter({ documentType: "", actionType: [] })).toEqual({
      documentType: undefined,
      documentId: undefined,
      actionType: undefined,
    });
  });

  it("tolerates non-object configs", () => {
    expect(parseEventFilter(null)).toEqual({
      documentType: undefined,
      documentId: undefined,
      actionType: undefined,
    });
  });
});

describe("matchesEventFilter", () => {
  it("omitted fields match everything", () => {
    expect(matchesEventFilter({}, "a/b", "doc-1", "SET_NAME")).toBe(true);
  });

  it("every set field must match", () => {
    const filter = parseEventFilter({
      documentType: "a/b",
      actionType: "SET_NAME",
    });
    expect(matchesEventFilter(filter, "a/b", "doc-1", "SET_NAME")).toBe(true);
    expect(matchesEventFilter(filter, "a/b", "doc-1", "ADD_STEP")).toBe(false);
    expect(matchesEventFilter(filter, "a/c", "doc-1", "SET_NAME")).toBe(false);
  });
});

describe("matchesLifecycleFilter", () => {
  it("filters by created document type and drive", () => {
    const filter = parseLifecycleFilter({
      documentType: "powerhouse/connection",
      driveId: "drive-1",
    });
    expect(
      matchesLifecycleFilter(filter, "powerhouse/connection", "drive-1"),
    ).toBe(true);
    expect(
      matchesLifecycleFilter(filter, "powerhouse/workflow", "drive-1"),
    ).toBe(false);
    expect(
      matchesLifecycleFilter(filter, "powerhouse/connection", "drive-2"),
    ).toBe(false);
  });

  it("a set type filter rejects unresolvable types", () => {
    const filter = parseLifecycleFilter({ documentType: "a/b" });
    expect(matchesLifecycleFilter(filter, undefined, "drive-1")).toBe(false);
  });

  it("no type filter matches unresolvable types", () => {
    expect(matchesLifecycleFilter({}, undefined, "drive-1")).toBe(true);
  });

  it("a set drive filter rejects a document that belongs to no drive", () => {
    const filter = parseLifecycleFilter({ driveId: "drive-1" });
    expect(matchesLifecycleFilter(filter, "a/b", null)).toBe(false);
    expect(matchesLifecycleFilter(filter, "a/b", undefined)).toBe(false);
  });

  it("no drive filter matches a document that belongs to no drive", () => {
    expect(matchesLifecycleFilter({}, "a/b", null)).toBe(true);
  });
});

describe("lifecycleKindForDocumentAction", () => {
  it("maps the document's own lifecycle operations", () => {
    expect(lifecycleKindForDocumentAction("CREATE_DOCUMENT")).toBe(
      "document-created",
    );
    expect(lifecycleKindForDocumentAction("DELETE_DOCUMENT")).toBe(
      "document-deleted",
    );
  });

  it("ignores every other document-scope operation", () => {
    for (const actionType of [
      "UPGRADE_DOCUMENT",
      "ADD_RELATIONSHIP",
      "REMOVE_RELATIONSHIP",
      "ADD_FILE",
    ]) {
      expect(lifecycleKindForDocumentAction(actionType)).toBeUndefined();
    }
  });
});

describe("lifecycleKindForDriveAction", () => {
  it("maps the drive's node operations", () => {
    expect(lifecycleKindForDriveAction("ADD_FILE")).toBe("document-created");
    expect(lifecycleKindForDriveAction("DELETE_NODE")).toBe("document-deleted");
    expect(lifecycleKindForDriveAction("ADD_FOLDER")).toBeUndefined();
    expect(lifecycleKindForDriveAction("CREATE_DOCUMENT")).toBeUndefined();
  });
});
