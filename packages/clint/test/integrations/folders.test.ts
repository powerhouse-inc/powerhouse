// @ts-nocheck — NOTE(port): the ph-clint repo never typechecked its test suite
// (jest ran transpile-only); this file carries pre-existing type drift. Runtime
// assertions are unchanged. Tighten opportunistically when touching the file.
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import {
  createFolderOperations,
  createFolderCommands,
} from "../../src/integrations/powerhouse/folders.js";
import { buildReactor } from "../../src/integrations/powerhouse/reactor.js";
import { ensureDrive } from "../../src/integrations/powerhouse/drive.js";
import type {
  FolderOperations,
  ReactorClientModule,
} from "../../src/integrations/powerhouse/types.js";

// ── Real reactor setup ──────────────────────────────────────────

const testDir = join(
  tmpdir(),
  `folders-test-${randomBytes(4).toString("hex")}`,
);
let reactorModule: ReactorClientModule;
let driveId: string;

beforeAll(async () => {
  reactorModule = await buildReactor({
    documentModels: [],
    storagePath: join(testDir, "reactor-storage"),
    enableSync: false,
  });
  const drive = await ensureDrive(reactorModule, { name: "folder-test-drive" });
  driveId = drive.id;
}, 30_000);

afterAll(async () => {
  if (reactorModule) {
    try {
      const status = reactorModule.reactor.kill();
      await status.completed;
    } catch {}
  }
  await rm(testDir, { recursive: true, force: true }).catch(() => {});
});

// ── FolderOperations tests (real reactor) ────────────────────────

