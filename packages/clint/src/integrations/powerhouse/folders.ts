/**
 * FolderOperations — programmatic API for managing documents
 * in the agent's personal drive using the drive's internal node tree.
 *
 * Folders and file references are stored as nodes in the drive document's
 * `state.global.nodes` array, managed via ADD_FOLDER and ADD_FILE operations.
 * This is distinct from the parent-child document graph (addRelationship/getOutgoingRelationships).
 *
 * Also exports `createFolderCommands()` to auto-generate CLI commands
 * that wrap the folder operations.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { TypedReactorClient } from "./types.js";
import type { FolderEntry, FolderOperations } from "./types.js";
import type { Command } from "../../core/types.js";
import type { Logger } from "../../core/types.js";

const TAG = "[folders]";

/** Node shape from drive state.global.nodes */
interface DriveNode {
  id: string;
  name: string;
  kind: string;
  parentFolder?: string | null;
  documentType?: string;
}

function isFolder(node: DriveNode): boolean {
  return node.kind === "folder";
}

/**
 * Read the drive document's internal nodes array.
 */
async function getDriveNodes(
  client: TypedReactorClient<any>,
  driveId: string,
): Promise<DriveNode[]> {
  const drive = (await client.get(driveId)) as any;
  return (drive?.state?.global?.nodes ?? []) as DriveNode[];
}

/**
 * Create a FolderOperations instance backed by the reactor client.
 *
 * Folders are nodes inside the drive document's `state.global.nodes` array,
 * created via `ADD_FOLDER` and `ADD_FILE` drive operations executed on the
 * personal drive. This is separate from the document relationship graph.
 */
