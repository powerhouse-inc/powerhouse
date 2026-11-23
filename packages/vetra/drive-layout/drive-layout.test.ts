import { describe, expect, it } from "vitest";
import { STAGES } from "../editors/vetra-explorer/layout.js";
import {
  checkPackageDrive,
  ensurePackageDrive,
  findLayoutFolder,
  folderForDocumentType,
  folderIdForDocumentType,
  layoutFolderId,
  missingLayoutFolders,
  PACKAGE_DRIVE_FOLDERS,
  type LayoutFolderInput,
  type LayoutNode,
} from "./index.js";

const DRIVE = "drive-1";

const file = (
  id: string,
  documentType: string,
  parentFolder: string | null = null,
): LayoutNode => ({ kind: "file", id, name: id, documentType, parentFolder });

const asNodes = (folders: readonly LayoutFolderInput[]): LayoutNode[] =>
  folders.map((folder) => ({ kind: "folder", ...folder }));

/** A drive with every layout folder. */
const laidOut = (): LayoutNode[] => asNodes(missingLayoutFolders(DRIVE, []));

describe("package drive layout", () => {
  it("lists parents before children", () => {
    for (const path of PACKAGE_DRIVE_FOLDERS) {
      const cut = path.lastIndexOf("/");
      if (cut < 0) continue;
      const parent = PACKAGE_DRIVE_FOLDERS.indexOf(
        path.slice(0, cut) as (typeof PACKAGE_DRIVE_FOLDERS)[number],
      );
      expect(parent).toBeGreaterThanOrEqual(0);
      expect(parent).toBeLessThan(PACKAGE_DRIVE_FOLDERS.indexOf(path));
    }
  });

  it("places every type the explorer shows", () => {
    for (const stage of STAGES) {
      for (const type of stage.documentTypes) {
        expect(folderForDocumentType(type.documentType)).toBeTypeOf("string");
      }
    }
    expect(folderForDocumentType("powerhouse/package")).toBeNull();
    expect(folderForDocumentType("powerhouse/chat-session")).toBeUndefined();
    expect(folderForDocumentType("toString")).toBeUndefined();
  });

  it("derives one folder id per drive and path", () => {
    const id = layoutFolderId(DRIVE, "specify");
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(layoutFolderId(DRIVE, "specify")).toBe(id);
    expect(layoutFolderId("drive-2", "specify")).not.toBe(id);
    const ids = PACKAGE_DRIVE_FOLDERS.map((path) =>
      layoutFolderId(DRIVE, path),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("missingLayoutFolders", () => {
  it("adds the whole layout to an empty drive, each under its parent", () => {
    const folders = missingLayoutFolders(DRIVE, []);
    expect(folders).toHaveLength(PACKAGE_DRIVE_FOLDERS.length);
    const nodes = asNodes(folders);
    for (const path of PACKAGE_DRIVE_FOLDERS) {
      expect(findLayoutFolder(nodes, path)?.id).toBe(
        layoutFolderId(DRIVE, path),
      );
    }
    expect(missingLayoutFolders(DRIVE, nodes)).toEqual([]);
  });

  it("keeps a folder that exists under another id and builds on it", () => {
    const nodes: LayoutNode[] = [
      { kind: "folder", id: "mine", name: "specify", parentFolder: null },
    ];
    const folders = missingLayoutFolders(DRIVE, nodes, ["specify/editors"]);
    expect(folders).toEqual([
      {
        id: layoutFolderId(DRIVE, "specify/editors"),
        name: "editors",
        parentFolder: "mine",
      },
    ]);
  });

  it("adds the parents of a path with it", () => {
    expect(
      missingLayoutFolders(DRIVE, [], ["ideate/features"]).map((f) => f.name),
    ).toEqual(["ideate", "features"]);
  });
});

describe("checkPackageDrive", () => {
  it("reports an empty drive as no package drive, all folders missing", () => {
    const report = checkPackageDrive([]);
    expect(report.isPackageDrive).toBe(false);
    expect(report.missingFolders).toEqual([...PACKAGE_DRIVE_FOLDERS]);
    expect(report.misplaced).toEqual([]);
    expect(report.conforms).toBe(false);
  });

  it("accepts a laid-out drive with its documents in place", () => {
    const nodes = laidOut();
    nodes.push(
      file("pkg", "powerhouse/package"),
      file(
        "dm",
        "powerhouse/document-model",
        layoutFolderId(DRIVE, "specify/document-models"),
      ),
      file("chat", "powerhouse/chat-session"),
    );
    expect(checkPackageDrive(nodes)).toEqual({
      isPackageDrive: true,
      packageDocuments: [{ id: "pkg", name: "pkg" }],
      missingFolders: [],
      misplaced: [],
      conforms: true,
    });
  });

  it("names a document outside its folder, and where it is", () => {
    const nodes = laidOut();
    nodes.push(
      file("pkg", "powerhouse/package", layoutFolderId(DRIVE, "ideate")),
      file("dm", "powerhouse/document-model"),
      file(
        "wbs",
        "powerhouse/work-breakdown-structure",
        layoutFolderId(DRIVE, "ideate/features"),
      ),
    );
    const report = checkPackageDrive(nodes);
    expect(report.conforms).toBe(false);
    expect(report.misplaced).toEqual([
      {
        id: "pkg",
        name: "pkg",
        documentType: "powerhouse/package",
        expected: null,
        actual: "ideate",
      },
      {
        id: "dm",
        name: "dm",
        documentType: "powerhouse/document-model",
        expected: "specify/document-models",
        actual: null,
      },
      {
        id: "wbs",
        name: "wbs",
        documentType: "powerhouse/work-breakdown-structure",
        expected: "build/work",
        actual: "ideate/features",
      },
    ]);
  });

  it("is no package drive with two package documents", () => {
    const nodes = laidOut();
    nodes.push(
      file("a", "powerhouse/package"),
      file("b", "powerhouse/package"),
    );
    const report = checkPackageDrive(nodes);
    expect(report.isPackageDrive).toBe(false);
    expect(report.packageDocuments).toHaveLength(2);
  });
});

describe("ensurePackageDrive", () => {
  function host(initial: LayoutNode[], withPackage = true) {
    const nodes = [...initial];
    const calls: string[] = [];
    return {
      calls,
      nodes: () => Promise.resolve(nodes),
      addFolders: (folders: readonly LayoutFolderInput[]) => {
        calls.push(`folders:${folders.length}`);
        nodes.push(...asNodes(folders));
        return Promise.resolve();
      },
      ...(withPackage
        ? {
            createPackageDocument: () => {
              calls.push("package");
              nodes.push(file("pkg", "powerhouse/package"));
              return Promise.resolve();
            },
          }
        : {}),
    };
  }

  it("lays out an empty drive, then changes nothing on a second run", async () => {
    const h = host([]);
    const first = await ensurePackageDrive(DRIVE, h);
    expect(first.conforms).toBe(true);
    expect(h.calls).toEqual([
      `folders:${PACKAGE_DRIVE_FOLDERS.length}`,
      "package",
    ]);
    const second = await ensurePackageDrive(DRIVE, h);
    expect(second.conforms).toBe(true);
    expect(h.calls).toHaveLength(2);
  });

  it("adds folders only when the host makes no package document", async () => {
    const h = host([], false);
    const report = await ensurePackageDrive(DRIVE, h);
    expect(report.isPackageDrive).toBe(false);
    expect(report.missingFolders).toEqual([]);
  });

  it("moves nothing: a misplaced document stays reported", async () => {
    const h = host([file("dm", "powerhouse/document-model")]);
    const report = await ensurePackageDrive(DRIVE, h);
    expect(report.misplaced.map((m) => m.id)).toEqual(["dm"]);
    expect(folderIdForDocumentType(await h.nodes(), "powerhouse/feature")).toBe(
      layoutFolderId(DRIVE, "ideate/features"),
    );
  });
});