describe("createFolderOperations", () => {
  it("ensureFolder creates nested folder hierarchy in drive nodes", async () => {
    const client = reactorModule.client as any;
    const ops = createFolderOperations(client, driveId);

    const leafId = await ops.ensureFolder("specs/project-a");
    expect(typeof leafId).toBe("string");

    // Read the drive document and verify nodes
    const drive = await client.get(driveId);
    const nodes = (drive as any).state.global.nodes;

    const specsFolder = nodes.find(
      (n: any) => n.kind === "folder" && n.name === "specs",
    );
    expect(specsFolder).toBeDefined();
    expect(specsFolder.parentFolder).toBeNull();

    const projectFolder = nodes.find(
      (n: any) => n.kind === "folder" && n.name === "project-a",
    );
    expect(projectFolder).toBeDefined();
    expect(projectFolder.parentFolder).toBe(specsFolder.id);
    expect(leafId).toBe(projectFolder.id);
  });

  it("ensureFolder reuses existing folders", async () => {
    const client = reactorModule.client as any;
    const ops = createFolderOperations(client, driveId);

    const id1 = await ops.ensureFolder("specs/project-a");
    const id2 = await ops.ensureFolder("specs/project-a");
    expect(id1).toBe(id2);
  });

  it("addDocument creates file node in drive and parent-child relationship", async () => {
    const client = reactorModule.client as any;
    const ops = createFolderOperations(client, driveId);

    // Create a document to add
    const doc = await client.createEmpty("powerhouse/document-model");
    const docId = doc.header.id;

    await ops.addDocument(docId, "specs/project-a", "My Spec Doc");

    // Verify file node in drive document
    const drive = await client.get(driveId);
    const nodes = (drive as any).state.global.nodes;
    const fileNode = nodes.find(
      (n: any) => n.kind === "file" && n.id === docId,
    );
    expect(fileNode).toBeDefined();
    expect(fileNode.name).toBe("My Spec Doc");

    // Verify parent-child relationship (separate from drive nodes)
    const children = await client.getOutgoingRelationships(driveId, "child");
    const childIds = (children.results ?? children).map(
      (c: any) => c.header?.id ?? c.id,
    );
    expect(childIds).toContain(docId);
  });

  it("createDocument emits CREATE_DOCUMENT and UPGRADE_DOCUMENT in the document scope", async () => {
    const client = reactorModule.client as any;
    const ops = createFolderOperations(client, driveId);

    const { documentId } = await ops.createDocument(
      "powerhouse/document-model",
      "specs/created-via-folders",
      "Spec via createDocument",
    );

    const drive = await client.get(driveId);
    const nodes = (drive as any).state.global.nodes;
    const fileNode = nodes.find(
      (n: any) => n.kind === "file" && n.id === documentId,
    );
    expect(fileNode).toBeDefined();
    expect(fileNode.name).toBe("Spec via createDocument");

    const opsPage = await client.getOperations(documentId);
    const opTypes = (opsPage.results ?? opsPage).map(
      (op: any) => op.action?.type ?? op.type,
    );
    expect(opTypes).toContain("CREATE_DOCUMENT");
    expect(opTypes).toContain("UPGRADE_DOCUMENT");
  });

  it("addDocument skips duplicate file nodes", async () => {
    const client = reactorModule.client as any;
    const ops = createFolderOperations(client, driveId);

    // Create a document
    const doc = await client.createEmpty("powerhouse/document-model");
    const docId = doc.header.id;

    await ops.addDocument(docId, "specs");
    // Get node count
    const drive1 = await client.get(driveId);
    const count1 = (drive1 as any).state.global.nodes.filter(
      (n: any) => n.id === docId,
    ).length;

    // Add again — should not create duplicate
    await ops.addDocument(docId, "specs");
    const drive2 = await client.get(driveId);
    const count2 = (drive2 as any).state.global.nodes.filter(
      (n: any) => n.id === docId,
    ).length;

    expect(count2).toBe(count1);
  });

  it("removeDocument deletes node and removes relationship", async () => {
    const client = reactorModule.client as any;
    const ops = createFolderOperations(client, driveId);

    // Create and add a document
    const doc = await client.createEmpty("powerhouse/document-model");
    const docId = doc.header.id;
    await ops.addDocument(docId, "specs");

    // Remove it
    await ops.removeDocument(docId);

    // Verify node removed from drive
    const drive = await client.get(driveId);
    const nodes = (drive as any).state.global.nodes;
    const fileNode = nodes.find((n: any) => n.id === docId);
    expect(fileNode).toBeUndefined();

    // Verify parent-child relationship removed
    const children = await client.getOutgoingRelationships(driveId, "child");
    const childIds = (children.results ?? children).map(
      (c: any) => c.header?.id ?? c.id,
    );
    expect(childIds).not.toContain(docId);
  });

  it("listFolder lists root contents", async () => {
    const client = reactorModule.client as any;
    const ops = createFolderOperations(client, driveId);

    const entries = await ops.listFolder();
    // Should include the "specs" folder created earlier
    const specsEntry = entries.find(
      (e) => e.name === "specs" && e.type === "folder",
    );
    expect(specsEntry).toBeDefined();
  });

  it("listFolder lists subfolder contents", async () => {
    const client = reactorModule.client as any;
    const ops = createFolderOperations(client, driveId);

    const entries = await ops.listFolder("specs");
    // Should include "project-a" folder
    const projectEntry = entries.find(
      (e) => e.name === "project-a" && e.type === "folder",
    );
    expect(projectEntry).toBeDefined();
  });

  it("listFolder returns empty for non-existent path", async () => {
    const client = reactorModule.client as any;
    const ops = createFolderOperations(client, driveId);

    const entries = await ops.listFolder("does-not-exist/at-all");
    expect(entries).toEqual([]);
  });

  it("getDocument returns document by ID", async () => {
    const client = reactorModule.client as any;
    const ops = createFolderOperations(client, driveId);

    const doc = await client.createEmpty("powerhouse/document-model");
    const result = await ops.getDocument(doc.header.id);
    expect(result).toBeDefined();
    expect((result as any).header.id).toBe(doc.header.id);
  });

  it("findByType returns matching file nodes", async () => {
    const client = reactorModule.client as any;
    const ops = createFolderOperations(client, driveId);

    // All documents we added were powerhouse/document-model
    const results = await ops.findByType("powerhouse/document-model");
    expect(results.length).toBeGreaterThan(0);
    expect(
      results.every((r) => r.documentType === "powerhouse/document-model"),
    ).toBe(true);
  });

  it("drive document contains correct folder and file node structure", async () => {
    const client = reactorModule.client as any;

    // Use a fresh folder path for an isolated structure check
    const ops = createFolderOperations(client, driveId);
    const doc = await client.createEmpty("powerhouse/document-model");
    const docId = doc.header.id;
    await ops.addDocument(docId, "reports/weekly", "Week 1 Report");

    const drive = await client.get(driveId);
    const nodes = (drive as any).state.global.nodes;

    // "reports" folder at root
    const reportsFolder = nodes.find(
      (n: any) => n.kind === "folder" && n.name === "reports",
    );
    expect(reportsFolder).toBeDefined();
    expect(reportsFolder.parentFolder).toBeNull();

    // "weekly" folder under "reports"
    const weeklyFolder = nodes.find(
      (n: any) => n.kind === "folder" && n.name === "weekly",
    );
    expect(weeklyFolder).toBeDefined();
    expect(weeklyFolder.parentFolder).toBe(reportsFolder.id);

    // File node in "weekly"
    const fileNode = nodes.find(
      (n: any) => n.kind === "file" && n.id === docId,
    );
    expect(fileNode).toBeDefined();
    expect(fileNode.name).toBe("Week 1 Report");
    expect(fileNode.parentFolder).toBe(weeklyFolder.id);
    expect(fileNode.documentType).toBe("powerhouse/document-model");
  });
});