export function createFolderOperations(
  client: TypedReactorClient<any>,
  personalDriveId: string,
  log?: Logger,
): FolderOperations {
  /**
   * Lazy-load drive action creators from @powerhousedao/shared.
   * Kept lazy so that importing folders.ts doesn't pull in the entire
   * @powerhousedao/shared tree — which is an optional peer dependency
   * and won't be installed in non-Powerhouse projects.
   */
  let _driveActions: {
    addFolder: (input: {
      id: string;
      name: string;
      parentFolder: string | null;
    }) => unknown;
    addFile: (input: {
      id: string;
      name: string;
      documentType: string;
      parentFolder: string | null;
    }) => unknown;
    deleteNode: (input: { id: string }) => unknown;
  } | null = null;

  async function getDriveActions() {
    if (!_driveActions) {
      const mod = (await import("@powerhousedao/shared/document-drive")) as any;
      _driveActions = {
        addFolder: mod.addFolder,
        addFile: mod.addFile,
        deleteNode: mod.deleteNode,
      };
    }
    return _driveActions;
  }

  function splitPath(folderPath: string): string[] {
    return folderPath.split("/").filter(Boolean);
  }

  /**
   * Find a folder node by name under a given parent in the drive's nodes.
   */
  function findFolderInNodes(
    nodes: DriveNode[],
    name: string,
    parentId: string | null,
  ): DriveNode | undefined {
    return nodes.find(
      (n) =>
        isFolder(n) && n.name === name && (n.parentFolder ?? null) === parentId,
    );
  }

  async function ensureFolder(folderPath: string): Promise<string> {
    const segments = splitPath(folderPath);
    let parentFolderId: string | null = null;

    for (const segment of segments) {
      const nodes = await getDriveNodes(client, personalDriveId);
      const existing = findFolderInNodes(nodes, segment, parentFolderId);

      if (existing) {
        log?.debug(
          `${TAG} ensureFolder segment "${segment}" → exists ${existing.id.slice(0, 8)}…`,
        );
        parentFolderId = existing.id;
        continue;
      }

      // Create folder node inside the drive via ADD_FOLDER operation
      const folderId = randomUUID();
      log?.debug(
        `${TAG} ensureFolder creating folder "${segment}" (${folderId.slice(0, 8)}…) ` +
          `under ${parentFolderId?.slice(0, 8) ?? "root"}`,
      );
      const actions = await getDriveActions();
      await client.execute(personalDriveId, "main", [
        actions.addFolder({
          id: folderId,
          name: segment,
          parentFolder: parentFolderId,
        }),
      ]);
      parentFolderId = folderId;
    }

    return parentFolderId!;
  }

  async function addDocument(
    documentId: string,
    folderPath: string,
    name?: string,
  ): Promise<void> {
    log?.debug(
      `${TAG} addDocument ${documentId.slice(0, 8)}… to "${folderPath}" name=${name ?? "(none)"}`,
    );
    const folderId = await ensureFolder(folderPath);

    // Check if this document is already registered as a file node in the drive
    const nodes = await getDriveNodes(client, personalDriveId);
    const existingFile = nodes.find((n) => !isFolder(n) && n.id === documentId);
    if (existingFile) {
      log?.debug(
        `${TAG} addDocument ${documentId.slice(0, 8)}… already in drive as "${existingFile.name}"`,
      );
      return;
    }

    // Get the document to read its type
    const doc = (await client.get(documentId)) as any;
    const documentType =
      doc?.header?.documentType ?? doc?.documentType ?? "unknown";
    const displayName = name ?? doc?.header?.name ?? doc?.name ?? documentId;

    // Add file node to drive via ADD_FILE operation
    const actions = await getDriveActions();
    await client.execute(personalDriveId, "main", [
      actions.addFile({
        id: documentId,
        name: displayName,
        documentType,
        parentFolder: folderId,
      }),
    ]);

    // Also establish the parent-child relationship in the document graph
    await client.addRelationship(personalDriveId, documentId, "child");

    if (name) {
      await client.rename(documentId, name);
    }

    log?.debug(
      `${TAG} addDocument ${documentId.slice(0, 8)}… added as "${displayName}" in folder ${folderId.slice(0, 8)}…`,
    );
  }

  async function createDocument(
    documentType: string,
    folderPath: string,
    name?: string,
  ): Promise<{ documentId: string }> {
    log?.debug(
      `${TAG} createDocument type=${documentType} folder="${folderPath}" name=${name ?? "(none)"}`,
    );
    const parentFolderId = await ensureFolder(folderPath);

    const module = await client.getDocumentModelModule(documentType);
    const doc = module.utils.createDocument();
    if (name) {
      doc.header.name = name;
    }

    await client.drives.addFile(personalDriveId, doc, parentFolderId);

    log?.debug(
      `${TAG} createDocument ${doc.header.id.slice(0, 8)}… created in folder ${parentFolderId.slice(0, 8)}…`,
    );
    return { documentId: doc.header.id };
  }

  async function removeDocument(
    documentId: string,
    _folderPath?: string,
  ): Promise<void> {
    // Remove the file node from the drive via DELETE_NODE
    const actions = await getDriveActions();
    await client.execute(personalDriveId, "main", [
      actions.deleteNode({ id: documentId }),
    ]);

    // Also remove the parent-child relationship
    await client.removeRelationship(personalDriveId, documentId, "child");
  }

  async function resolveFolder(
    folderPath: string,
  ): Promise<string | undefined> {
    const segments = splitPath(folderPath);
    const nodes = await getDriveNodes(client, personalDriveId);
    let parentFolderId: string | null = null;

    for (const segment of segments) {
      const match = findFolderInNodes(nodes, segment, parentFolderId);
      if (!match) return undefined;
      parentFolderId = match.id;
    }

    return parentFolderId ?? undefined;
  }

  async function getDocument(documentId: string): Promise<unknown> {
    return client.get(documentId);
  }

  async function listFolder(folderPath?: string): Promise<FolderEntry[]> {
    let parentFolderId: string | null = null;

    if (folderPath) {
      const resolved = await resolveFolder(folderPath);
      if (!resolved) return [];
      parentFolderId = resolved;
    }

    const nodes = await getDriveNodes(client, personalDriveId);
    const prefix = folderPath ? folderPath.replace(/\/+$/, "") : "";

    return nodes
      .filter((n) => (n.parentFolder ?? null) === parentFolderId)
      .map((n) => ({
        id: n.id,
        name: n.name,
        type: isFolder(n) ? ("folder" as const) : ("document" as const),
        documentType: isFolder(n) ? undefined : n.documentType,
        path: prefix ? `${prefix}/${n.name}` : n.name,
      }));
  }

  async function findByType(documentType: string): Promise<FolderEntry[]> {
    const nodes = await getDriveNodes(client, personalDriveId);
    return nodes
      .filter((n) => !isFolder(n) && n.documentType === documentType)
      .map((n) => ({
        id: n.id,
        name: n.name,
        type: "document" as const,
        documentType: n.documentType,
        path: n.name,
      }));
  }

  return {
    addDocument,
    createDocument,
    removeDocument,
    getDocument,
    listFolder,
    ensureFolder,
    findByType,
  };
}

