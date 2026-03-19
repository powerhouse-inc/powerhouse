import type { PHBaseState, PHDocument } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import type {
  RemoteDocumentData,
  RemoteOperation,
} from "../../src/remote-controller/types.js";
import {
  ConflictError,
  buildPulledDocument,
  convertRemoteOperations,
  deserializeSignature,
  extractRevisionMap,
  hasRevisionConflict,
  remoteOperationToLocal,
  screamingSnakeToCamel,
} from "../../src/remote-controller/utils.js";

// --- Helpers ---

function makeRemoteOp(
  overrides: Partial<RemoteOperation> & { index: number },
): RemoteOperation {
  return {
    timestampUtcMs: "1000",
    hash: `hash-${overrides.index}`,
    skip: 0,
    error: null,
    id: `op-${overrides.index}`,
    action: {
      id: `action-${overrides.index}`,
      type: "SET_NAME",
      timestampUtcMs: "1000",
      input: { name: `name-${overrides.index}` },
      scope: "global",
      attachments: null,
      context: null,
    },
    ...overrides,
  };
}

function makeRemoteDocData(
  overrides: Partial<RemoteDocumentData> = {},
): RemoteDocumentData {
  return {
    id: "doc-1",
    slug: "test-doc",
    name: "Test Doc",
    documentType: "test/type",
    state: { global: {}, local: {} },
    createdAtUtcIso: "2024-01-01T00:00:00Z",
    lastModifiedAtUtcIso: "2024-06-15T12:00:00Z",
    revisionsList: [{ scope: "global", revision: 3 }],
    ...overrides,
  };
}

function makeInitialDoc(): PHDocument<PHBaseState> {
  return {
    header: {
      id: "",
      name: "",
      slug: "",
      documentType: "test/type",
      createdAtUtcIso: "2024-01-01T00:00:00Z",
      lastModifiedAtUtcIso: "2024-01-01T00:00:00Z",
      revision: {},
      branch: "main",
      sig: { publicKey: {}, nonce: "" },
    },
    state: {
      auth: {},
      document: { version: 1, hash: { algorithm: "sha1", encoding: "base64" } },
    },
    initialState: {
      auth: {},
      document: { version: 1, hash: { algorithm: "sha1", encoding: "base64" } },
    },
    operations: {},
    clipboard: [],
  };
}

// --- Tests ---

describe("ConflictError", () => {
  it("has correct name and message", () => {
    const conflict = {
      remoteOperations: {},
      localActions: [],
      knownRevision: {},
      currentRevision: {},
    };
    const error = new ConflictError(conflict);

    expect(error.name).toBe("ConflictError");
    expect(error.message).toBe(
      "Push conflict: remote has new operations since last pull",
    );
    expect(error.conflict).toBe(conflict);
    expect(error).toBeInstanceOf(Error);
  });
});

describe("screamingSnakeToCamel", () => {
  it("converts SCREAMING_SNAKE_CASE to camelCase", () => {
    expect(screamingSnakeToCamel("SET_NAME")).toBe("setName");
    expect(screamingSnakeToCamel("SET_MODEL_NAME")).toBe("setModelName");
    expect(screamingSnakeToCamel("ADD_OPERATION")).toBe("addOperation");
  });

  it("handles single word", () => {
    expect(screamingSnakeToCamel("UNDO")).toBe("undo");
    expect(screamingSnakeToCamel("NOOP")).toBe("noop");
  });

  it("handles many segments", () => {
    expect(screamingSnakeToCamel("REORDER_CHANGE_LOG_ITEMS")).toBe(
      "reorderChangeLogItems",
    );
  });
});