// ── createFolderCommands tests ───────────────────────────────────
// These test the command wrappers — they use a thin FolderOperations
// interface, not the reactor directly. This is not mocking; it's testing
// the command layer in isolation from the reactor layer.

describe("createFolderCommands", () => {
  it("generates four commands with correct IDs", () => {
    const ops = {} as FolderOperations;
    const cmds = createFolderCommands(ops);

    expect(cmds).toHaveLength(4);
    expect(cmds.map((c) => c.id)).toEqual([
      "folders-add-document",
      "folders-remove-document",
      "folders-get-document",
      "folders-ls",
    ]);
  });

  it("each command has inputSchema and execute", () => {
    const ops = {} as FolderOperations;
    const cmds = createFolderCommands(ops);

    for (const cmd of cmds) {
      expect(cmd.inputSchema).toBeDefined();
      expect(typeof cmd.execute).toBe("function");
    }
  });

  it("folders-ls execute returns formatted output", async () => {
    const ops: FolderOperations = {
      addDocument: async () => {},
      removeDocument: async () => {},
      getDocument: async () => ({}),
      listFolder: async () => [
        {
          id: "abcdefgh1234",
          name: "my-folder",
          type: "folder",
          path: "my-folder",
        },
        {
          id: "ijklmnop5678",
          name: "readme",
          type: "document",
          documentType: "test/doc",
          path: "readme",
        },
      ],
      ensureFolder: async () => "",
      findByType: async () => [],
    };

    const cmds = createFolderCommands(ops);
    const lsCmd = cmds.find((c) => c.id === "folders-ls")!;
    const result = await lsCmd.execute({}, {} as any);
    expect(result).toEqual(
      expect.objectContaining({
        text: expect.stringContaining("[dir] my-folder"),
      }),
    );
    expect(result.text).toContain("[doc] readme (test/doc)");
  });

  it("folders-add-document execute calls addDocument and returns confirmation", async () => {
    let addedWith:
      | { documentId: string; folderPath: string; name?: string }
      | undefined;
    const ops: FolderOperations = {
      addDocument: async (documentId, folderPath, name) => {
        addedWith = { documentId, folderPath, name };
      },
      createDocument: async () => ({ documentId: "" }),
      removeDocument: async () => {},
      getDocument: async () => ({}),
      listFolder: async () => [],
      ensureFolder: async () => "",
      findByType: async () => [],
    };

    const cmds = createFolderCommands(ops);
    const cmd = cmds.find((c) => c.id === "folders-add-document")!;
    const result = await cmd.execute(
      { documentId: "doc-1", folderPath: "specs/project", name: "My Doc" },
      {} as any,
    );
    expect(result.text).toContain("doc-1");
    expect(result.text).toContain("specs/project");
    expect(addedWith).toEqual({
      documentId: "doc-1",
      folderPath: "specs/project",
      name: "My Doc",
    });
  });

  it("folders-remove-document execute calls removeDocument and returns confirmation", async () => {
    let removedId: string | undefined;
    const ops: FolderOperations = {
      addDocument: async () => {},
      createDocument: async () => ({ documentId: "" }),
      removeDocument: async (id) => {
        removedId = id;
      },
      getDocument: async () => ({}),
      listFolder: async () => [],
      ensureFolder: async () => "",
      findByType: async () => [],
    };

    const cmds = createFolderCommands(ops);
    const cmd = cmds.find((c) => c.id === "folders-remove-document")!;
    const result = await cmd.execute({ documentId: "doc-99" }, {} as any);
    expect(result.text).toContain("doc-99");
    expect(removedId).toBe("doc-99");
  });

  it("folders-get-document execute returns document as JSON", async () => {
    const fakeDoc = {
      header: { id: "doc-42" },
      state: { global: { title: "Test" } },
    };
    const ops: FolderOperations = {
      addDocument: async () => {},
      createDocument: async () => ({ documentId: "" }),
      removeDocument: async () => {},
      getDocument: async () => fakeDoc,
      listFolder: async () => [],
      ensureFolder: async () => "",
      findByType: async () => [],
    };

    const cmds = createFolderCommands(ops);
    const cmd = cmds.find((c) => c.id === "folders-get-document")!;
    const result = await cmd.execute({ documentId: "doc-42" }, {} as any);
    expect(result.data).toEqual(fakeDoc);
    expect(result.text).toContain("doc-42");
  });

  it("folders-ls returns empty message for empty folder", async () => {
    const ops: FolderOperations = {
      addDocument: async () => {},
      removeDocument: async () => {},
      getDocument: async () => ({}),
      listFolder: async () => [],
      ensureFolder: async () => "",
      findByType: async () => [],
    };

    const cmds = createFolderCommands(ops);
    const lsCmd = cmds.find((c) => c.id === "folders-ls")!;
    const result = await lsCmd.execute({}, {} as any);
    expect(result.text).toBe("Empty folder");
  });
});
