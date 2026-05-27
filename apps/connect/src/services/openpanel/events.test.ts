import { describe, expect, it } from "vitest";

import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type { OpenPanelEventMapping } from "./types.js";
import {
  buildDefaultProperties,
  deriveEventName,
  loadEvents,
  normalize,
} from "./events.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal OperationWithContext literal for testing. */
function makeOp(
  documentType: string,
  actionType: string,
  overrides: { documentId?: string; scope?: string; branch?: string } = {},
): OperationWithContext {
  return {
    operation: {
      id: "test-op-id",
      index: 0,
      skip: 0,
      timestampUtcMs: "1000",
      hash: "abc",
      action: {
        type: actionType,
        scope: overrides.scope ?? "global",
        input: {},
      },
    },
    context: {
      documentType,
      documentId: overrides.documentId ?? "doc-1",
      scope: overrides.scope ?? "global",
      branch: overrides.branch ?? "main",
      ordinal: 1,
    },
  } as unknown as OperationWithContext;
}

// ---------------------------------------------------------------------------
// loadEvents
// ---------------------------------------------------------------------------

describe("loadEvents", () => {
  it("loads the bundled events.json and produces the expected lookup map", () => {
    const { mappings, lookupMap } = loadEvents();

    // Three top-level document types
    expect(lookupMap.size).toBe(3);
    expect(lookupMap.has("powerhouse/document-drive")).toBe(true);
    expect(lookupMap.has("powerhouse/document-model")).toBe(true);
    expect(lookupMap.has("powerhouse/reactor-drive")).toBe(true);

    // Spot-check a few keys in each inner map
    const drive = lookupMap.get("powerhouse/document-drive")!;
    expect(drive.has("ADD_FOLDER")).toBe(true);
    expect(drive.has("DELETE_NODE")).toBe(true);
    expect(drive.has("ADD_FILE")).toBe(true);
    expect(drive.has("UPDATE_FILE")).toBe(true);
    expect(drive.has("COPY_NODE")).toBe(true);
    expect(drive.has("MOVE_NODE")).toBe(true);
    expect(drive.has("SET_DRIVE_NAME")).toBe(true);
    expect(drive.has("SET_DRIVE_ICON")).toBe(true);
    // REMOVE_FOLDER was pruned — must not appear
    expect(drive.has("REMOVE_FOLDER")).toBe(false);

    const model = lookupMap.get("powerhouse/document-model")!;
    expect(model.has("SET_MODEL_NAME")).toBe(true);
    expect(model.has("ADD_MODULE")).toBe(true);

    const reactor = lookupMap.get("powerhouse/reactor-drive")!;
    expect(reactor.has("ADD_FOLDER")).toBe(true);
    expect(reactor.has("REMOVE_FOLDER")).toBe(true);
    expect(reactor.has("UPDATE_FOLDER")).toBe(true);
    // Brief's non-existent CHILD_DOCUMENT actions must not appear
    expect(reactor.has("CREATE_CHILD_DOCUMENT")).toBe(false);

    // Mappings array has the same length as unique document types
    expect(mappings.length).toBe(3);
  });

  it("throws on duplicate (documentType, actionType) — across two entries", () => {
    const input: unknown = [
      {
        documentType: "test/doc",
        actionTypes: ["ACTION_A"],
      },
      {
        documentType: "test/doc",
        actionTypes: ["ACTION_A"],
      },
    ];

    expect(() => loadEvents(input)).toThrow(
      "Duplicate OpenPanel event mapping for test/doc/ACTION_A",
    );
  });

  it("throws on duplicate (documentType, actionType) — within a single entry", () => {
    const input: unknown = [
      {
        documentType: "test/doc",
        actionTypes: ["ACTION_A", "ACTION_A"],
      },
    ];

    expect(() => loadEvents(input)).toThrow(
      "Duplicate OpenPanel event mapping for test/doc/ACTION_A",
    );
  });

  describe("schema validation", () => {
    it("rejects input missing documentType", () => {
      const input: unknown = [{ actionTypes: ["A"] }];
      expect(() => loadEvents(input)).toThrow("Invalid OpenPanel events.json");
    });

    it("rejects input missing actionTypes", () => {
      const input: unknown = [{ documentType: "test/doc" }];
      expect(() => loadEvents(input)).toThrow("Invalid OpenPanel events.json");
    });

    it("rejects input where actionTypes is not an array", () => {
      const input: unknown = [
        { documentType: "test/doc", actionTypes: "ACTION_A" },
      ];
      expect(() => loadEvents(input)).toThrow("Invalid OpenPanel events.json");
    });

    it("rejects input with an unknown extra field (.strict())", () => {
      const input: unknown = [
        {
          documentType: "test/doc",
          actionTypes: ["ACTION_A"],
          unknownField: "oops",
        },
      ];
      expect(() => loadEvents(input)).toThrow("Invalid OpenPanel events.json");
    });
  });
});

