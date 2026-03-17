import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type {
  IReactorClient,
  ReactorClientModule,
} from "@powerhousedao/reactor";
import { ReactorBuilder, ReactorClientBuilder } from "@powerhousedao/reactor";
import { createReactorMcpProvider } from "@powerhousedao/reactor-mcp";
import type { DocumentDriveDocument } from "document-drive";
import { driveDocumentModelModule } from "document-drive";
import {
  documentModelCreateDocument,
  documentModelDocumentModelModule,
} from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    getChildren: vi.fn().mockResolvedValue({
      results: [],
      options: { cursor: "", limit: 10 },
    }),
    deleteDocument: vi.fn(),
    execute: vi.fn(),
    createDocumentInDrive: vi.fn(),
    find: vi.fn().mockResolvedValue({
      results: [],
      options: { cursor: "", limit: 10 },
    }),
    rename: vi.fn(),
  } as unknown as IReactorClient;

  return mockClient;
};

// Create a real reactor client for integration tests
async function createReactorClientModule(): Promise<ReactorClientModule> {
  const reactorBuilder = new ReactorBuilder().withDocumentModels([
    documentModelDocumentModelModule,
    driveDocumentModelModule,
  ]);

  const module = await new ReactorClientBuilder()
    .withReactorBuilder(reactorBuilder)
    .buildModule();

  return module;
}

describe("ReactorMcpProvider", () => {
  let mockClient: IReactorClient;
  let reactorModule: ReactorClientModule;
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
      });
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
      expect(result.structuredContent).toStrictEqual({
        success: true,
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
});
