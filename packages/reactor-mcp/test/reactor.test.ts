import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type {
  IReactorClient,
  InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import { ReactorBuilder, ReactorClientBuilder } from "@powerhousedao/reactor";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  createReactorMcpProvider,
  createServer,
} from "@powerhousedao/reactor-mcp";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type {
  DocumentModelDocument,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  documentModelCreateDocument,
  documentModelDocumentModelModule,
} from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createP256Signer } from "./utils/p256-signer.js";

function getTextContent(result: CallToolResult, index = 0): string {
  const content = result.content[index];
  return content.type === "text" ? content.text : "";
}

// Mock reactor client for unit tests
const createMockReactorClient = (): IReactorClient => {
  const mockClient = {
    get: vi.fn(),
    getDocumentModelModule: vi.fn(),
    getDocumentModelModules: vi.fn().mockResolvedValue({
      results: [],
      options: { cursor: "", limit: 10 },
    }),
    createEmpty: vi.fn(),
    getOutgoingRelationships: vi.fn().mockResolvedValue({
      results: [],
      options: { cursor: "", limit: 10 },
    }),
    getIncomingRelationships: vi.fn().mockResolvedValue({
      results: [],
      options: { cursor: "", limit: 10 },
    }),
    deleteDocument: vi.fn(),
    execute: vi.fn(),
    drives: {
      addFile: vi.fn(),
    },
    find: vi.fn().mockResolvedValue({
      results: [],
      options: { cursor: "", limit: 10 },
    }),
    rename: vi.fn(),
  } as unknown as IReactorClient;

  return mockClient;
};

// Create a real reactor client for integration tests
async function createReactorClientModule(): Promise<InProcessReactorClientModule> {
  const reactorBuilder = new ReactorBuilder().withDocumentModelSources([
    documentModelDocumentModelModule,
    driveDocumentModelModule,
  ]);

  const module = await new ReactorClientBuilder()
    .withReactorBuilder(reactorBuilder)
    .withSigner(await createP256Signer())
    .buildModule();

  return module;
}