// ---------------------------------------------------------------------------
// normalize
// ---------------------------------------------------------------------------

describe("normalize", () => {
  it("lowercases the string", () => {
    expect(normalize("UPPER/CASE")).toBe("upper.case");
  });

  it("replaces / with .", () => {
    expect(normalize("powerhouse/document-drive")).toBe(
      "powerhouse.document-drive",
    );
  });

  it("replaces / with . — second brief example", () => {
    expect(normalize("sky/atlas-scope")).toBe("sky.atlas-scope");
  });

  it("strips characters not in [a-z0-9._-]", () => {
    // '@' and '!' are not in the allowed set
    expect(normalize("hello@world!")).toBe("helloworld");
  });

  it("preserves allowed characters: digits, dots, hyphens", () => {
    expect(normalize("abc-123.def")).toBe("abc-123.def");
  });
});

// ---------------------------------------------------------------------------
// deriveEventName
// ---------------------------------------------------------------------------

describe("deriveEventName", () => {
  const mapping: OpenPanelEventMapping = {
    documentType: "powerhouse/document-drive",
    actionTypes: ["ADD_FOLDER"],
  };

  it("returns the alias when present", () => {
    const aliasedMapping: OpenPanelEventMapping = {
      ...mapping,
      alias: "drive.folder.added",
    };
    const op = makeOp("powerhouse/document-drive", "ADD_FOLDER");
    expect(deriveEventName(aliasedMapping, op)).toBe("drive.folder.added");
  });

  it("derives the event name from documentType and actionType when no alias", () => {
    const op = makeOp("powerhouse/document-drive", "ADD_FOLDER");
    expect(deriveEventName(mapping, op)).toBe(
      "powerhouse.document-drive.add_folder",
    );
  });

  it("derives the event name correctly for a second example", () => {
    const scopeMapping: OpenPanelEventMapping = {
      documentType: "sky/atlas-scope",
      actionTypes: ["SET_NAME"],
    };
    const op = makeOp("sky/atlas-scope", "SET_NAME");
    expect(deriveEventName(scopeMapping, op)).toBe("sky.atlas-scope.set_name");
  });
});

// ---------------------------------------------------------------------------
// buildDefaultProperties
// ---------------------------------------------------------------------------

describe("buildDefaultProperties", () => {
  it("produces exactly the six documented fields", () => {
    const op = makeOp("powerhouse/document-drive", "ADD_FOLDER", {
      documentId: "drive-42",
      scope: "global",
      branch: "main",
    });

    const props = buildDefaultProperties(op);

    expect(Object.keys(props).sort()).toEqual(
      [
        "actionType",
        "app",
        "branch",
        "documentId",
        "documentType",
        "scope",
      ].sort(),
    );
  });

  it("maps each field to the correct source", () => {
    const op = makeOp("powerhouse/document-drive", "ADD_FOLDER", {
      documentId: "drive-42",
      scope: "global",
      branch: "main",
    });

    const props = buildDefaultProperties(op);

    expect(props.documentType).toBe("powerhouse/document-drive");
    expect(props.actionType).toBe("ADD_FOLDER");
    expect(props.documentId).toBe("drive-42");
    expect(props.scope).toBe("global");
    expect(props.branch).toBe("main");
    expect(props.app).toBe("connect");
  });
});
