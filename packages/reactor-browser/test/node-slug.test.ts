import type { FileNode } from "@powerhousedao/shared/document-drive";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
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
  findDriveBySlug,
  makeDriveSlug,
  makeNodeSlug,
} from "../src/utils/url.js";
import { bindPHStoreToWindow, createPHStore } from "../src/hooks/ph-store.js";
import { setSelectedDrive } from "../src/hooks/selected-drive.js";
import { findDriveBySlugOrId } from "../src/routing/resolve-drive-route.js";

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

  it("follows a node renamed in place, despite caching per node", () => {
    const node = fileNode(generateId(), "Draft");
    expect(makeNodeSlug(node)).toBe(`draft-${node.id}`);
    expect(makeNodeSlug(node)).toBe(`draft-${node.id}`);
    node.name = "Final";
    expect(makeNodeSlug(node)).toBe(`final-${node.id}`);
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

describe("drive slugs", () => {
  const id = "0bd8a6a3-08ab-4b4a-a8a4-5d6a0a5ad1e1";
  function drive(slug: string, name: string) {
    const document = driveDocumentModelModule.utils.createDocument();
    document.header.id = id;
    document.header.slug = slug;
    document.state.global.name = name;
    return document;
  }

  it("names a drive without a slug of its own <name>-<id>", () => {
    expect(makeDriveSlug(drive(id, "Team Space"))).toBe(`team-space-${id}`);
    expect(makeDriveSlug(drive("", "Team Space"))).toBe(`team-space-${id}`);
    expect(makeDriveSlug(drive("", ""))).toBe(id);
    expect(makeDriveSlug(drive("team", "Team Space"))).toBe("team");
  });

  it("keeps a readable id as the slug and names only an opaque one", () => {
    const vetra = drive("vetra-62746fd7", "Vetra");
    vetra.header.id = "vetra-62746fd7";
    expect(makeDriveSlug(vetra)).toBe("vetra-62746fd7");
    vetra.header.slug = "";
    expect(makeDriveSlug(vetra)).toBe("vetra-62746fd7");

    const derived = drive("", "Team Space");
    derived.header.id = derivedId("drive-slug");
    expect(makeDriveSlug(derived)).toBe(`team-space-${derived.header.id}`);
  });

  it("follows a drive renamed in place, despite caching per drive", () => {
    const listed = drive("", "Team Space");
    expect(makeDriveSlug(listed)).toBe(`team-space-${id}`);
    listed.state.global.name = "Other";
    expect(makeDriveSlug(listed)).toBe(`other-${id}`);
    expect(findDriveBySlug([listed], `other-${id}`)).toBe(listed);
  });

  it("finds a drive by slug, id, or a <name>-<id> slug's id", () => {
    const store = createPHStore();
    const listed = drive(id, "Team Space");
    store.drives = [listed];
    expect(findDriveBySlugOrId(store, id)).toBe(listed);
    expect(findDriveBySlugOrId(store, `team-space-${id}`)).toBe(listed);
    expect(findDriveBySlugOrId(store, `old-name-${id}`)).toBe(listed);
    expect(findDriveBySlugOrId(store, "other")).toBeUndefined();
  });

  it("finds a readable-id drive by its id or an older <name>-<id> slug", () => {
    const custom = drive("vetra-1a2b", "Vetra");
    custom.header.id = "vetra-1a2b";
    expect(findDriveBySlug([custom], "vetra-vetra-1a2b")).toBe(custom);
    expect(findDriveBySlug([custom], "vetra-1a2b")).toBe(custom);
    expect(findDriveBySlug([custom], "other-vetra-1a2b")).toBeUndefined();
  });

  it("keeps a drive selected after the fallback writes its <name>-<id> url", () => {
    const store = createPHStore();
    bindPHStoreToWindow(store);
    const listed = drive(id, "Team Space");
    store.drives = [listed];

    setSelectedDrive(listed);

    expect(window.location.pathname).toBe(`/d/team-space-${id}`);
    expect(store.selectedDriveId).toBe(id);
    window.history.replaceState(null, "", "/");
  });
});