describe("ReactorMcpProvider", () => {
  let mockClient: IReactorClient;
  let reactorModule: InProcessReactorClientModule;
  let client: IReactorClient;

  beforeEach(async () => {
    reactorModule = await createReactorClientModule();
    client = reactorModule.client;
    mockClient = createMockReactorClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    reactorModule.reactor.kill();
  });

  describe("getDocument tool", () => {
    it("should retrieve a document successfully", async () => {
      // Create a document using the client
      const document = documentModelCreateDocument();
      await client.create(document);

      const provider = await createReactorMcpProvider({ client });
      const result = await provider.tools.getDocument.callback({
        id: document.header.id,
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        document: {
          header: expect.objectContaining({
            id: document.header.id,
            documentType: document.header.documentType,
          }),
        },
      });
    });

    it("accepts the ID as documentId", async () => {
      const document = documentModelCreateDocument();
      await client.create(document);

      const provider = await createReactorMcpProvider({ client });
      const result = await provider.tools.getDocument.callback({
        documentId: document.header.id,
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        document: {
          header: expect.objectContaining({ id: document.header.id }),
        },
      });
    });

    it("names the expected parameter when no ID is given", async () => {
      const provider = await createReactorMcpProvider({ client });
      const result = await provider.tools.getDocument.callback({});

      expect(result.isError).toBe(true);
      expect(getTextContent(result)).toBe(
        "Error: getDocument needs the target's ID in `documentId`",
      );
    });

    it("refuses an alias that names a different document", async () => {
      const document = documentModelCreateDocument();
      await client.create(document);

      const provider = await createReactorMcpProvider({ client });
      const result = await provider.tools.getDocument.callback({
        documentId: document.header.id,
        id: "another-id",
      });

      expect(result.isError).toBe(true);
      expect(getTextContent(result)).toContain("pass only `documentId`");
    });

    it("should handle errors gracefully", async () => {
      const provider = await createReactorMcpProvider({ client });
      const result = await provider.tools.getDocument.callback({
        id: "non-existent-id",
      });

      expect(result.isError).toBe(true);
      expect(getTextContent(result)).toContain("non-existent-id");
    });

    it("should handle non-Error exceptions", async () => {
      const errorMessage = "String error message";
      vi.mocked(mockClient.get).mockRejectedValue(errorMessage);

      const provider = await createReactorMcpProvider({ client: mockClient });
      const result = await provider.tools.getDocument.callback({
        id: "test-id",
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        {
          type: "text",
          text: "Error: String error message",
        },
      ]);
    });
  });

  describe("createDocument tool", () => {
    it("should create a document successfully", async () => {
      const provider = await createReactorMcpProvider({ client });
      const result = await provider.tools.createDocument.callback({
        documentType: "powerhouse/document-model",
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        documentId: expect.any(String),
      });
    });

    it("should create a document in a drive when driveId is provided", async () => {
      const drive = await client.createEmpty<DocumentDriveDocument>(
        "powerhouse/document-drive",
      );

      const provider = await createReactorMcpProvider({ client });
      const result = await provider.tools.createDocument.callback({
        documentType: "powerhouse/document-model",
        driveId: drive.header.id,
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        documentId: expect.any(String),
      });

      // Verify the document was created and can be retrieved
      const documentId = (result.structuredContent as { documentId: string })
        .documentId;
      const doc = await client.get(documentId);
      expect(doc).toBeDefined();
      expect(doc.header.documentType).toBe("powerhouse/document-model");
    });

    it("should create a document in a drive with parentFolder", async () => {
      const drive = await client.createEmpty<DocumentDriveDocument>(
        "powerhouse/document-drive",
      );

      // Add a folder to the drive using addActions tool (properly formats actions)
      const folderId = "test-folder-id";
      const provider = await createReactorMcpProvider({ client });
      await provider.tools.addActions.callback({
        documentId: drive.header.id,
        actions: [
          {
            type: "ADD_FOLDER",
            input: { id: folderId, name: "Test Folder" },
            scope: "global",
          },
        ],
      });

      const result = await provider.tools.createDocument.callback({
        documentType: "powerhouse/document-model",
        driveId: drive.header.id,
        parentFolder: folderId,
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        documentId: expect.any(String),
      });

      // Verify the document exists
      const documentId = (result.structuredContent as { documentId: string })
        .documentId;
      const doc = await client.get(documentId);
      expect(doc).toBeDefined();
      expect(doc.header.documentType).toBe("powerhouse/document-model");
    });

    it("should return error for unknown document type with driveId", async () => {
      const drive = await client.createEmpty<DocumentDriveDocument>(
        "powerhouse/document-drive",
      );

      const provider = await createReactorMcpProvider({ client });
      const result = await provider.tools.createDocument.callback({
        documentType: "non-existent/type",
        driveId: drive.header.id,
      });

      expect(result.isError).toBe(true);
      expect(getTextContent(result)).toContain("non-existent/type");
    });
  });

  describe("getDocuments tool", () => {
    it("should get documents from a drive", async () => {
      // Create a drive first
      const drive = await client.createEmpty<DocumentDriveDocument>(
        "powerhouse/document-drive",
      );

      const provider = await createReactorMcpProvider({ client });
      const result = await provider.tools.getDocuments.callback({
        parentId: drive.header.id,
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        documentIds: [],
      });
    });
  });

  describe("deleteDocument tool", () => {
    it("should delete a document successfully", async () => {
      const document = documentModelCreateDocument();
      await client.create(document);

      const provider = await createReactorMcpProvider({ client });
      const result = await provider.tools.deleteDocument.callback({
        documentId: document.header.id,
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        success: true,
      });
    });

    it("should handle deletion of non-existent document", async () => {
      const provider = await createReactorMcpProvider({ client });
      const result = await provider.tools.deleteDocument.callback({
        documentId: "non-existent-id",
      });

      // The new reactor throws for non-existent documents
      expect(result.structuredContent).toMatchObject({
        success: false,
      });
    });

    it("can delete a document orphaned by an invalid (control-character) name", async () => {
      const drive = await client.createEmpty<DocumentDriveDocument>(
        "powerhouse/document-drive",
      );

      const provider = await createReactorMcpProvider({ client });

      // A control char fails ADD_FILE name validation, so the FileNode is
      // dropped while the document and its drive relationship persist (orphan).
      const name = `Concord plan ${String.fromCharCode(7)}`;
      const created = await provider.tools.createDocument.callback({
        documentType: "powerhouse/document-model",
        driveId: drive.header.id,
        name,
      });
      const documentId = (created.structuredContent as { documentId: string })
        .documentId;

      // Document exists, but no FileNode was added to the drive tree.
      await expect(client.get(documentId)).resolves.toBeDefined();
      const driveDoc = await client.get<DocumentDriveDocument>(drive.header.id);
      expect(
        driveDoc.state.global.nodes.find((n) => n.id === documentId),
      ).toBeUndefined();

      const result = await provider.tools.deleteDocument.callback({
        documentId,
      });
      expect(result.structuredContent).toMatchObject({
        success: true,
      });
    });
  });

  describe("addActions tool", () => {
    it("should add an action to a document", async () => {
      const document = documentModelCreateDocument();
      await client.create(document);

      const provider = await createReactorMcpProvider({ client });

      const action = documentModelDocumentModelModule.actions.setModelName({
        name: "test-doc",
      });
      const result = await provider.tools.addActions.callback({
        documentId: document.header.id,
        actions: [action],
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toStrictEqual({
        success: true,
        results: [
          {
            index: 0,
            type: "SET_MODEL_NAME",
            scope: "global",
            operationIndex: expect.any(Number),
          },
        ],
      });
      const updated = await client.get<DocumentModelDocument>(
        document.header.id,
      );
      expect(updated.state.global.name).toBe("test-doc");
    });

    it("should add multiple actions to a document", async () => {
      const document = documentModelCreateDocument();
      await client.create(document);

      const provider = await createReactorMcpProvider({ client });

      const actions = [
        documentModelDocumentModelModule.actions.setModelName({
          name: "Test Name 1",
        }),
        documentModelDocumentModelModule.actions.setModelName({
          name: "Test Name 2",
        }),
      ];
      const result = await provider.tools.addActions.callback({
        documentId: document.header.id,
        actions,
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        success: true,
        results: [
          { index: 0, type: "SET_MODEL_NAME" },
          { index: 1, type: "SET_MODEL_NAME" },
        ],
      });
    });

    it("returns the error of an action its reducer rejected", async () => {
      const drive = await client.createEmpty<DocumentDriveDocument>(
        "powerhouse/document-drive",
      );
      const provider = await createReactorMcpProvider({ client });
      const addFolder = (id: string) => ({
        type: "ADD_FOLDER",
        input: { id, name: id },
        scope: "global",
      });
      await provider.tools.addActions.callback({
        documentId: drive.header.id,
        actions: [addFolder("taken")],
      });

      const result = await provider.tools.addActions.callback({
        documentId: drive.header.id,
        actions: [addFolder("taken")],
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toStrictEqual({
        success: false,
        results: [
          {
            index: 0,
            type: "ADD_FOLDER",
            scope: "global",
            operationIndex: expect.any(Number),
            error: {
              kind: "reducer-error",
              message: "Node with id taken already exists!",
            },
          },
        ],
      });
    });

    it("applies the rest of a batch around a rejected action", async () => {
      const drive = await client.createEmpty<DocumentDriveDocument>(
        "powerhouse/document-drive",
      );
      const provider = await createReactorMcpProvider({ client });
      const addFolder = (id: string) => ({
        type: "ADD_FOLDER",
        input: { id, name: id },
        scope: "global",
      });

      const result = await provider.tools.addActions.callback({
        documentId: drive.header.id,
        actions: [addFolder("a"), addFolder("a"), addFolder("b")],
      });

      expect(result.isError).toBeUndefined();
      const { success, results } = result.structuredContent as {
        success: boolean;
        results: { index: number; error?: { kind: string } }[];
      };
      expect(success).toBe(false);
      expect(results.map((r) => [r.index, r.error?.kind])).toEqual([
        [0, undefined],
        [1, "reducer-error"],
        [2, undefined],
      ]);
      const updated = await client.get<DocumentDriveDocument>(drive.header.id);
      expect(updated.state.global.nodes.map((n) => n.id).sort()).toEqual([
        "a",
        "b",
      ]);
    });

    it("reads the outcomes from the operations when the job carries no result", async () => {
      const drive = await client.createEmpty<DocumentDriveDocument>(
        "powerhouse/document-drive",
      );
      // As a client whose job info has no result field, e.g. a remote one.
      const write = new Proxy(client.write, {
        get(target, key, receiver) {
          if (key !== "execute") return Reflect.get(target, key, receiver);
          return async (...args: Parameters<typeof target.execute>) => {
            const handle = await target.execute(...args);
            const readable = handle.readable.then((receipt) => ({
              ...receipt,
              job: { ...receipt.job, result: undefined },
            }));
            return { ...handle, readable };
          };
        },
      });
      const withoutResults = new Proxy(client, {
        get: (target, key, receiver) =>
          key === "write" ? write : Reflect.get(target, key, receiver),
      });
      const provider = await createReactorMcpProvider({
        client: withoutResults,
      });
      const addFolder = (id: string) => ({
        type: "ADD_FOLDER",
        input: { id, name: id },
        scope: "global",
      });

      const result = await provider.tools.addActions.callback({
        documentId: drive.header.id,
        actions: [addFolder("a"), addFolder("a")],
      });

      expect(result.structuredContent).toStrictEqual({
        success: false,
        results: [
          { index: 0, type: "ADD_FOLDER", scope: "global", operationIndex: 0 },
          {
            index: 1,
            type: "ADD_FOLDER",
            scope: "global",
            operationIndex: 1,
            error: {
              kind: "reducer-error",
              message: "Node with id a already exists!",
            },
          },
        ],
      });
    });

    it("should throw error on invalid action type", async () => {
      const document = documentModelCreateDocument();
      await client.create(document);

      const provider = await createReactorMcpProvider({ client });

      const result = await provider.tools.addActions.callback({
        documentId: document.header.id,
        actions: [
          {
            type: "INVALID_ACTION",
            input: {},
            scope: "global",
          },
        ],
      });

      expect(result.isError).toBe(true);
      expect(getTextContent(result)).toContain(
        `Operation "INVALID_ACTION" is not defined in any module of the document model`,
      );
    });

    it("should throw error on invalid action input", async () => {
      const document = documentModelCreateDocument();
      await client.create(document);

      const provider = await createReactorMcpProvider({ client });

      const result = await provider.tools.addActions.callback({
        documentId: document.header.id,
        actions: [
          {
            type: "SET_MODEL_NAME",
            input: {
              invalidField: "test",
            },
            scope: "global",
          },
        ],
      });

      expect(result.isError).toBe(true);
      expect(getTextContent(result)).toContain("Input validation error");
    });

    it("renames a document with SET_NAME", async () => {
      const document = documentModelCreateDocument();
      await client.create(document);

      const provider = await createReactorMcpProvider({ client });
      const result = await provider.tools.addActions.callback({
        documentId: document.header.id,
        actions: [{ type: "SET_NAME", input: "Renamed", scope: "global" }],
      });

      expect(result.isError).toBeUndefined();
      const updated = await client.get(document.header.id);
      expect(updated.header.name).toBe("Renamed");
    });

    it("sets the preferred editor with SET_PREFERRED_EDITOR", async () => {
      const drive = await client.createEmpty<DocumentDriveDocument>(
        "powerhouse/document-drive",
      );

      const provider = await createReactorMcpProvider({ client });
      const result = await provider.tools.addActions.callback({
        documentId: drive.header.id,
        actions: [
          {
            type: "SET_PREFERRED_EDITOR",
            input: { preferredEditor: "some-app" },
            scope: "header",
          },
        ],
      });

      expect(result.isError).toBeUndefined();
      const updated = await client.get(drive.header.id);
      expect(updated.header.meta?.preferredEditor).toBe("some-app");
    });

    it("rejects a base action in the wrong scope", async () => {
      const document = documentModelCreateDocument();
      await client.create(document);

      const provider = await createReactorMcpProvider({ client });
      const result = await provider.tools.addActions.callback({
        documentId: document.header.id,
        actions: [
          {
            type: "SET_PREFERRED_EDITOR",
            input: { preferredEditor: "some-app" },
            scope: "global",
          },
        ],
      });

      expect(result.isError).toBe(true);
      expect(getTextContent(result)).toContain(
        `Action scope "global" does not match operation scope "header"`,
      );
    });

    it("should throw error on action on non-existent document", async () => {
      const provider = await createReactorMcpProvider({ client });
      const result = await provider.tools.addActions.callback({
        documentId: "non-existent-id",
        actions: [
          {
            type: "SET_NAME",
            input: "Test Name",
            scope: "global",
          },
        ],
      });

      // Action on non-existent document returns an error
      expect(result.isError).toBe(true);
      expect(getTextContent(result)).toContain("non-existent-id");
    });
  });

  describe("getDrives tool", () => {
    it("should list all drives", async () => {
      await client.createEmpty("powerhouse/document-drive");
      await client.createEmpty("powerhouse/document-drive");

      const provider = await createReactorMcpProvider({ client });
      const result = await provider.tools.getDrives.callback({});

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        driveIds: expect.any(Array),
      });
      expect(
        (result.structuredContent as { driveIds: string[] }).driveIds.length,
      ).toBeGreaterThanOrEqual(2);
    });
  });

  describe("addDrive tool", () => {
    it("should add a new drive", async () => {
      const provider = await createReactorMcpProvider({ client });
      const result = await provider.tools.addDrive.callback({
        driveInput: {
          global: {
            name: "New Test Drive",
            icon: "test-icon",
          },
        },
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        driveId: expect.any(String),
      });

      const drive = await client.get<DocumentDriveDocument>(
        (result.structuredContent as { driveId: string }).driveId,
      );
      expect(drive).toMatchObject({
        header: expect.objectContaining({
          documentType: "powerhouse/document-drive",
        }),
      });
    });

    it("names the drive in both the header and the global state", async () => {
      const provider = await createReactorMcpProvider({ client });
      const added = await provider.tools.addDrive.callback({
        driveInput: { global: { name: "Stockroom North" } },
      });
      expect(added.isError).toBeUndefined();

      const result = await provider.tools.getDrive.callback({
        driveId: (added.structuredContent as { driveId: string }).driveId,
      });
      const { drive } = result.structuredContent as {
        drive: DocumentDriveDocument;
      };
      expect(drive.header.name).toBe("Stockroom North");
      expect(drive.state.global.name).toBe("Stockroom North");
    });

    it("names the drive and records the preferred editor", async () => {
      const provider = await createReactorMcpProvider({ client });
      const added = await provider.tools.addDrive.callback({
        driveInput: {
          global: { name: "With Pref" },
          preferredEditor: "stockroom",
        },
      });
      expect(added.isError).toBeUndefined();

      const result = await provider.tools.getDrive.callback({
        driveId: (added.structuredContent as { driveId: string }).driveId,
      });
      const { drive } = result.structuredContent as {
        drive: DocumentDriveDocument;
      };
      expect(drive.header.name).toBe("With Pref");
      expect(drive.header.meta?.preferredEditor).toBe("stockroom");
      expect(drive.state.global.name).toBe("With Pref");
    });

    const readDrive = async (result: CallToolResult) => {
      expect(result.isError).toBeUndefined();
      return client.get<DocumentDriveDocument>(
        (result.structuredContent as { driveId: string }).driveId,
      );
    };

    it("takes name, icon and preferredEditor at the top level", async () => {
      const { addDrive } = (await createReactorMcpProvider({ client })).tools;
      const drive = await readDrive(
        await addDrive.callback({
          name: "Flat",
          icon: "flat-icon",
          preferredEditor: "stockroom",
        }),
      );

      expect(drive.header.name).toBe("Flat");
      expect(drive.header.meta?.preferredEditor).toBe("stockroom");
      expect(drive.state.global.name).toBe("Flat");
      expect(drive.state.global.icon).toBe("flat-icon");
    });

    it("takes the name inside driveInput without global", async () => {
      const { addDrive } = (await createReactorMcpProvider({ client })).tools;
      const drive = await readDrive(
        await addDrive.callback({
          driveInput: { name: "Flat Input", preferredEditor: "stockroom" },
        }),
      );

      expect(drive.header.name).toBe("Flat Input");
      expect(drive.header.meta?.preferredEditor).toBe("stockroom");
      expect(drive.state.global.name).toBe("Flat Input");
    });

    it("needs a name", async () => {
      const { addDrive } = (await createReactorMcpProvider({ client })).tools;
      const result = await addDrive.callback({ preferredEditor: "stockroom" });

      expect(result.isError).toBe(true);
      expect(getTextContent(result)).toBe(
        "Error: addDrive needs the drive's `name`",
      );
    });

    it("refuses two different names", async () => {
      const { addDrive } = (await createReactorMcpProvider({ client })).tools;
      const result = await addDrive.callback({
        name: "One",
        driveInput: { global: { name: "Other" } },
      });

      expect(result.isError).toBe(true);
      expect(getTextContent(result)).toContain(
        "addDrive got different values for `name`",
      );
    });

    it("should add a drive with minimal input", async () => {
      const provider = await createReactorMcpProvider({ client });
      const result = await provider.tools.addDrive.callback({
        driveInput: {
          global: {
            name: "Minimal Drive",
          },
        },
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        driveId: expect.any(String),
      });

      const drive = await client.get<DocumentDriveDocument>(
        (result.structuredContent as { driveId: string }).driveId,
      );
      expect(drive).toMatchObject({
        header: expect.objectContaining({
          documentType: "powerhouse/document-drive",
        }),
      });
    });
  });

  describe("getDrive tool", () => {
    it("should get a specific drive", async () => {
      const drive = await client.createEmpty<DocumentDriveDocument>(
        "powerhouse/document-drive",
      );

      const provider = await createReactorMcpProvider({ client });
      const result = await provider.tools.getDrive.callback({
        driveId: drive.header.id,
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        drive: expect.objectContaining({
          header: expect.objectContaining({
            documentType: "powerhouse/document-drive",
          }),
        }),
      });
    });
  });

  describe("deleteDrive tool", () => {
    it("should delete a drive successfully", async () => {
      const drive = await client.createEmpty<DocumentDriveDocument>(
        "powerhouse/document-drive",
      );

      const provider = await createReactorMcpProvider({ client });
      const result = await provider.tools.deleteDrive.callback({
        driveId: drive.header.id,
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        success: true,
      });
    });

    it("should handle deletion of non-existent drive", async () => {
      const provider = await createReactorMcpProvider({ client });
      const result = await provider.tools.deleteDrive.callback({
        driveId: "non-existent-drive-id",
      });

      // The new reactor throws for non-existent documents
      expect(result.structuredContent).toMatchObject({
        success: false,
      });
    });
  });

  describe("addRemoteDrive tool", () => {
    it("should return an error when syncManager is not configured", async () => {
      // No syncManager provided
      const provider = await createReactorMcpProvider({ client });
      const result = await provider.tools.addRemoteDrive.callback({
        url: "https://example.com/remote-drive",
        options: {
          availableOffline: true,
          sharingType: "public",
          pullFilter: {
            branch: ["main"],
            documentId: ["doc1", "doc2"],
            documentType: ["powerhouse/document-model"],
            scope: ["global"],
          },
          pullInterval: 30000,
        },
      });

      expect(result.isError).toBe(true);
      expect(getTextContent(result)).toContain(
        "Remote drive management is not available",
      );
      expect(getTextContent(result)).toContain(
        "SyncManager was not configured",
      );
    });
  });

  describe("getDocumentModels tool", () => {
    it("should list available document models", async () => {
      const provider = await createReactorMcpProvider({ client });
      const result = await provider.tools.getDocumentModels.callback({});

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        documentModels: expect.any(Array),
      });

      // Should include at least the document model and drive document model
      const models = (
        result.structuredContent as {
          documentModels: Array<{ type: string }>;
        }
      ).documentModels;
      expect(models.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("getDocumentModelSchema tool", () => {
    it("should get schema for a document model", async () => {
      const provider = await createReactorMcpProvider({ client });
      const result = await provider.tools.getDocumentModelSchema.callback({
        type: "powerhouse/document-model",
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        schema: expect.objectContaining({
          name: expect.any(String),
          id: "powerhouse/document-model",
        }),
      });
    });

    it("should return error for non-existent document model", async () => {
      const provider = await createReactorMcpProvider({ client });
      const result = await provider.tools.getDocumentModelSchema.callback({
        type: "non-existent/model",
      });

      expect(result.isError).toBe(true);
      expect(getTextContent(result)).toContain("non-existent/model");
    });
  });

  describe("target ID aliases", () => {
    const idOf = (result: CallToolResult) =>
      (
        result.structuredContent as {
          document?: PHDocument;
          drive?: PHDocument;
        }
      )[result.structuredContent?.document ? "document" : "drive"]?.header.id;

    it("getDrive takes documentId, driveId or id", async () => {
      const drive = await client.createEmpty("powerhouse/document-drive");
      const { getDrive } = (await createReactorMcpProvider({ client })).tools;

      for (const name of ["documentId", "driveId", "id"]) {
        const result = await getDrive.callback({ [name]: drive.header.id });
        expect(result.isError, name).toBeUndefined();
        expect(idOf(result), name).toBe(drive.header.id);
      }
    });

    it("getDocuments takes documentId, driveId or parentId", async () => {
      const drive = await client.createEmpty("powerhouse/document-drive");
      const { createDocument, getDocuments } = (
        await createReactorMcpProvider({ client })
      ).tools;
      const created = await createDocument.callback({
        documentType: "powerhouse/document-model",
        driveId: drive.header.id,
      });
      const { documentId } = created.structuredContent as {
        documentId: string;
      };

      for (const name of ["documentId", "driveId", "parentId"]) {
        const result = await getDocuments.callback({ [name]: drive.header.id });
        expect(result.structuredContent, name).toStrictEqual({
          documentIds: [documentId],
        });
      }
    });

    it("addActions takes documentId or id", async () => {
      const document = documentModelCreateDocument();
      await client.create(document);
      const { addActions } = (await createReactorMcpProvider({ client })).tools;

      for (const name of ["documentId", "id"]) {
        const result = await addActions.callback({
          [name]: document.header.id,
          actions: [{ type: "SET_NAME", input: name, scope: "global" }],
        });
        expect(result.structuredContent, name).toMatchObject({
          success: true,
        });
        expect((await client.get(document.header.id)).header.name).toBe(name);
      }
    });

    it("deleteDocument takes documentId or id", async () => {
      const { deleteDocument } = (await createReactorMcpProvider({ client }))
        .tools;

      for (const name of ["documentId", "id"]) {
        const document = documentModelCreateDocument();
        await client.create(document);
        const result = await deleteDocument.callback({
          [name]: document.header.id,
        });
        expect(result.structuredContent, name).toStrictEqual({
          success: true,
        });
      }
    });

    it("deleteDrive takes documentId, driveId or id", async () => {
      const { deleteDrive } = (await createReactorMcpProvider({ client }))
        .tools;

      for (const name of ["documentId", "driveId", "id"]) {
        const drive = await client.createEmpty("powerhouse/document-drive");
        const result = await deleteDrive.callback({ [name]: drive.header.id });
        expect(result.structuredContent, name).toStrictEqual({
          success: true,
        });
      }
    });

    it("keeps every alias and addDrive shape through the MCP schema", async () => {
      const drive = await client.createEmpty("powerhouse/document-drive");
      const server = await createServer({ client });
      const mcp = new Client({ name: "test", version: "1.0.0" });
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      await Promise.all([
        server.connect(serverTransport),
        mcp.connect(clientTransport),
      ]);

      try {
        const calls = [
          ["getDocument", "documentId"],
          ["getDocument", "id"],
          ["getDrive", "documentId"],
          ["getDrive", "driveId"],
          ["getDrive", "id"],
        ] as const;
        for (const [tool, name] of calls) {
          const result = (await mcp.callTool({
            name: tool,
            arguments: { [name]: drive.header.id },
          })) as CallToolResult;
          expect(result.isError, `${tool} ${name}`).toBeFalsy();
          expect(idOf(result), `${tool} ${name}`).toBe(drive.header.id);
        }

        for (const args of [
          { name: "Top", preferredEditor: "app" },
          { driveInput: { name: "Inner", preferredEditor: "app" } },
          {
            driveInput: { global: { name: "Legacy" }, preferredEditor: "app" },
          },
        ]) {
          const result = (await mcp.callTool({
            name: "addDrive",
            arguments: args,
          })) as CallToolResult;
          expect(result.isError, JSON.stringify(args)).toBeFalsy();
          const created = await client.get(
            (result.structuredContent as { driveId: string }).driveId,
          );
          expect(created.header.meta?.preferredEditor).toBe("app");
        }

        const folder = {
          type: "ADD_FOLDER",
          input: { id: "f", name: "f" },
          scope: "global",
        };
        const added = (await mcp.callTool({
          name: "addActions",
          arguments: { id: drive.header.id, actions: [folder, folder] },
        })) as CallToolResult;
        expect(added.isError).toBeFalsy();
        expect(added.structuredContent).toMatchObject({
          success: false,
          results: [
            { index: 0, type: "ADD_FOLDER" },
            { index: 1, type: "ADD_FOLDER", error: { kind: "reducer-error" } },
          ],
        });
      } finally {
        await mcp.close();
        await server.close();
      }
    });
  });
});
