import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type {
  IReactorClient,
  InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import { ReactorBuilder, ReactorClientBuilder } from "@powerhousedao/reactor";
import { createReactorMcpProvider } from "@powerhousedao/reactor-mcp";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import type { Action, PHDocument } from "@powerhousedao/shared/document-model";
import {
  retract,
  withSignaturePolicy,
} from "@powerhousedao/shared/document-model";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
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
      expect(getTextContent(result)).toContain("`id` (or `documentId`)");
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
      expect(doc.header.protocolVersions?.["base-reducer"]).toBe(3);
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

    describe("UNDO and REDO", () => {
      const setName = (name: string) =>
        documentModelDocumentModelModule.actions.setModelName({ name });
      const nameOf = async (documentId: string) =>
        (
          (await client.get<PHDocument>(documentId)).state as unknown as {
            global: { name: string };
          }
        ).global.name;
      const globalRows = async (documentId: string) =>
        (await client.getOperations(documentId, { scopes: ["global"] }))
          .results;
      const targetOf = (action: Action) =>
        (action.input as { target: string }).target;

      async function v3Document(...names: string[]) {
        const document = await client.createEmpty<PHDocument>(
          "powerhouse/document-model",
        );
        expect(document.header.protocolVersions?.["base-reducer"]).toBe(3);
        if (names.length > 0) {
          await client.execute(document.header.id, "main", names.map(setName));
        }
        return document.header.id;
      }

      it("submits one job on base-reducer 3, each step a RETRACT", async () => {
        const documentId = await v3Document();
        const execute = vi.spyOn(client, "execute");
        const provider = await createReactorMcpProvider({ client });
        const result = await provider.tools.addActions.callback({
          documentId,
          actions: [
            setName("first"),
            setName("second"),
            setName("third"),
            { type: "UNDO", input: { count: 2 }, scope: "global" },
            { type: "REDO", input: {}, scope: "global" },
          ],
        });

        expect(result.isError).toBeUndefined();
        expect(execute).toHaveBeenCalledTimes(1);
        expect(await nameOf(documentId)).toBe("second");
        const rows = await globalRows(documentId);
        expect(rows.map((row) => row.action.type)).toEqual([
          "SET_MODEL_NAME",
          "SET_MODEL_NAME",
          "SET_MODEL_NAME",
          "RETRACT",
          "RETRACT",
          "RETRACT",
        ]);
        const [, second, third, undoThird, undoSecond, redo] = rows.map(
          (row) => row.action,
        );
        expect(targetOf(undoThird)).toBe(third.id);
        expect(targetOf(undoSecond)).toBe(second.id);
        expect(targetOf(redo)).toBe(undoSecond.id);
      });

      it("retracts an action from earlier in the same call", async () => {
        const documentId = await v3Document("stored");
        const provider = await createReactorMcpProvider({ client });
        const result = await provider.tools.addActions.callback({
          documentId,
          actions: [
            setName("a"),
            { type: "UNDO", input: {}, scope: "global" },
            setName("b"),
          ],
        });

        expect(result.isError).toBeUndefined();
        expect(await nameOf(documentId)).toBe("b");
        const [, a, undo, b] = (await globalRows(documentId)).map(
          (row) => row.action,
        );
        expect([a.type, undo.type, b.type]).toEqual([
          "SET_MODEL_NAME",
          "RETRACT",
          "SET_MODEL_NAME",
        ]);
        expect(targetOf(undo)).toBe(a.id);

        // b follows the undo, so there is nothing left to redo.
        const redo = await provider.tools.addActions.callback({
          documentId,
          actions: [{ type: "REDO", input: {}, scope: "global" }],
        });
        expect(redo.isError).toBe(true);
        expect(getTextContent(redo)).toContain(
          "Cannot redo: nothing to redo in scope history",
        );
      });

      it("undoes the call's own rows first, then stored ones, for a count", async () => {
        const documentId = await v3Document("x");
        const provider = await createReactorMcpProvider({ client });
        const result = await provider.tools.addActions.callback({
          documentId,
          actions: [
            setName("a"),
            { type: "UNDO", input: { count: 2 }, scope: "global" },
          ],
        });

        expect(result.isError).toBeUndefined();
        expect(await nameOf(documentId)).toBe("");
        const [x, a, undoA, undoX] = (await globalRows(documentId)).map(
          (row) => row.action,
        );
        expect(targetOf(undoA)).toBe(a.id);
        expect(targetOf(undoX)).toBe(x.id);
      });

      it("redoes stored undos and the call's own, latest first", async () => {
        const documentId = await v3Document("x", "y");
        const provider = await createReactorMcpProvider({ client });
        const undone = await provider.tools.addActions.callback({
          documentId,
          actions: [{ type: "UNDO", input: { count: 2 }, scope: "global" }],
        });
        expect(undone.isError).toBeUndefined();
        expect(await nameOf(documentId)).toBe("");

        const result = await provider.tools.addActions.callback({
          documentId,
          actions: [
            { type: "REDO", input: {}, scope: "global" },
            { type: "UNDO", input: {}, scope: "global" },
            { type: "REDO", input: { count: 2 }, scope: "global" },
          ],
        });

        expect(result.isError).toBeUndefined();
        expect(await nameOf(documentId)).toBe("y");
        const [x, , undoY, undoX, redoX, undoAgain, redoAgain, redoY] = (
          await globalRows(documentId)
        ).map((row) => row.action);
        expect(targetOf(redoX)).toBe(undoX.id);
        expect(targetOf(undoAgain)).toBe(x.id);
        expect(targetOf(redoAgain)).toBe(undoAgain.id);
        expect(targetOf(redoY)).toBe(undoY.id);
      });

      it("does not undo a base action", async () => {
        const documentId = await v3Document("x");
        const provider = await createReactorMcpProvider({ client });
        const result = await provider.tools.addActions.callback({
          documentId,
          actions: [
            { type: "SET_NAME", input: "renamed", scope: "global" },
            { type: "UNDO", input: {}, scope: "global" },
          ],
        });

        expect(result.isError).toBeUndefined();
        expect(await nameOf(documentId)).toBe("");
        const updated = await client.get<PHDocument>(documentId);
        expect(updated.header.name).toBe("renamed");
        const [x, , undo] = (await globalRows(documentId)).map(
          (row) => row.action,
        );
        expect(targetOf(undo)).toBe(x.id);
      });

      it("writes nothing when the job is refused for a later action", async () => {
        const documentId = await v3Document("x");
        const before = await globalRows(documentId);
        const execute = client.execute.bind(client);
        vi.spyOn(client, "execute").mockImplementation(
          async (id, branch, actions, ...rest) => {
            if (actions.some((action) => action.type === "SET_STATE_SCHEMA")) {
              throw new Error("refused: b");
            }
            return execute(id, branch, actions, ...rest);
          },
        );
        const provider = await createReactorMcpProvider({ client });
        const result = await provider.tools.addActions.callback({
          documentId,
          actions: [
            setName("a"),
            { type: "UNDO", input: {}, scope: "global" },
            documentModelDocumentModelModule.actions.setStateSchema({
              scope: "global",
              schema: "type B { b: String }",
            }),
          ],
        });

        expect(result.isError).toBe(true);
        expect(getTextContent(result)).toContain("refused: b");
        expect(await globalRows(documentId)).toEqual(before);
        expect(await nameOf(documentId)).toBe("x");
      });

      it("writes nothing when the reactor refuses a stale target", async () => {
        const documentId = await v3Document("x");
        const [x] = (await globalRows(documentId)).map((row) => row.action);
        // Another writer's retraction of x, created before the call and
        // landing after its targets are resolved.
        const external = retract(x.id, "global");
        const execute = client.execute.bind(client);
        let interfered = false;
        vi.spyOn(client, "execute").mockImplementation(
          async (id, branch, actions, ...rest) => {
            const retractsX = actions.some(
              (action) =>
                action.type === "RETRACT" && targetOf(action) === x.id,
            );
            if (retractsX && !interfered) {
              interfered = true;
              await execute(id, "main", [external]);
            }
            return execute(id, branch, actions, ...rest);
          },
        );
        const provider = await createReactorMcpProvider({ client });
        const result = await provider.tools.addActions.callback({
          documentId,
          actions: [
            setName("a"),
            { type: "UNDO", input: { count: 2 }, scope: "global" },
            setName("b"),
          ],
        });

        expect(interfered).toBe(true);
        expect(result.isError).toBe(true);
        expect(getTextContent(result)).toContain("target-retracted");
        expect(
          (await globalRows(documentId)).map((row) => row.action.type),
        ).toEqual(["SET_MODEL_NAME", "RETRACT"]);
        expect(await nameOf(documentId)).toBe("");
      });

      it("refuses with nothing to undo and writes nothing", async () => {
        const documentId = await v3Document();
        const execute = vi.spyOn(client, "execute");
        const provider = await createReactorMcpProvider({ client });
        const result = await provider.tools.addActions.callback({
          documentId,
          actions: [
            setName("a"),
            { type: "UNDO", input: { count: 2 }, scope: "global" },
          ],
        });

        expect(result.isError).toBe(true);
        expect(getTextContent(result)).toContain(
          "Cannot undo: nothing to undo in scope history",
        );
        expect(execute).not.toHaveBeenCalled();
        expect(await globalRows(documentId)).toEqual([]);
      });

      it.each([1, 2] as const)(
        "submits one UNDO with its count in one job on base-reducer %i",
        async (version) => {
          const created = documentModelCreateDocument();
          const document =
            version === 1
              ? withSignaturePolicy(created, "legacy", {
                  protocolVersions: { "base-reducer": 1 },
                })
              : created;
          await client.create(document);
          const documentId = document.header.id;
          expect(
            (await client.get<PHDocument>(documentId)).header
              .protocolVersions?.["base-reducer"],
          ).toBe(version);
          const execute = vi.spyOn(client, "execute");
          const provider = await createReactorMcpProvider({ client });
          const result = await provider.tools.addActions.callback({
            documentId,
            actions: [
              setName("a"),
              setName("b"),
              { type: "UNDO", input: { count: 1 }, scope: "global" },
            ],
          });

          expect(result.isError).toBeUndefined();
          expect(execute).toHaveBeenCalledTimes(1);
          expect(
            execute.mock.calls[0][2].map(({ type, input }) => ({
              type,
              input,
            })),
          ).toEqual([
            { type: "SET_MODEL_NAME", input: { name: "a" } },
            { type: "SET_MODEL_NAME", input: { name: "b" } },
            { type: "UNDO", input: { count: 1 } },
          ]);
          expect(await nameOf(documentId)).toBe("a");
        },
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
