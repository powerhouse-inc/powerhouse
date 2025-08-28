import type { IDocumentDriveServer } from "document-drive";
import {
  DocumentNotFoundError,
  driveDocumentModelModule,
  ReactorBuilder,
} from "document-drive";
import type { DocumentModelModule } from "document-model";
import { documentModelDocumentModelModule, generateId } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReactorMcpProvider } from "../src/tools/reactor.js";

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
      const result = await provider.tools.getDocument.callback({
        id: document.header.id,
      });

      expect(JSON.parse(result.content[0].text as string)).toMatchObject({
        document: {
          header: resultDocument.header,
          state: resultDocument.state,
        },
      });
      expect(result.structuredContent).toMatchObject({
        document: {
          header: resultDocument.header,
          state: resultDocument.state,
        },
      });
      expect(result.isError).toBeUndefined();
    });

    it("should handle errors gracefully", async () => {
      const provider = await createReactorMcpProvider(reactor);
      const result = await provider.tools.getDocument.callback({
        id: "non-existent-id",
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        {
          type: "text",
          text: "Error: Document with id non-existent-id not found",
        },
      ]);
    });

    it("should handle non-Error exceptions", async () => {
      const errorMessage = "String error message";
      mockReactor.getDocument = vi.fn().mockRejectedValue(errorMessage);

      const provider = await createReactorMcpProvider(mockReactor);
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

    it("should handle empty string ID", async () => {
      mockReactor.getDocument = vi
        .fn()
        .mockRejectedValue(new DocumentNotFoundError(""));

      const provider = await createReactorMcpProvider(reactor);
      const result = await provider.tools.getDocument.callback({ id: "" });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        {
          type: "text",
          text: "Error: Document with id  not found",
        },
      ]);
    });
  });

  describe("createDocument tool", () => {
    it("should create a document successfully", async () => {
      const provider = await createReactorMcpProvider(reactor);
      const result = await provider.tools.createDocument.callback({
        documentType: "powerhouse/document-model",
        documentId: "test-doc-id",
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toStrictEqual({
        documentId: "test-doc-id",
      });
    });
  });

  describe("getDocuments tool", () => {
    it("should get documents from a drive", async () => {
      const drive = await reactor.addDrive({
        global: { name: "Test Drive" },
      });
      const provider = await createReactorMcpProvider(reactor);
      const result = await provider.tools.getDocuments.callback({
        parentId: drive.header.id,
      });

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

      const result2 = await provider.tools.getDocuments.callback({
        parentId: drive.header.id,
      });

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
      const result = await provider.tools.deleteDocument.callback({
        documentId: document.header.id,
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        success: true,
      });
    });

    it("should handle deletion of non-existent document", async () => {
      const provider = await createReactorMcpProvider(reactor);
      const result = await provider.tools.deleteDocument.callback({
        documentId: "non-existent-id",
      });

      expect(result.isError).toBeUndefined();
      // The reactor implementation returns true even for non-existent documents
      expect(result.structuredContent).toMatchObject({
        success: true,
      });
    });
  });

  describe("addActions tool", () => {
    it("should add an action to a document", async () => {
      const document = documentModelDocumentModelModule.utils.createDocument();
      await reactor.addDocument(document);

      const provider = await createReactorMcpProvider(reactor);

      const action = documentModelDocumentModelModule.actions.setModelName({
        name: "test-doc",
      });
      const result = await provider.tools.addActions.callback({
        documentId: document.header.id,
        actions: [action],
      });

      const expectedResult = documentModelDocumentModelModule.reducer(
        document,
        action,
      );
      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toStrictEqual({
        success: true,
      });
    });

    it("should add multiple actions to a document", async () => {
      const document = documentModelDocumentModelModule.utils.createDocument();
      await reactor.addDocument(document);

      const provider = await createReactorMcpProvider(reactor);

      const actions = [
        documentModelDocumentModelModule.actions.setModelName({
          name: "Test Name 1 ",
        }),
        documentModelDocumentModelModule.actions.setModelName({
          name: "Test Name 2",
        }),
      ];
      const result = await provider.tools.addActions.callback({
        documentId: document.header.id,
        actions,
      });

      const intermediateResult = documentModelDocumentModelModule.reducer(
        document,
        actions[0],
      );
      const expectedResult = documentModelDocumentModelModule.reducer(
        intermediateResult,
        actions[1],
      );
      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toStrictEqual({
        success: true,
      });
    });

    it("should throw error on invalid action type", async () => {
      const document = documentModelDocumentModelModule.utils.createDocument();
      await reactor.addDocument(document);

      const provider = await createReactorMcpProvider(reactor);

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
      expect(result.content[0].text).toContain(
        `Operation "INVALID_ACTION" is not defined in any module of the document model`,
      );
    });

    it("should throw error on invalid action input", async () => {
      const document = documentModelDocumentModelModule.utils.createDocument();
      await reactor.addDocument(document);

      const provider = await createReactorMcpProvider(reactor);

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
      expect(result.content[0].text)
        .toContain(`Input validation error: Invalid action input: [
  {
    "code": "invalid_type",
    "expected": "string",
    "received": "undefined",
    "path": [
      "name"
    ],
    "message": "Required"
  }
]`);
    });

    it("should throw error on action on non-existent document", async () => {
      const provider = await createReactorMcpProvider(reactor);
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
      expect(result.content).toStrictEqual([
        {
          text: "Error: Document with id non-existent-id not found",
          type: "text",
        },
      ]);
      expect(result.structuredContent).toBeUndefined();
    });
  });

  // describe("addOperation tool", () => {
  //   it("should add an operation to a document", async () => {
  //     const document = documentModelDocumentModelModule.utils.createDocument();
  //     await reactor.addDocument(document);

  //     const provider = await createReactorMcpProvider(reactor);
  //     const result = await provider.tools.addOperation.callback({
  //       documentId: document.header.id,
  //       operation: {
  //         type: "SET_NAME",
  //         input: "Operation Name",
  //         scope: "global",
  //         index: 1,
  //         timestampUtcMs: new Date().toISOString(),
  //         hash: "test-hash",
  //         skip: 0,
  //       },
  //     });

  //     expect(result.isError).toBeUndefined();
  //     expect(result.structuredContent).toMatchObject({
  //       result: {
  //         status: "ERROR",
  //
  //         error: expect.any(String),
  //         operations: [],
  //         signals: [],
  //       },
  //     });
  //   });
  // });

  describe("getDrives tool", () => {
    it("should list all drives", async () => {
      await reactor.addDrive({ global: { name: "Test Drive 1" } });
      await reactor.addDrive({ global: { name: "Test Drive 2" } });

      const provider = await createReactorMcpProvider(reactor);
      const result = await provider.tools.getDrives.callback({});

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        driveIds: expect.arrayContaining([]),
      });
    });
  });

  describe("addDrive tool", () => {
    it("should add a new drive", async () => {
      const provider = await createReactorMcpProvider(reactor);
      const result = await provider.tools.addDrive.callback({
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
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toStrictEqual({
        driveId: "test-drive-id",
      });
      const drive = await reactor.getDrive("test-drive-id");
      expect(drive).toMatchObject({
        header: expect.objectContaining({
          documentType: "powerhouse/document-drive",
        }),

        state: expect.objectContaining({
          global: expect.objectContaining({
            name: expect.any(String),
          }),
        }),
      });
    });

    it("should add a drive with minimal input", async () => {
      const provider = await createReactorMcpProvider(reactor);
      const result = await provider.tools.addDrive.callback({
        driveInput: {
          global: {
            name: "Minimal Drive",
          },
        },
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toStrictEqual({
        driveId: expect.any(String),
      });
      const drive = await reactor.getDrive(
        result.structuredContent!.driveId as string,
      );
      expect(drive).toMatchObject({
        header: expect.objectContaining({
          documentType: "powerhouse/document-drive",
        }),

        state: expect.objectContaining({
          global: expect.objectContaining({
            name: expect.any(String),
          }),
        }),
      });
    });
  });

  describe("getDrive tool", () => {
    it("should get a specific drive", async () => {
      const drive = await reactor.addDrive({ global: { name: "Test Drive" } });

      const provider = await createReactorMcpProvider(reactor);
      const result = await provider.tools.getDrive.callback({
        driveId: drive.header.id,
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        drive: expect.objectContaining({
          header: expect.objectContaining({
            documentType: "powerhouse/document-drive",
          }),

          state: expect.objectContaining({
            global: expect.objectContaining({
              name: expect.any(String),
            }),
          }),
        }),
      });
    });

    it("should get a drive with options", async () => {
      const drive = await reactor.addDrive({ global: { name: "Test Drive" } });

      const provider = await createReactorMcpProvider(reactor);
      const result = await provider.tools.getDrive.callback({
        driveId: drive.header.id,
        options: {
          checkHashes: true,
        },
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        drive: expect.objectContaining({
          header: expect.objectContaining({
            documentType: "powerhouse/document-drive",
          }),

          state: expect.objectContaining({
            global: expect.objectContaining({
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
      const result = await provider.tools.deleteDrive.callback({
        driveId: drive.header.id,
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        success: true,
      });
    });

    it("should handle deletion of non-existent drive", async () => {
      const provider = await createReactorMcpProvider(reactor);
      const result = await provider.tools.deleteDrive.callback({
        driveId: "non-existent-drive-id",
      });

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

      mockReactor.getDrive = vi.fn().mockResolvedValue({
        header: { id: "remote-drive-id" },
        state: { global: { name: "Remote Drive" } },
      });

      const provider = await createReactorMcpProvider(mockReactor);
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

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toStrictEqual({
        driveId: "remote-drive-id",
      });

      const drive = await mockReactor.getDrive("remote-drive-id");
      expect(drive).toMatchObject({
        header: { id: "remote-drive-id" },
        state: { global: { name: "Remote Drive" } },
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
  });
});