describe("deserializeSignature", () => {
  it("splits a comma-separated string into a 5-element tuple", () => {
    const result = deserializeSignature("a, b, c, d, e");
    expect(result).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("pads with empty strings when fewer than 5 parts", () => {
    const result = deserializeSignature("a, b");
    expect(result).toEqual(["a", "b", "", "", ""]);
  });

  it("handles empty string", () => {
    const result = deserializeSignature("");
    expect(result).toEqual(["", "", "", "", ""]);
  });
});

describe("remoteOperationToLocal", () => {
  it("converts a minimal remote operation", () => {
    const remote = makeRemoteOp({ index: 0 });
    const local = remoteOperationToLocal(remote);

    expect(local.id).toBe("op-0");
    expect(local.index).toBe(0);
    expect(local.hash).toBe("hash-0");
    expect(local.skip).toBe(0);
    expect(local.error).toBeUndefined();
    expect(local.action.type).toBe("SET_NAME");
    expect(local.action.scope).toBe("global");
    expect(local.action.input).toEqual({ name: "name-0" });
    expect(local.action.context).toBeUndefined();
  });

  it("converts error field from null to undefined", () => {
    const remote = makeRemoteOp({ index: 0, error: null });
    expect(remoteOperationToLocal(remote).error).toBeUndefined();
  });

  it("preserves error string", () => {
    const remote = makeRemoteOp({ index: 0, error: "some error" });
    expect(remoteOperationToLocal(remote).error).toBe("some error");
  });

  it("converts attachments", () => {
    const remote: RemoteOperation = {
      ...makeRemoteOp({ index: 0 }),
      action: {
        ...makeRemoteOp({ index: 0 }).action,
        attachments: [
          {
            data: "base64data",
            mimeType: "image/png",
            hash: "att-hash",
            extension: "png",
            fileName: "image.png",
          },
        ],
      },
    };

    const local = remoteOperationToLocal(remote);
    expect(local.action.attachments).toHaveLength(1);
    expect(local.action.attachments![0]).toEqual({
      data: "base64data",
      mimeType: "image/png",
      hash: "att-hash",
      extension: "png",
      fileName: "image.png",
    });
  });

  it("converts signer context with signatures", () => {
    const remote: RemoteOperation = {
      ...makeRemoteOp({ index: 0 }),
      action: {
        ...makeRemoteOp({ index: 0 }).action,
        context: {
          signer: {
            user: { address: "0x123", networkId: "eip155", chainId: 1 },
            app: { name: "test-app", key: "key-1" },
            signatures: ["a, b, c, d, e"],
          },
        },
      },
    };

    const local = remoteOperationToLocal(remote);
    const signer = local.action.context?.signer;
    expect(signer).toBeDefined();
    expect(signer!.user.address).toBe("0x123");
    expect(signer!.app.name).toBe("test-app");
    expect(signer!.signatures).toEqual([["a", "b", "c", "d", "e"]]);
  });
});

describe("extractRevisionMap", () => {
  it("converts revisionsList to a scope-keyed map", () => {
    const result = extractRevisionMap([
      { scope: "global", revision: 5 },
      { scope: "local", revision: 3 },
    ]);
    expect(result).toEqual({ global: 5, local: 3 });
  });

  it("returns empty object for empty list", () => {
    expect(extractRevisionMap([])).toEqual({});
  });
});

describe("hasRevisionConflict", () => {
  it("returns false when revisions match", () => {
    expect(hasRevisionConflict({ global: 5 }, { global: 5 })).toBe(false);
  });

  it("returns true when current is ahead of known", () => {
    expect(hasRevisionConflict({ global: 6 }, { global: 5 })).toBe(true);
  });

  it("returns false when known is ahead (no conflict — we haven't pulled yet)", () => {
    expect(hasRevisionConflict({ global: 3 }, { global: 5 })).toBe(false);
  });

  it("returns true when current has a scope not in known", () => {
    expect(hasRevisionConflict({ global: 5, local: 1 }, { global: 5 })).toBe(
      true,
    );
  });

  it("returns false for empty objects", () => {
    expect(hasRevisionConflict({}, {})).toBe(false);
  });

  it("ignores scopes not in the filter set", () => {
    // document scope advanced, but we only care about global
    expect(
      hasRevisionConflict(
        { global: 5, document: 3 },
        { global: 5, document: 1 },
        new Set(["global"]),
      ),
    ).toBe(false);
  });

  it("detects conflict within filtered scopes", () => {
    expect(
      hasRevisionConflict(
        { global: 6, document: 3 },
        { global: 5, document: 1 },
        new Set(["global"]),
      ),
    ).toBe(true);
  });

  it("checks all scopes when no filter is provided", () => {
    expect(
      hasRevisionConflict(
        { global: 5, document: 3 },
        { global: 5, document: 1 },
      ),
    ).toBe(true);
  });
});

describe("buildPulledDocument", () => {
  it("reconstructs a PHDocument from remote data and operations", () => {
    const remoteDoc = makeRemoteDocData({
      id: "remote-1",
      name: "Remote Doc",
    });
    const remoteOps = {
      global: [makeRemoteOp({ index: 0 }), makeRemoteOp({ index: 1 })],
    };
    const ops = convertRemoteOperations(remoteOps);
    const initial = makeInitialDoc();

    const result = buildPulledDocument(remoteDoc, ops, initial, "main");

    expect(result.header.id).toBe("remote-1");
    expect(result.header.name).toBe("Remote Doc");
    expect(result.header.documentType).toBe("test/type");
    expect(result.header.branch).toBe("main");
    expect(result.header.revision).toEqual({ global: 3 });
    expect(result.operations["global"]).toHaveLength(2);
    expect(result.state).toBe(remoteDoc.state);
    expect(result.initialState).toBe(initial.initialState);
    expect(result.clipboard).toEqual([]);
  });

  it("handles Date objects for timestamps", () => {
    const remoteDoc = makeRemoteDocData({
      createdAtUtcIso: new Date("2024-03-01T00:00:00Z"),
      lastModifiedAtUtcIso: new Date("2024-06-01T00:00:00Z"),
    });

    const result = buildPulledDocument(remoteDoc, {}, makeInitialDoc(), "main");

    expect(result.header.createdAtUtcIso).toBe("2024-03-01T00:00:00.000Z");
    expect(result.header.lastModifiedAtUtcIso).toBe("2024-06-01T00:00:00.000Z");
  });

  it("handles string timestamps directly", () => {
    const remoteDoc = makeRemoteDocData({
      createdAtUtcIso: "2024-01-01T00:00:00Z",
      lastModifiedAtUtcIso: "2024-06-15T12:00:00Z",
    });

    const result = buildPulledDocument(remoteDoc, {}, makeInitialDoc(), "main");

    expect(result.header.createdAtUtcIso).toBe("2024-01-01T00:00:00Z");
    expect(result.header.lastModifiedAtUtcIso).toBe("2024-06-15T12:00:00Z");
  });

  it("uses custom branch name", () => {
    const result = buildPulledDocument(
      makeRemoteDocData(),
      {},
      makeInitialDoc(),
      "dev",
    );
    expect(result.header.branch).toBe("dev");
  });

  it("converts null slug to empty string", () => {
    const remoteDoc = makeRemoteDocData({ slug: null });
    const result = buildPulledDocument(remoteDoc, {}, makeInitialDoc(), "main");
    expect(result.header.slug).toBe("");
  });
});
