import { describe, it, expect } from "vitest";
import { getProjectMapping } from "../src/core/project-mapping.js";
import type { ProjectScanResult } from "../src/core/types.js";
import type {
  FolderOperations,
  FolderEntry,
} from "../src/integrations/powerhouse/types.js";

function makeFolders(entries: FolderEntry[]): FolderOperations {
  return {
    addDocument: async () => {},
    createDocument: async () => ({ documentId: "stub-doc-id" }),
    removeDocument: async () => {},
    getDocument: async () => ({}),
    listFolder: async (folderPath?: string) => {
      if (!folderPath) {
        return entries.filter((e) => !e.path.includes("/"));
      }
      return entries.filter((e) => {
        const parent = e.path.substring(0, e.path.lastIndexOf("/"));
        return parent === folderPath;
      });
    },
    ensureFolder: async () => "folder-id",
    findByType: async () => [],
  };
}

describe("getProjectMapping", () => {
  it("returns scan results as path-only mappings when no folders", async () => {
    const scans: ProjectScanResult[] = [
      { name: "proj-a", path: "/tmp/proj-a" },
    ];
    const result = await getProjectMapping(scans);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: "proj-a",
      path: "/tmp/proj-a",
      documentId: undefined,
      documentType: undefined,
      folderPath: undefined,
    });
  });

  it("preserves documentId/documentType from scan results", async () => {
    const scans: ProjectScanResult[] = [
      {
        name: "proj-a",
        path: "/tmp/proj-a",
        documentId: "doc-1",
        documentType: "test/type",
      },
    ];
    const result = await getProjectMapping(scans);
    expect(result[0]!.documentId).toBe("doc-1");
    expect(result[0]!.documentType).toBe("test/type");
  });

  it("enriches mapping with folderPath when drive entry matches by documentId", async () => {
    const scans: ProjectScanResult[] = [
      {
        name: "proj-a",
        path: "/tmp/proj-a",
        documentId: "doc-1",
        documentType: "test/type",
      },
    ];
    const folders = makeFolders([
      {
        id: "doc-1",
        name: "proj-a",
        type: "document",
        documentType: "test/type",
        path: "proj-a",
      },
    ]);
    const result = await getProjectMapping(scans, folders);
    expect(result).toHaveLength(1);
    expect(result[0]!.folderPath).toBe("proj-a");
  });

  it("adds document-only entries for drive docs not on disk", async () => {
    const scans: ProjectScanResult[] = [
      { name: "proj-a", path: "/tmp/proj-a" },
    ];
    const folders = makeFolders([
      {
        id: "doc-2",
        name: "remote-proj",
        type: "document",
        documentType: "test/type",
        path: "remote-proj",
      },
    ]);
    const result = await getProjectMapping(scans, folders);
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({
      name: "remote-proj",
      path: undefined,
      documentId: "doc-2",
      documentType: "test/type",
      folderPath: "remote-proj",
    });
  });

  it("does not duplicate when drive entry matches existing scan", async () => {
    const scans: ProjectScanResult[] = [
      {
        name: "proj-a",
        path: "/tmp/proj-a",
        documentId: "doc-1",
        documentType: "test/type",
      },
    ];
    const folders = makeFolders([
      {
        id: "doc-1",
        name: "proj-a",
        type: "document",
        documentType: "test/type",
        path: "proj-a",
      },
    ]);
    const result = await getProjectMapping(scans, folders);
    expect(result).toHaveLength(1);
  });

  it("returns empty array for no scans and no folders", async () => {
    const result = await getProjectMapping([]);
    expect(result).toEqual([]);
  });

  it("walks nested folders to find documents", async () => {
    const scans: ProjectScanResult[] = [];
    const folders: FolderOperations = {
      addDocument: async () => {},
      createDocument: async () => ({ documentId: "stub-doc-id" }),
      removeDocument: async () => {},
      getDocument: async () => ({}),
      listFolder: async (folderPath?: string) => {
        if (!folderPath) {
          return [
            {
              id: "folder-1",
              name: "specs",
              type: "folder" as const,
              path: "specs",
            },
          ];
        }
        if (folderPath === "specs") {
          return [
            {
              id: "doc-1",
              name: "nested-doc",
              type: "document" as const,
              documentType: "test/type",
              path: "specs/nested-doc",
            },
          ];
        }
        return [];
      },
      ensureFolder: async () => "folder-id",
      findByType: async () => [],
    };
    const result = await getProjectMapping(scans, folders);
    expect(result).toHaveLength(1);
    expect(result[0]!.documentId).toBe("doc-1");
    expect(result[0]!.folderPath).toBe("specs/nested-doc");
  });
});
