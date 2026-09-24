import type { FileNode } from "@powerhousedao/shared/document-drive";
import {
  deriveDocumentId,
  generateId,
} from "@powerhousedao/shared/document-model";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  addSelectedNodeIdEventHandler,
  setSelectedNode,
} from "../src/hooks/selected-node.js";
import {
  extractDriveIdFromSlug,
  extractNodeIdFromPath,
  extractNodeIdFromSlug,
  makeNodeSlug,
} from "../src/utils/url.js";

function derivedId(nonce: string): string {
  return deriveDocumentId({
    documentType: "test/todo",
    createdAtUtcIso: "2026-09-24T15:35:36.046Z",
    nonce,
    protocolVersions: { "base-reducer": 2, signature: 2 },
  });
}

function fileNode(id: string, name: string): FileNode {
  return {
    id,
    name,
    kind: "file",
    documentType: "test/todo",
    parentFolder: null,
  };
}

describe("node slugs", () => {
  it("round-trips a v2-required id, which is case-sensitive base64url", () => {
    // Mixed case and an underscore, which slugging would lowercase and drop.
    const id = "X9z7xnivC_ok0J-R1hkymzwbrvmqwutf4sl0tSLsVbA";
    const nodeSlug = makeNodeSlug(fileNode(id, "Groceries"));

    expect(nodeSlug).toBe(`groceries-${id}`);
    expect(extractNodeIdFromSlug(nodeSlug)).toBe(id);
    expect(extractNodeIdFromPath(`/d/drive/${nodeSlug}`)).toBe(id);
  });

  it("round-trips derived ids, with or without a name", () => {
    for (let i = 0; i < 50; i++) {
      const id = derivedId(`nonce-${i}`);
      expect(extractNodeIdFromSlug(makeNodeSlug(fileNode(id, "Doc")))).toBe(id);
      expect(extractNodeIdFromSlug(makeNodeSlug(fileNode(id, "")))).toBe(id);
    }
  });

  it("still round-trips a UUID id", () => {
    const id = generateId();
    const nodeSlug = makeNodeSlug(fileNode(id, "My Doc"));

    expect(nodeSlug).toBe(`my-doc-${id}`);
    expect(extractNodeIdFromSlug(nodeSlug)).toBe(id);
  });

  it("finds no id in a slug that carries none", () => {
    expect(extractNodeIdFromSlug("some-doc-123")).toBeUndefined();
    expect(extractNodeIdFromSlug(undefined)).toBeUndefined();
  });

  it("reads a derived drive id from a drive slug", () => {
    const id = derivedId("drive");
    expect(extractDriveIdFromSlug(id)).toBe(id);
    expect(extractDriveIdFromSlug("powerhouse")).toBeUndefined();
  });
});

describe("setSelectedNode", () => {
  beforeAll(() => {
    addSelectedNodeIdEventHandler();
  });

  beforeEach(() => {
    window.ph = {};
    window.history.replaceState(null, "", "/d/drive");
  });

  afterEach(() => {
    window.ph = {};
    window.history.replaceState(null, "", "/");
  });

  it("selects a node with a v2-required id", () => {
    const id = derivedId("selected");
    const node = fileNode(id, "Groceries");

    setSelectedNode(node);

    expect(window.ph?.selectedNodeId).toBe(id);
    expect(window.location.pathname).toBe(`/d/drive/groceries-${id}`);
  });
});
