/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-deprecated */
import { type RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import {
  type ServerNotification,
  type ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import {
  driveDocumentModelModule,
  ReactorBuilder,
  type IDocumentDriveServer,
} from "document-drive";
import { DocumentNotFoundError } from "document-drive/server/error";
import {
  documentModelDocumentModelModule,
  generateId,
  type DocumentModelModule,
} from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReactorMcpProvider } from "../src/mcp/reactor.js";

const mockExtra = {} as RequestHandlerExtra<ServerRequest, ServerNotification>;
// Mock reactor
const createMockReactor = (): IDocumentDriveServer => {
  const mockReactor = {
    initialize: vi.fn().mockResolvedValue(undefined),
    getDocument: vi.fn(),
  } as unknown as IDocumentDriveServer;

  return mockReactor;
};

async function createReactor() {
  const builder = new ReactorBuilder([
    documentModelDocumentModelModule,
    driveDocumentModelModule,
  ] as DocumentModelModule[]);

  const reactor = builder.build();
  await reactor.initialize();

  return reactor;
}

describe("ReactorMcpProvider", () => {
  let mockReactor: IDocumentDriveServer;
  let reactor: IDocumentDriveServer;

  beforeEach(async () => {
    reactor = await createReactor();
    mockReactor = createMockReactor();
    vi.clearAllMocks();
  });

  it("should initialize reactor on creation", async () => {
    await createReactorMcpProvider(mockReactor);

    expect(mockReactor.initialize).toHaveBeenCalledOnce();
  });

  describe("createDocument tool", () => {
    it("should retrieve a document successfully", async () => {
      const document = documentModelDocumentModelModule.utils.createDocument();
      const resultDocument = await reactor.addDocument(document);

      const provider = await createReactorMcpProvider(reactor);
      const result = await provider.tools.getDocument.callback(
        {
          id: document.header.id,
        },
        mockExtra,
      );

      expect(result.content).toStrictEqual([]);
      expect(result.structuredContent).toMatchObject({
        document: resultDocument,
      });
      expect(result.isError).toBeUndefined();
    });

    it("should handle errors gracefully", async () => {
      const provider = await createReactorMcpProvider(reactor);
      const result = await provider.tools.getDocument.callback(
        {
          id: "non-existent-id",
        },
        mockExtra,
      );

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        {
          type: "text",
          text: "Error: Document with id non-existent-id not found",
        },
      ]);
      expect(result.structuredContent).toEqual({
        error: "Document with id non-existent-id not found",
      });
    });

    it("should handle non-Error exceptions", async () => {
      const errorMessage = "String error message";
      mockReactor.getDocument = vi.fn().mockRejectedValue(errorMessage);

      const provider = await createReactorMcpProvider(mockReactor);
      const result = await provider.tools.getDocument.callback(
        {
          id: "test-id",
        },
        mockExtra,
      );

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        {
          type: "text",
          text: "Error: String error message",
        },
      ]);
      expect(result.structuredContent).toEqual({
        error: "String error message",
      });
    });

    it("should handle invalid output", async () => {
      mockReactor.getDocument = vi.fn().mockResolvedValue(undefined);

      const provider = await createReactorMcpProvider(mockReactor);
      const result = await provider.tools.getDocument.callback(
        {
          id: "test-id",
        },
        mockExtra,
      );

      const expectedErrorMessage = `Invalid tool output\n${JSON.stringify(
        [
          {
            code: "invalid_type",
            expected: "object",
            received: "undefined",
            path: ["document"],
            message: "Required",
          },
        ],
        null,
        2,
      )}`;

      expect(result.isError).toBe(true);
      expect(result.content).toStrictEqual([
        {
          type: "text",
          text: `Error: ${expectedErrorMessage}`,
        },
      ]);
      expect(result.structuredContent).toEqual({
        error: expectedErrorMessage,
      });
    });

    it("should handle empty string ID", async () => {
      mockReactor.getDocument = vi
        .fn()
        .mockRejectedValue(new DocumentNotFoundError(""));

      const provider = await createReactorMcpProvider(reactor);
      const result = await provider.tools.getDocument.callback(
        { id: "" },
        mockExtra,
      );

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        {
          type: "text",
          text: "Error: Document with id  not found",
        },
      ]);
      expect(result.structuredContent).toEqual({
        error: "Document with id  not found",
      });
    });
  });

  describe("createDocument tool", () => {
    it("should create a document successfully", async () => {
      const initialDoc =
        documentModelDocumentModelModule.utils.createDocument();
      const provider = await createReactorMcpProvider(reactor);
      const result = await provider.tools.createDocument.callback(
        {
          documentType: "powerhouse/document-model",
          documentId: "test-doc-id",
        },
        mockExtra,
      );

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        result: {
          status: "SUCCESS",
          operations: [],
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          document: expect.objectContaining({
            ...initialDoc,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            header: expect.objectContaining({
              id: "test-doc-id",
              documentType: "powerhouse/document-model",
            }),
          }),
          signals: [],
        },
      });
    });
  });

  describe("getDocuments tool", () => {
    it("should get documents from a drive", async () => {
      const drive = await reactor.addDrive({
        global: { name: "Test Drive" },
      });
      const provider = await createReactorMcpProvider(reactor);
      const result = await provider.tools.getDocuments.callback(
        {
          parentId: drive.header.id,
        },
        mockExtra,
      );

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        documentIds: [],
      });

      const { document } = await reactor.queueDocument({
        documentType: "powerhouse/document-model",
        id: generateId(),
      });

      const addResult = await reactor.addAction(
        drive.header.id,
        driveDocumentModelModule.actions.addFile({
          id: document?.header.id,
          documentType: "powerhouse/document-model",
          name: "test-doc",
        }),
      );
      expect(addResult.error).toBeUndefined();

      const result2 = await provider.tools.getDocuments.callback(
        {
          parentId: drive.header.id,
        },
        mockExtra,
      );

      expect(result2.structuredContent).toMatchObject({
        documentIds: [document?.header.id],
      });
    });
  });

  describe("deleteDocument tool", () => {
    it("should delete a document successfully", async () => {
      const document = documentModelDocumentModelModule.utils.createDocument();
      await reactor.addDocument(document);

      const provider = await createReactorMcpProvider(reactor);
      const result = await provider.tools.deleteDocument.callback(
        {
          documentId: document.header.id,
        },
        mockExtra,
      );

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        success: true,
      });
    });

    it("should handle deletion of non-existent document", async () => {
      const provider = await createReactorMcpProvider(reactor);
      const result = await provider.tools.deleteDocument.callback(
        {
          documentId: "non-existent-id",
        },
        mockExtra,
      );

      expect(result.isError).toBeUndefined();
      // The reactor implementation returns true even for non-existent documents
      expect(result.structuredContent).toMatchObject({
        success: true,
      });
    });
  });

  describe("addAction tool", () => {
    it("should add an action to a document", async () => {
      const document = documentModelDocumentModelModule.utils.createDocument();
      await reactor.addDocument(document);

      const provider = await createReactorMcpProvider(reactor);

      const action = documentModelDocumentModelModule.actions.setModelName({
        input: "Test Name",
      });
      const result = await provider.tools.addAction.callback(
        {
          documentId: document.header.id,
          action,
        },
        mockExtra,
      );

      const expectedResult = documentModelDocumentModelModule.reducer(
        document,
        action,
      );
      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        result: {
          status: "SUCCESS",
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          operations: expect.arrayContaining([
            expect.objectContaining({
              ...action,
            }),
          ]),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          document: expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            header: expect.objectContaining({
              documentType: "powerhouse/document-model",
            }),
            state: expectedResult.state,
          }),
          signals: [],
        },
      });
    });

    it("should handle action on non-existent document", async () => {
      const provider = await createReactorMcpProvider(reactor);
      const result = await provider.tools.addAction.callback(
        {
          documentId: "non-existent-id",
          action: {
            type: "SET_NAME",
            input: "Test Name",
            scope: "global",
          },
        },
        mockExtra,
      );

      // Action on non-existent document returns an error
      expect(result.isError).toBe(true);
      expect(result.content).toStrictEqual([
        {
          text: "Error: Document with id non-existent-id not found",
          type: "text",
        },
      ]);
      expect(result.structuredContent).toStrictEqual({
        error: "Document with id non-existent-id not found",
      });
    });
  });

  describe("addOperation tool", () => {
    it("should add an operation to a document", async () => {
      const document = documentModelDocumentModelModule.utils.createDocument();
      await reactor.addDocument(document);

      const provider = await createReactorMcpProvider(reactor);
      const result = await provider.tools.addOperation.callback(
        {
          documentId: document.header.id,
          operation: {
            type: "SET_NAME",
            input: "Operation Name",
            scope: "global",
            index: 1,
            timestamp: new Date().toISOString(),
            hash: "test-hash",
            skip: 0,
          },
        },
        mockExtra,
      );

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        result: {
          status: "ERROR",
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          error: expect.any(String),
          operations: [],
          signals: [],
        },
      });
    });
  });

  describe("getDrives tool", () => {
    it("should list all drives", async () => {
      await reactor.addDrive({ global: { name: "Test Drive 1" } });
      await reactor.addDrive({ global: { name: "Test Drive 2" } });

      const provider = await createReactorMcpProvider(reactor);
      const result = await provider.tools.getDrives.callback({}, mockExtra);

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        driveIds: expect.arrayContaining([]),
      });
    });
  });

  describe("addDrive tool", () => {
    it("should add a new drive", async () => {
      const provider = await createReactorMcpProvider(reactor);
      const result = await provider.tools.addDrive.callback(
        {
          driveInput: {
            global: {
              name: "New Test Drive",
              icon: "test-icon",
            },
            id: "test-drive-id",
            slug: "test-drive-slug",
            preferredEditor: "test-editor",
            local: {
              availableOffline: true,
              sharingType: "private",
            },
          },
        },
        mockExtra,
      );

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        drive: expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          header: expect.objectContaining({
            documentType: "powerhouse/document-drive",
          }),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          state: expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            global: expect.objectContaining({
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              name: expect.any(String),
            }),
          }),
        }),
      });
    });

    it("should add a drive with minimal input", async () => {
      const provider = await createReactorMcpProvider(reactor);
      const result = await provider.tools.addDrive.callback(
        {
          driveInput: {
            global: {
              name: "Minimal Drive",
            },
          },
        },
        mockExtra,
      );

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        drive: expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          header: expect.objectContaining({
            documentType: "powerhouse/document-drive",
          }),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          state: expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            global: expect.objectContaining({
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              name: expect.any(String),
            }),
          }),
        }),
      });
    });
  });

  describe("getDrive tool", () => {
    it("should get a specific drive", async () => {
      const drive = await reactor.addDrive({ global: { name: "Test Drive" } });

      const provider = await createReactorMcpProvider(reactor);
      const result = await provider.tools.getDrive.callback(
        {
          driveId: drive.header.id,
        },
        mockExtra,
      );

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        drive: expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          header: expect.objectContaining({
            documentType: "powerhouse/document-drive",
          }),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          state: expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            global: expect.objectContaining({
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              name: expect.any(String),
            }),
          }),
        }),
      });
    });

    it("should get a drive with options", async () => {
      const drive = await reactor.addDrive({ global: { name: "Test Drive" } });

      const provider = await createReactorMcpProvider(reactor);
      const result = await provider.tools.getDrive.callback(
        {
          driveId: drive.header.id,
          options: {
            checkHashes: true,
          },
        },
        mockExtra,
      );

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        drive: expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          header: expect.objectContaining({
            documentType: "powerhouse/document-drive",
          }),
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          state: expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            global: expect.objectContaining({
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              name: expect.any(String),
            }),
          }),
        }),
      });
    });
  });

  describe("deleteDrive tool", () => {
    it("should delete a drive successfully", async () => {
      const drive = await reactor.addDrive({ global: { name: "Test Drive" } });

      const provider = await createReactorMcpProvider(reactor);
      const result = await provider.tools.deleteDrive.callback(
        {
          driveId: drive.header.id,
        },
        mockExtra,
      );

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        success: true,
      });
    });

    it("should handle deletion of non-existent drive", async () => {
      const provider = await createReactorMcpProvider(reactor);
      const result = await provider.tools.deleteDrive.callback(
        {
          driveId: "non-existent-drive-id",
        },
        mockExtra,
      );

      expect(result.isError).toBeUndefined();
      // The reactor implementation returns true even for non-existent drives
      expect(result.structuredContent).toMatchObject({
        success: true,
      });
    });
  });

  describe("addRemoteDrive tool", () => {
    it("should handle remote drive connection with mock", async () => {
      // Mock the addRemoteDrive method since we can't test actual remote connections
      mockReactor.addRemoteDrive = vi.fn().mockResolvedValue({
        header: { id: "remote-drive-id" },
        state: { global: { name: "Remote Drive" } },
      });

      const provider = await createReactorMcpProvider(mockReactor);
      const result = await provider.tools.addRemoteDrive.callback(
        {
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
        },
        mockExtra,
      );

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        drive: {
          header: { id: "remote-drive-id" },
          state: { global: { name: "Remote Drive" } },
        },
      });
      expect(mockReactor.addRemoteDrive).toHaveBeenCalledWith(
        "https://example.com/remote-drive",
        expect.objectContaining({
          availableOffline: true,
          listeners: [],
          triggers: [],
          sharingType: "public",
          pullFilter: {
            branch: ["main"],
            documentId: ["doc1", "doc2"],
            documentType: ["powerhouse/document-model"],
            scope: ["global"],
          },
          pullInterval: 30000,
        }),
      );
    });

    it("should handle remote drive with minimal options", async () => {
      mockReactor.addRemoteDrive = vi.fn().mockResolvedValue({
        header: { id: "remote-drive-id" },
        state: { global: { name: "Remote Drive" } },
      });

      const provider = await createReactorMcpProvider(mockReactor);
      const result = await provider.tools.addRemoteDrive.callback(
        {
          url: "https://example.com/remote-drive",
          options: {
            availableOffline: false,
          },
        },
        mockExtra,
      );

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        drive: {
          header: { id: "remote-drive-id" },
          state: { global: { name: "Remote Drive" } },
        },
      });
      expect(mockReactor.addRemoteDrive).toHaveBeenCalledWith(
        "https://example.com/remote-drive",
        expect.objectContaining({
          availableOffline: false,
          listeners: [],
          triggers: [],
          sharingType: null,
        }),
      );
    });
  });
});