// ── Folder command schemas ────────────────────────────────────────

const addDocumentSchema = z.object({
  documentId: z.string().describe("Document ID to add"),
  folderPath: z.string().describe('Folder path (e.g. "specs/my-project")'),
  name: z.string().optional().describe("Display name for the document"),
});

const removeDocumentSchema = z.object({
  documentId: z.string().describe("Document ID to remove"),
  folderPath: z.string().optional().describe("Folder path to remove from"),
});

const getDocumentSchema = z.object({
  documentId: z.string().describe("Document ID to retrieve"),
});

const listFolderSchema = z.object({
  folderPath: z.string().optional().describe("Folder path (root if omitted)"),
});

/**
 * Auto-generate CLI commands that wrap FolderOperations.
 */
export function createFolderCommands(folderOps: FolderOperations): Command[] {
  const addDocument: Command<typeof addDocumentSchema> = {
    id: "folders-add-document",
    description: "Add a document to the personal drive at a folder path",
    inputSchema: addDocumentSchema,
    outputSchema: z.object({ text: z.string() }),
    execute: async (input) => {
      await folderOps.addDocument(
        input.documentId,
        input.folderPath,
        input.name,
      );
      return {
        text: `Added document ${input.documentId} to ${input.folderPath}`,
      };
    },
  };

  const removeDocument: Command<typeof removeDocumentSchema> = {
    id: "folders-remove-document",
    description: "Remove a document from the personal drive",
    inputSchema: removeDocumentSchema,
    outputSchema: z.object({ text: z.string() }),
    execute: async (input) => {
      await folderOps.removeDocument(input.documentId, input.folderPath);
      return { text: `Removed document ${input.documentId}` };
    },
  };

  const getDocument: Command<typeof getDocumentSchema> = {
    id: "folders-get-document",
    description: "Get a document from the personal drive",
    inputSchema: getDocumentSchema,
    outputSchema: z.object({ text: z.string(), data: z.unknown() }),
    execute: async (input) => {
      const doc = await folderOps.getDocument(input.documentId);
      return { text: JSON.stringify(doc, null, 2), data: doc };
    },
  };

  const listFolder: Command<typeof listFolderSchema> = {
    id: "folders-ls",
    description: "List folder contents in the personal drive",
    inputSchema: listFolderSchema,
    outputSchema: z.object({ text: z.string(), data: z.array(z.unknown()) }),
    execute: async (input) => {
      const entries = await folderOps.listFolder(input.folderPath);
      if (entries.length === 0) {
        return { text: "Empty folder", data: [] };
      }
      const lines = entries.map((e) => {
        const icon = e.type === "folder" ? "[dir]" : "[doc]";
        const typeInfo = e.documentType ? ` (${e.documentType})` : "";
        return `  ${icon} ${e.name}${typeInfo}  ${e.id.slice(0, 8)}...`;
      });
      return { text: lines.join("\n"), data: entries };
    },
  };

  return [addDocument, removeDocument, getDocument, listFolder];
}
