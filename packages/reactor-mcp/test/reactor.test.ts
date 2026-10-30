import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createServer as createHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import type {
  InProcessReactorClientModule,
  ISyncManager,
  JobInfo,
  WriteHandle,
} from "@powerhousedao/reactor";
import {
  JobFailedError,
  JobStatus,
  ReactorBuilder,
  ReactorClientBuilder,
} from "@powerhousedao/reactor";
import {
  addActionsTool,
  createAddActionsTool,
  createDocument,
  createDocumentTool,
  createServer,
  deleteDocumentTool,
  executeActions,
  executeBuiltActions,
  getDocumentModelSchemaTool,
  getDocumentModelsTool,
  getDocumentsTool,
  getDocumentTool,
  getDrivesTool,
  getDriveTool,
  isWriteTool,
  reactorAdminTools,
  reactorTools,
  ReactorToolError,
  toAiSdkTools,
  toMcpTool,
  type ActionFailure,
  type AnyToolDefinition,
  type CompactDocumentModelSchema,
  type RemoteDriveAllowlist,
} from "../src/index.js";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type {
  Action,
  DocumentModelModule,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  retract,
  setName,
  withSignaturePolicy,
} from "@powerhousedao/shared/document-model";
import {
  documentModelCreateDocument,
  documentModelDocumentModelModule,
} from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createP256Signer } from "./utils/p256-signer.js";

type ReactorClient = InProcessReactorClientModule["client"];

type ToolError = { code: string; message: string; failures?: ActionFailure[] };

async function createReactorClientModule(): Promise<InProcessReactorClientModule> {
  const reactorBuilder = new ReactorBuilder().withDocumentModelSources([
    documentModelDocumentModelModule as unknown as DocumentModelModule,
    driveDocumentModelModule as unknown as DocumentModelModule,
  ]);
  return new ReactorClientBuilder()
    .withReactorBuilder(reactorBuilder)
    .withSigner(await createP256Signer())
    .buildModule();
}

// The same, with undo v3 on, so a document can be created at base-reducer 3.
async function createUndoV3ReactorClientModule(): Promise<InProcessReactorClientModule> {
  const reactorBuilder = new ReactorBuilder()
    .withDocumentModelSources([
      documentModelDocumentModelModule as unknown as DocumentModelModule,
      driveDocumentModelModule as unknown as DocumentModelModule,
    ])
    .withExecutorConfig({ featureFlags: { undoV3: true } });
  return new ReactorClientBuilder()
    .withReactorBuilder(reactorBuilder)
    .withSigner(await createP256Signer())
    .buildModule();
}

describe("reactor tools", () => {
  let reactorModule: InProcessReactorClientModule;
  let client: ReactorClient;

  beforeEach(async () => {
    reactorModule = await createReactorClientModule();
    client = reactorModule.client;
  });

  afterEach(() => {
    reactorModule.reactor.kill();
  });

  async function call<T = Record<string, unknown>>(
    tool: AnyToolDefinition,
    args: unknown,
  ): Promise<T> {
    const result = await toMcpTool(tool, { client }).callback(args as never);
    if (result.isError) {
      throw new Error(`unexpected tool error: ${JSON.stringify(result)}`);
    }
    return result.structuredContent as T;
  }

  async function fail(tool: AnyToolDefinition, args: unknown) {
    const result: CallToolResult = await toMcpTool(tool, {
      client,
    }).callback(args as never);
    expect(result.isError).toBe(true);
    const error = result._meta?.error as ToolError;
    const text = result.content[0];
    expect(text.type === "text" && text.text).toBe(
      `Error: ${error.code}: ${error.message}`,
    );
    return error;
  }

  async function newModelDocument() {
    const document = documentModelCreateDocument();
    await client.create(document);
    return document.header.id;
  }

  async function newDrive() {
    const drive = await client.createEmpty<DocumentDriveDocument>(
      "powerhouse/document-drive",
    );
    return drive.header.id;
  }

  describe("annotations", () => {
    const all = [
      ...reactorTools(),
      ...reactorAdminTools({
        syncManager: {} as ISyncManager,
        remoteDriveUrls: "*",
      }),
    ] as AnyToolDefinition<never>[];

    it("annotates every tool", () => {
      for (const tool of all) {
        expect(typeof tool.annotations.readOnlyHint, tool.name).toBe("boolean");
      }
    });

    it("marks reads read-only, and addActions and deletes destructive", () => {
      const by = (hint: "readOnlyHint" | "destructiveHint" | "openWorldHint") =>
        all
          .filter((t) => t.annotations[hint])
          .map((t) => t.name)
          .sort();
      expect(by("readOnlyHint")).toEqual(
        [
          "getDocument",
          "getDocumentModelSchema",
          "getDocumentModels",
          "getDocuments",
          "getDrive",
          "getDrives",
        ].sort(),
      );
      expect(by("destructiveHint")).toEqual(
        ["addActions", "deleteDocument", "deleteDrive"].sort(),
      );
      expect(by("openWorldHint")).toEqual(["addRemoteDrive"]);
    });

    it("keeps the drive tools out of the user set", () => {
      expect(reactorTools().map((t) => t.name)).not.toContain("addDrive");
    });

    it("makes every drive tool need approval", () => {
      const admin = reactorAdminTools({
        syncManager: {} as ISyncManager,
        remoteDriveUrls: "*",
      }).map((tool) => toMcpTool(tool, { client: {} as ReactorClient }));
      expect(admin.map((t) => t.name).sort()).toEqual([
        "addDrive",
        "addRemoteDrive",
        "deleteDrive",
      ]);
      for (const tool of admin) {
        expect(isWriteTool(tool.annotations), tool.name).toBe(true);
      }
    });
  });

  describe("getDocument", () => {
    it("returns a compact view without operations", async () => {
      const id = await newModelDocument();
      const { document } = await call<{ document: Record<string, unknown> }>(
        getDocumentTool,
        { id },
      );
      expect(document).toMatchObject({
        id,
        documentType: "powerhouse/document-model",
        branch: "main",
        revision: expect.any(Object),
        state: {
          global: expect.objectContaining({
            specifications: [expect.any(Object)],
          }),
        },
      });
      expect(document).not.toHaveProperty("operations");
      expect(document.state).not.toHaveProperty("document");
    });

    it("projects the state with a JSONPath filter", async () => {
      const id = await newModelDocument();
      await call(addActionsTool, {
        documentId: id,
        actions: [{ type: "SET_MODEL_NAME", input: { name: "Projected" } }],
      });
      const { document } = await call<{ document: { state: unknown } }>(
        getDocumentTool,
        { id, filter: "$.global.name" },
      );
      expect(document.state).toBe("Projected");
    });

    it("fails NOT_FOUND for an unknown id", async () => {
      const error = await fail(getDocumentTool, { id: "non-existent-id" });
      expect(error.code).toBe("NOT_FOUND");
      expect(error.message).toContain("non-existent-id");
    });

    it("names the expected parameter when no ID is given", async () => {
      const error = await fail(getDocumentTool, {});
      expect(error).toMatchObject({
        code: "INVALID_ACTION",
        message: "getDocument needs the target's ID in `documentId`",
      });
    });

    it("refuses an alias that names a different document", async () => {
      const documentId = await newModelDocument();
      const error = await fail(getDocumentTool, {
        documentId,
        id: "another-id",
      });
      expect(error.code).toBe("INVALID_ACTION");
      expect(error.message).toContain("pass only `documentId`");
    });

    it("fails INVALID_ACTION for a malformed filter", async () => {
      const id = await newModelDocument();
      const error = await fail(getDocumentTool, { id, filter: "global.name" });
      expect(error.code).toBe("INVALID_ACTION");
    });
  });

  describe("createDocument", () => {
    it("creates a document outside any drive", async () => {
      const result = await call<{ documentId: string }>(createDocumentTool, {
        documentType: "powerhouse/document-model",
      });
      const document = await client.get(result.documentId);
      expect(document.header.documentType).toBe("powerhouse/document-model");
    });

    it("creates a document at base-reducer 3 by default", async () => {
      const result = await call<{ documentId: string }>(createDocumentTool, {
        documentType: "powerhouse/document-model",
      });
      const stored = await client.get(result.documentId);
      expect(stored.header.protocolVersions?.["base-reducer"]).toBe(3);
    });

    it("creates a named document as a drive file", async () => {
      const driveId = await newDrive();
      const result = await call<{ documentId: string; driveId: string }>(
        createDocumentTool,
        {
          documentType: "powerhouse/document-model",
          name: "Invoice model",
          driveId,
        },
      );
      expect(result.driveId).toBe(driveId);
      const document = await client.get(result.documentId);
      expect(document.header.name).toBe("Invoice model");
      const drive = await client.get<DocumentDriveDocument>(driveId);
      expect(drive.state.global.nodes).toContainEqual(
        expect.objectContaining({
          id: result.documentId,
          name: "Invoice model",
          kind: "file",
        }),
      );
      const { documents } = await call<{ documents: unknown[] }>(
        getDocumentsTool,
        { parentId: driveId },
      );
      expect(documents).toEqual([
        {
          id: result.documentId,
          documentType: "powerhouse/document-model",
          name: "Invoice model",
        },
      ]);
    });

    it("places the file in a folder", async () => {
      const driveId = await newDrive();
      await call(addActionsTool, {
        documentId: driveId,
        actions: [{ type: "ADD_FOLDER", input: { id: "folder-1", name: "F" } }],
      });
      const result = await call<{ documentId: string }>(createDocumentTool, {
        documentType: "powerhouse/document-model",
        driveId,
        parentFolder: "folder-1",
      });
      const drive = await client.get<DocumentDriveDocument>(driveId);
      expect(drive.state.global.nodes).toContainEqual(
        expect.objectContaining({
          id: result.documentId,
          parentFolder: "folder-1",
        }),
      );
    });

    it("fails NOT_FOUND with a suggestion for an unknown type", async () => {
      const error = await fail(createDocumentTool, {
        documentType: "powerhouse/document-modl",
      });
      expect(error.code).toBe("NOT_FOUND");
      expect(error.message).toContain(
        "Did you mean: powerhouse/document-model",
      );
    });

    it("removes the new document when the drive refuses the file", async () => {
      const driveId = await newDrive();
      const error = await fail(createDocumentTool, {
        documentType: "powerhouse/document-model",
        driveId,
        name: `Bad ${String.fromCharCode(7)}`,
      });
      expect(error.code).toBe("REDUCER_ERROR");
      const children = await client.getOutgoingRelationships(driveId, "child");
      expect(children.results).toEqual([]);
      const drive = await client.get<DocumentDriveDocument>(driveId);
      expect(drive.state.global.nodes).toEqual([]);
    });

    it("refuses a driveId that is not a document drive", async () => {
      const notDrive = await newModelDocument();
      const error = await fail(createDocumentTool, {
        documentType: "powerhouse/document-model",
        driveId: notDrive,
      });
      expect(error.code).toBe("INVALID_ACTION");
      const children = await client.getOutgoingRelationships(notDrive, "child");
      expect(children.results).toEqual([]);
    });

    it("rolls back even when the caller's signal aborted", async () => {
      const controller = new AbortController();
      let createdId: string | undefined;
      // Files the document, then fails as an aborted caller would.
      const addFile = async (
        ...args: Parameters<ReactorClient["write"]["drives"]["addFile"]>
      ) => {
        const handle = await client.write.drives.addFile(...args);
        await handle.readable;
        createdId = handle.documentId;
        controller.abort();
        throw new DOMException("aborted", "AbortError");
      };
      const host = Object.assign(Object.create(client) as ReactorClient, {
        write: Object.assign(Object.create(client.write) as object, {
          drives: { addFile },
        }),
      });
      const driveId = await newDrive();
      await expect(
        createDocument(
          host,
          {
            documentType: "powerhouse/document-model",
            name: "Aborted",
            driveId,
          },
          controller.signal,
        ),
      ).rejects.not.toThrow(/could not be removed/);
      expect(createdId).toBeDefined();
      await expect(client.get(createdId!)).rejects.toThrow();
      const drive = await client.get<DocumentDriveDocument>(driveId);
      expect(drive.state.global.nodes).toEqual([]);
    });

    it("files the document into a drive of another drive type", async () => {
      const driveId = await newDrive();
      const filed: string[] = [];
      const host = Object.assign(Object.create(client) as ReactorClient, {
        get: async (...args: Parameters<ReactorClient["get"]>) => {
          const document = await client.get(...args);
          return args[0] === driveId
            ? {
                ...document,
                header: {
                  ...document.header,
                  documentType: "powerhouse/reactor-drive",
                },
              }
            : document;
        },
        write: Object.assign(Object.create(client.write) as object, {
          drives: {
            addFile: (
              ...args: Parameters<ReactorClient["write"]["drives"]["addFile"]>
            ) => {
              filed.push(args[0]);
              return client.write.drives.addFile(...args);
            },
          },
        }),
      });
      const created = await createDocument(host, {
        documentType: "powerhouse/document-model",
        driveId,
      });
      expect(filed).toEqual([driveId]);
      expect(created.driveId).toBe(driveId);
    });
  });

  describe("deleteDocument", () => {
    it("removes the drive node, then deletes the document", async () => {
      const driveId = await newDrive();
      const { documentId } = await call<{ documentId: string }>(
        createDocumentTool,
        { documentType: "powerhouse/document-model", driveId, name: "Doomed" },
      );
      expect(await call(deleteDocumentTool, { documentId })).toEqual({
        documentId,
      });
      const drive = await client.get<DocumentDriveDocument>(driveId);
      expect(drive.state.global.nodes).toEqual([]);
      await expect(client.get(documentId)).rejects.toThrow();
    });

    it("fails NOT_FOUND instead of returning success: false", async () => {
      const error = await fail(deleteDocumentTool, {
        documentId: "non-existent-id",
      });
      expect(error.code).toBe("NOT_FOUND");
    });
  });

  describe("addActions", () => {
    it("applies a batch and returns the new revision", async () => {
      const documentId = await newModelDocument();
      const before = (await client.get(documentId)).header.revision.global as
        | number
        | undefined;
      const result = await call<{ revision: Record<string, number> }>(
        addActionsTool,
        {
          documentId,
          actions: [
            { type: "SET_MODEL_NAME", input: { name: "One" } },
            { type: "SET_MODEL_NAME", input: { name: "Two" }, scope: "global" },
            { type: "SET_NAME", input: "Renamed" },
          ],
        },
      );
      expect(result.revision.global).toBe((before ?? 0) + 3);
      const document = await client.get(documentId);
      expect(document.header.name).toBe("Renamed");
      expect(
        (document.state as unknown as { global: { name: string } }).global.name,
      ).toBe("Two");
    });

    it("collects every invalid action and applies none", async () => {
      const documentId = await newModelDocument();
      const before = (await client.get(documentId)).header.revision;
      const error = await fail(addActionsTool, {
        documentId,
        actions: [
          { type: "SET_MODEL_NAM", input: { name: "x" } },
          { type: "SET_MODEL_NAME", input: { invalidField: "x" } },
          { type: "SET_MODEL_NAME", input: { name: "ok" } },
          { type: "SET_MODEL_NAME", input: { name: "x" }, scope: "local" },
        ],
      });
      expect(error.code).toBe("INVALID_ACTION");
      expect(error.failures?.map((f) => [f.index, f.code])).toEqual([
        [0, "INVALID_ACTION"],
        [1, "INVALID_ACTION"],
        [3, "INVALID_ACTION"],
      ]);
      expect(error.message).toContain("3 actions failed:");
      expect(error.message).toContain("[0] SET_MODEL_NAM: unknown action type");
      expect(error.message).toContain("Did you mean: SET_MODEL_NAME");
      expect(error.message).toContain("Input schema for SET_MODEL_NAME:");
      expect((await client.get(documentId)).header.revision).toEqual(before);
    });

    it("refuses document-scope actions", async () => {
      const documentId = await newModelDocument();
      const error = await fail(addActionsTool, {
        documentId,
        actions: [{ type: "DELETE_DOCUMENT", input: { documentId } }],
      });
      expect(error.code).toBe("FORBIDDEN");
      expect(error.failures?.[0]).toMatchObject({
        index: 0,
        type: "DELETE_DOCUMENT",
        code: "FORBIDDEN",
      });
      await expect(client.get(documentId)).resolves.toBeDefined();
    });

    it("refuses action types outside the allowed list", async () => {
      const documentId = await newModelDocument();
      const tool = createAddActionsTool({
        allowedActionTypes: ["SET_MODEL_NAME"],
      });
      expect(tool.description).toContain(
        "Allowed action types: SET_MODEL_NAME",
      );
      await call(tool, {
        documentId,
        actions: [{ type: "SET_MODEL_NAME", input: { name: "fine" } }],
      });
      const error = await fail(tool, {
        documentId,
        actions: [
          { type: "SET_MODEL_NAME", input: { name: "fine" } },
          { type: "SET_MODEL_ID", input: { id: "nope" } },
        ],
      });
      expect(error.code).toBe("FORBIDDEN");
      expect(error.failures?.map((f) => f.index)).toEqual([1]);
    });

    type Executed = {
      documentId: string;
      revision: Record<string, number>;
      success: boolean;
      results: {
        index: number;
        type: string;
        scope: string;
        operationIndex?: number;
        error?: { kind: string; message: string };
      }[];
    };

    it("reports reducer errors per action", async () => {
      const documentId = await newModelDocument();
      const result = await call<Executed>(addActionsTool, {
        documentId,
        actions: [
          { type: "SET_MODEL_NAME", input: { name: "applied" } },
          { type: "DELETE_MODULE", input: { id: "no-such-module" } },
        ],
      });
      expect(result).toMatchObject({ documentId, success: false });
      expect(result.results).toEqual([
        {
          index: 0,
          type: "SET_MODEL_NAME",
          scope: "global",
          operationIndex: expect.any(Number),
        },
        {
          index: 1,
          type: "DELETE_MODULE",
          scope: "global",
          operationIndex: expect.any(Number),
          error: {
            kind: "reducer-error",
            message: expect.stringContaining("no-such-module"),
          },
        },
      ]);
      const document = await client.get(documentId);
      expect(
        (document.state as unknown as { global: { name: string } }).global.name,
      ).toBe("applied");
    });

    it("detects a reducer failure past the first page of operations", async () => {
      const documentId = await newModelDocument();
      const actions = [
        ...Array.from({ length: 120 }, (_, i) => ({
          type: "SET_MODEL_NAME",
          input: { name: `n${i}` },
        })),
        { type: "DELETE_MODULE", input: { id: "no-such-module" } },
      ];
      const result = await call<Executed>(addActionsTool, {
        documentId,
        actions,
      });
      expect(result.success).toBe(false);
      expect(result.results).toHaveLength(121);
      expect(
        result.results.filter((r) => r.error).map((r) => [r.index, r.type]),
      ).toEqual([[120, "DELETE_MODULE"]]);
      expect(result.results.every((r) => r.operationIndex !== undefined)).toBe(
        true,
      );
    });

    it("returns the error of an action its reducer rejected", async () => {
      const driveId = await newDrive();
      const addFolder = (id: string) => ({
        type: "ADD_FOLDER",
        input: { id, name: id },
        scope: "global",
      });
      await call(addActionsTool, {
        documentId: driveId,
        actions: [addFolder("taken")],
      });
      const result = await call<Executed>(addActionsTool, {
        documentId: driveId,
        actions: [addFolder("taken")],
      });
      expect(result.success).toBe(false);
      expect(result.results).toStrictEqual([
        {
          index: 0,
          type: "ADD_FOLDER",
          scope: "global",
          operationIndex: 1,
          error: {
            kind: "reducer-error",
            message: "Node with id taken already exists!",
          },
        },
      ]);
    });

    it("applies the rest of a batch around a rejected action", async () => {
      const driveId = await newDrive();
      const addFolder = (id: string) => ({
        type: "ADD_FOLDER",
        input: { id, name: id },
      });
      const result = await call<Executed>(addActionsTool, {
        documentId: driveId,
        actions: [addFolder("a"), addFolder("a"), addFolder("b")],
      });
      expect(result.success).toBe(false);
      expect(result.results.map((r) => [r.index, r.error?.kind])).toEqual([
        [0, undefined],
        [1, "reducer-error"],
        [2, undefined],
      ]);
      const drive = await client.get<DocumentDriveDocument>(driveId);
      expect(drive.state.global.nodes.map((n) => n.id).sort()).toEqual([
        "a",
        "b",
      ]);
    });

    it("renames a document with SET_NAME and sets the preferred editor", async () => {
      const driveId = await newDrive();
      // The reactor executes one scope per batch.
      for (const action of [
        { type: "SET_NAME", input: "Renamed", scope: "global" },
        {
          type: "SET_PREFERRED_EDITOR",
          input: { preferredEditor: "some-app" },
          scope: "header",
        },
      ]) {
        const result = await call<Executed>(addActionsTool, {
          documentId: driveId,
          actions: [action],
        });
        expect(result.success, action.type).toBe(true);
      }
      const drive = await client.get(driveId);
      expect(drive.header.name).toBe("Renamed");
      expect(drive.header.meta?.preferredEditor).toBe("some-app");
    });

    it("rejects a base action in the wrong scope", async () => {
      const documentId = await newModelDocument();
      const error = await fail(addActionsTool, {
        documentId,
        actions: [
          {
            type: "SET_PREFERRED_EDITOR",
            input: { preferredEditor: "some-app" },
            scope: "global",
          },
        ],
      });
      expect(error.code).toBe("INVALID_ACTION");
      expect(error.message).toContain('"header"');
    });

    it("validates against the module for the document's own version", async () => {
      const documentId = await newModelDocument();
      let forDocument = 0;
      const host = Object.assign(Object.create(client) as ReactorClient, {
        getDocumentModelModule: () =>
          Promise.reject(new Error("latest module must not be used")),
        getDocumentModelModuleForDocument: (
          document: Parameters<
            ReactorClient["getDocumentModelModuleForDocument"]
          >[0],
        ) => {
          forDocument++;
          return client.getDocumentModelModuleForDocument(document);
        },
      });
      const result = await toMcpTool(addActionsTool, { client: host }).callback(
        {
          documentId,
          actions: [{ type: "SET_MODEL_NAME", input: { name: "versioned" } }],
        },
      );
      expect(result.isError).toBeFalsy();
      expect(forDocument).toBe(1);
    });

    const deleteModuleTwice = async (host: ReactorClient) => {
      const documentId = await newModelDocument();
      await call(addActionsTool, {
        documentId,
        actions: [{ type: "ADD_MODULE", input: { id: "m", name: "m" } }],
      });
      const result = await toMcpTool(addActionsTool, {
        client: host,
      }).callback({
        documentId,
        actions: [
          { type: "DELETE_MODULE", input: { id: "m" } },
          { type: "DELETE_MODULE", input: { id: "m" } },
        ],
      });
      expect(result.isError).toBeFalsy();
      return result.structuredContent as Executed;
    };

    it("places a failure of a repeated action type at its own index", async () => {
      const executed = await deleteModuleTwice(client);
      expect(executed.results.map((r) => [r.index, r.error?.kind])).toEqual([
        [0, undefined],
        [1, "reducer-error"],
      ]);
    });

    it("reads outcomes from the stored operations when the job carries none", async () => {
      // As a remote client's job info, which may have no result.
      const write = Object.assign(Object.create(client.write) as object, {
        execute: async (
          ...args: Parameters<ReactorClient["write"]["execute"]>
        ) => {
          const handle = await client.write.execute(...args);
          const readable = handle.readable.then((receipt) => ({
            ...receipt,
            job: { ...receipt.job, result: undefined },
          }));
          return { ...handle, readable };
        },
      });
      const host = Object.assign(Object.create(client) as ReactorClient, {
        write,
      });
      const executed = await deleteModuleTwice(host);
      expect(executed.results.map((r) => [r.index, r.error?.kind])).toEqual([
        [0, undefined],
        [1, "reducer-error"],
      ]);
      expect(
        executed.results.every((r) => r.operationIndex !== undefined),
      ).toBe(true);
    });

    // As a piece host's pre-submit gate refuses a batch.
    const deniedBatch = (denied: { index: number; type: string }[]) =>
      Object.assign(new Error("The run user may not apply SET_MODEL_ID"), {
        name: "ReactorAccessDeniedError",
        denied: denied.map((d) => ({ ...d, reason: "no grant" })),
      });

    const refusingHost = (error: Error) =>
      Object.assign(Object.create(client) as ReactorClient, {
        write: Object.assign(Object.create(client.write) as object, {
          execute: () => Promise.reject(error),
        }),
      });

    it("maps a piece host's denial to denied and not-applied results", async () => {
      const documentId = await newModelDocument();
      const before = (await client.get(documentId)).header.revision;
      const host = refusingHost(
        deniedBatch([{ index: 2, type: "SET_MODEL_NAME" }]),
      );
      const result = await toMcpTool(addActionsTool, {
        client: host,
      }).callback({
        documentId,
        actions: [
          { type: "SET_MODEL_NAME", input: { name: "a" } },
          { type: "SET_MODEL_ID", input: { id: "b" } },
          { type: "SET_MODEL_NAME", input: { name: "c" } },
        ],
      });
      expect(result.isError).toBeFalsy();
      const executed = result.structuredContent as Executed;
      expect(executed).toMatchObject({ success: false, revision: before });
      const notApplied = {
        kind: "not-applied",
        message: expect.stringContaining("nothing in it was written"),
      };
      expect(executed.results.map((r) => r.error)).toEqual([
        notApplied,
        notApplied,
        { kind: "denied", message: "no grant" },
      ]);
      expect(
        executed.results.every((r) => r.operationIndex === undefined),
      ).toBe(true);
    });

    it("reads the denied indexes from a denial that crossed the piece RPC", async () => {
      const documentId = await newModelDocument();
      const message =
        "The run user may not apply SET_MODEL_ID (no grant) to document x";
      const host = refusingHost(
        Object.assign(new Error(`${message}; denied action indexes: [1]`), {
          name: "ReactorAccessDeniedError",
        }),
      );
      const result = await toMcpTool(addActionsTool, {
        client: host,
      }).callback({
        documentId,
        actions: [
          { type: "SET_MODEL_NAME", input: { name: "a" } },
          { type: "SET_MODEL_ID", input: { id: "b" } },
        ],
      });
      const executed = result.structuredContent as Executed;
      expect(executed.results.map((r) => r.error?.kind)).toEqual([
        "not-applied",
        "denied",
      ]);
      expect(executed.results[1].error?.message).toBe(message);
    });

    it("fails a built action the job reports no outcome for", async () => {
      const documentId = await newModelDocument();
      const document = await client.get(documentId);
      const write = Object.assign(Object.create(client.write) as object, {
        execute: async (
          ...args: Parameters<ReactorClient["write"]["execute"]>
        ) => {
          const handle = await client.write.execute(...args);
          const readable = handle.readable.then((receipt) => ({
            ...receipt,
            job: {
              ...receipt.job,
              result: { actions: [], allApplied: true },
            },
          }));
          return { ...handle, readable };
        },
      });
      const host = Object.assign(Object.create(client) as ReactorClient, {
        write,
      });
      await expect(
        executeBuiltActions(host, document, [setName("x")]),
      ).rejects.toMatchObject({
        failures: [{ index: 0, type: "SET_NAME", code: "REDUCER_ERROR" }],
      });
    });

    it("reads the document and revision on the branch it writes", async () => {
      const documentId = await newModelDocument();
      const branches: (string | undefined)[] = [];
      const host = Object.assign(Object.create(client) as ReactorClient, {
        get: (...args: Parameters<ReactorClient["get"]>) => {
          branches.push(args[1]?.branch);
          return client.get(...args);
        },
      });
      await executeActions(
        host,
        documentId,
        [{ type: "SET_MODEL_NAME", input: { name: "b" } }],
        { branch: "main" },
      );
      expect(branches).toEqual(["main", "main"]);
    });

    it("fails a built write a piece host denied as FORBIDDEN, naming the action", async () => {
      const documentId = await newModelDocument();
      const document = await client.get(documentId);
      const host = refusingHost(deniedBatch([{ index: 1, type: "SET_NAME" }]));
      await expect(
        executeBuiltActions(host, document, [setName("a"), setName("b")]),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        failures: [
          {
            index: 1,
            type: "SET_NAME",
            code: "FORBIDDEN",
            errors: ["no grant"],
          },
        ],
      });
    });

    describe("UNDO and REDO", () => {
      // A reactor that runs base-reducer 3; every document names its version.
      beforeEach(async () => {
        reactorModule.reactor.kill();
        reactorModule = await createUndoV3ReactorClientModule();
        client = reactorModule.client;
      });

      const setModelName = (name: string) =>
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
          { protocolVersions: { "base-reducer": 3 } },
        );
        const stored = await client.get<PHDocument>(document.header.id);
        expect(stored.header.protocolVersions?.["base-reducer"]).toBe(3);
        if (names.length > 0) {
          await (
            await client.write.execute(
              document.header.id,
              "main",
              names.map(setModelName),
            )
          ).readable;
        }
        return document.header.id;
      }

      const undo = (count?: number) => ({
        type: "UNDO",
        input: count === undefined ? {} : { count },
        scope: "global",
      });
      const redo = (count?: number) => ({
        type: "REDO",
        input: count === undefined ? {} : { count },
        scope: "global",
      });

      it("submits one job on base-reducer 3, each step a RETRACT", async () => {
        const documentId = await v3Document();
        const execute = vi.spyOn(client.write, "execute");
        const executed = await call<Executed>(addActionsTool, {
          documentId,
          actions: [
            setModelName("first"),
            setModelName("second"),
            setModelName("third"),
            undo(2),
            redo(),
          ],
        });

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
        const [, second, third, undoThird, undoSecond, redone] = rows.map(
          (row) => row.action,
        );
        expect(targetOf(undoThird)).toBe(third.id);
        expect(targetOf(undoSecond)).toBe(second.id);
        expect(targetOf(redone)).toBe(undoSecond.id);
        // One result per input action; the counted UNDO reports its last row.
        expect(
          executed.results.map(({ index, type, operationIndex }) => [
            index,
            type,
            operationIndex,
          ]),
        ).toEqual([
          [0, "SET_MODEL_NAME", 0],
          [1, "SET_MODEL_NAME", 1],
          [2, "SET_MODEL_NAME", 2],
          [3, "UNDO", 4],
          [4, "REDO", 5],
        ]);
      });

      it("resolves the target from the state the document was created with", async () => {
        const documentId = await v3Document();
        const { setModelDescription, addModule } =
          documentModelDocumentModelModule.actions;
        await (
          await client.write.execute(documentId, "main", [
            setModelDescription({ description: "d" }),
            addModule({ id: "m1", name: "m1" }),
          ])
        ).readable;

        // Re-applied over the head state, ADD_MODULE throws on its own module.
        await call(addActionsTool, { documentId, actions: [undo()] });

        const [, added, undone] = (await globalRows(documentId)).map(
          (row) => row.action,
        );
        expect(added.type).toBe("ADD_MODULE");
        expect(targetOf(undone)).toBe(added.id);
        const { global } = (await client.get<PHDocument>(documentId))
          .state as unknown as {
          global: {
            description: string;
            specifications: { modules: unknown[] }[];
          };
        };
        expect(global.description).toBe("d");
        expect(global.specifications[0].modules).toEqual([]);
      });

      it("retracts an action from earlier in the same call", async () => {
        const documentId = await v3Document("stored");
        await call(addActionsTool, {
          documentId,
          actions: [setModelName("a"), undo(), setModelName("b")],
        });

        expect(await nameOf(documentId)).toBe("b");
        const [, a, undone, b] = (await globalRows(documentId)).map(
          (row) => row.action,
        );
        expect([a.type, undone.type, b.type]).toEqual([
          "SET_MODEL_NAME",
          "RETRACT",
          "SET_MODEL_NAME",
        ]);
        expect(targetOf(undone)).toBe(a.id);

        // b follows the undo, so there is nothing left to redo.
        const error = await fail(addActionsTool, {
          documentId,
          actions: [redo()],
        });
        expect(error.message).toContain(
          "Cannot redo: nothing to redo in scope history",
        );
      });

      it("undoes the call's own rows first, then stored ones, for a count", async () => {
        const documentId = await v3Document("x");
        await call(addActionsTool, {
          documentId,
          actions: [setModelName("a"), undo(2)],
        });

        expect(await nameOf(documentId)).toBe("");
        const [x, a, undoA, undoX] = (await globalRows(documentId)).map(
          (row) => row.action,
        );
        expect(targetOf(undoA)).toBe(a.id);
        expect(targetOf(undoX)).toBe(x.id);
      });

      it("redoes stored undos and the call's own, latest first", async () => {
        const documentId = await v3Document("x", "y");
        await call(addActionsTool, { documentId, actions: [undo(2)] });
        expect(await nameOf(documentId)).toBe("");

        await call(addActionsTool, {
          documentId,
          actions: [redo(), undo(), redo(2)],
        });

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
        await call(addActionsTool, {
          documentId,
          actions: [{ type: "SET_NAME", input: "renamed" }, undo()],
        });

        expect(await nameOf(documentId)).toBe("");
        const updated = await client.get<PHDocument>(documentId);
        expect(updated.header.name).toBe("renamed");
        const [x, , undone] = (await globalRows(documentId)).map(
          (row) => row.action,
        );
        expect(targetOf(undone)).toBe(x.id);
      });

      it("writes nothing when the job is refused for a later action", async () => {
        const documentId = await v3Document("x", "y");
        const before = await globalRows(documentId);
        let submitted: Action[] = [];
        // Denies the counted UNDO's second step and the schema change.
        const evaluateActions: ReactorClient["write"]["evaluateActions"] = (
          _id,
          _branch,
          candidates,
        ) =>
          Promise.resolve({
            evaluations: candidates.map((candidate, index) =>
              index === 2 || candidate.type === "SET_STATE_SCHEMA"
                ? { decision: "deny" as const, reason: `denied: ${index}` }
                : { decision: "allow" as const },
            ),
            allAllowed: false,
            anyAllowed: true,
            allDenied: false,
            anyDenied: true,
          });
        // As the reactor refuses a denied batch: the job fails and writes nothing.
        const write = Object.assign(Object.create(client.write) as object, {
          evaluateActions,
          execute: (id: string, _branch: string, actions: Action[]) => {
            submitted = actions;
            const job: JobInfo = {
              id: "refused",
              documentId: id,
              status: JobStatus.FAILED,
              createdAtUtcIso: new Date().toISOString(),
              consistencyToken: {
                version: 1,
                createdAtUtcIso: new Date().toISOString(),
                coordinates: [],
              },
              meta: { batchId: "refused", batchJobIds: ["refused"] },
              error: {
                name: "AuthorizationDeniedError",
                message: "denied: b",
                stack: "",
              },
            };
            return Promise.resolve({
              readable: Promise.reject(new JobFailedError(job)),
            } as unknown as WriteHandle);
          },
        });
        const host = Object.assign(Object.create(client) as ReactorClient, {
          write,
          evaluateActions,
        });
        const result = await toMcpTool(addActionsTool, {
          client: host,
        }).callback({
          documentId,
          actions: [
            setModelName("a"),
            undo(2),
            documentModelDocumentModelModule.actions.setStateSchema({
              scope: "global",
              schema: "type B { b: String }",
            }),
          ],
        });

        expect(submitted.map((action) => action.type)).toEqual([
          "SET_MODEL_NAME",
          "RETRACT",
          "RETRACT",
          "SET_STATE_SCHEMA",
        ]);
        expect(result.isError).toBeFalsy();
        const { success, results } = result.structuredContent as Executed;
        expect({ success, results }).toStrictEqual({
          success: false,
          results: [
            {
              index: 0,
              type: "SET_MODEL_NAME",
              scope: "global",
              error: {
                kind: "not-applied",
                message: expect.stringContaining(
                  "The batch was refused, so nothing in it was written",
                ),
              },
            },
            {
              index: 1,
              type: "UNDO",
              scope: "global",
              error: { kind: "denied", message: "denied: 2" },
            },
            {
              index: 2,
              type: "SET_STATE_SCHEMA",
              scope: "global",
              error: { kind: "denied", message: "denied: 3" },
            },
          ],
        });
        expect(await globalRows(documentId)).toEqual(before);
        expect(await nameOf(documentId)).toBe("y");
      });

      it("reports a reducer error by the input that caused it", async () => {
        const documentId = await v3Document("x");
        const { addModule } = documentModelDocumentModelModule.actions;
        const result = await toMcpTool(addActionsTool, { client }).callback({
          documentId,
          actions: [
            setModelName("a"),
            undo(2),
            addModule({ id: "m1", name: "m1" }),
            addModule({ id: "m1", name: "m1" }),
          ],
        });

        expect(result.isError).toBeFalsy();
        const { success, results } = result.structuredContent as Executed;
        expect(success).toBe(false);
        expect(
          results.map(({ index, type, operationIndex, error }) => [
            index,
            type,
            operationIndex,
            error?.kind,
          ]),
        ).toEqual([
          [0, "SET_MODEL_NAME", 1, undefined],
          [1, "UNDO", 3, undefined],
          [2, "ADD_MODULE", 4, undefined],
          [3, "ADD_MODULE", 5, "reducer-error"],
        ]);
      });

      it("reads a counted UNDO's last row back when the job carries no result", async () => {
        const actions = [setModelName("a"), undo(2), setModelName("b")];
        const expected = await call<Executed>(addActionsTool, {
          documentId: await v3Document("x"),
          actions,
        });

        const write = Object.assign(Object.create(client.write) as object, {
          execute: async (
            ...args: Parameters<ReactorClient["write"]["execute"]>
          ) => {
            const handle = await client.write.execute(...args);
            const readable = handle.readable.then((receipt) => ({
              ...receipt,
              job: { ...receipt.job, result: undefined },
            }));
            return { ...handle, readable };
          },
        });
        const host = Object.assign(Object.create(client) as ReactorClient, {
          write,
        });
        const result = await toMcpTool(addActionsTool, {
          client: host,
        }).callback({ documentId: await v3Document("x"), actions });

        expect(result.isError).toBeFalsy();
        const { success, results } = result.structuredContent as Executed;
        expect({ success, results }).toStrictEqual({
          success: true,
          results: [
            {
              index: 0,
              type: "SET_MODEL_NAME",
              scope: "global",
              operationIndex: 1,
            },
            { index: 1, type: "UNDO", scope: "global", operationIndex: 3 },
            {
              index: 2,
              type: "SET_MODEL_NAME",
              scope: "global",
              operationIndex: 4,
            },
          ],
        });
        expect(results).toStrictEqual(expected.results);
      });

      it("writes nothing when the reactor refuses a stale target", async () => {
        const documentId = await v3Document("x");
        const [x] = (await globalRows(documentId)).map((row) => row.action);
        // Another writer's retraction of x, created before the call and
        // landing after its targets are resolved.
        const external = retract(x.id, "global");
        const execute = client.write.execute.bind(client.write);
        let interfered = false;
        vi.spyOn(client.write, "execute").mockImplementation(
          async (id, branch, actions, ...rest) => {
            const retractsX = actions.some(
              (action) =>
                action.type === "RETRACT" && targetOf(action) === x.id,
            );
            if (retractsX && !interfered) {
              interfered = true;
              await (
                await execute(id, "main", [external])
              ).readable;
            }
            return execute(id, branch, actions, ...rest);
          },
        );
        const error = await fail(addActionsTool, {
          documentId,
          actions: [setModelName("a"), undo(2), setModelName("b")],
        });

        expect(interfered).toBe(true);
        expect(error.message).toContain("target-retracted");
        expect(
          (await globalRows(documentId)).map((row) => row.action.type),
        ).toEqual(["SET_MODEL_NAME", "RETRACT"]);
        expect(await nameOf(documentId)).toBe("");
      });

      it("refuses with nothing to undo and writes nothing", async () => {
        const documentId = await v3Document();
        const execute = vi.spyOn(client.write, "execute");
        const error = await fail(addActionsTool, {
          documentId,
          actions: [setModelName("a"), undo(2)],
        });

        expect(error.code).toBe("INVALID_ACTION");
        expect(error.failures?.map((f) => [f.index, f.type])).toEqual([
          [1, "UNDO"],
        ]);
        expect(error.message).toContain(
          "Cannot undo: nothing to undo in scope history",
        );
        expect(execute).not.toHaveBeenCalled();
        expect(await globalRows(documentId)).toEqual([]);
      });

      it.each([0, -1, 1.5])(
        "refuses a count of %d before submitting anything",
        async (count) => {
          const documentId = await v3Document("x");
          const execute = vi.spyOn(client.write, "execute");
          for (const action of [undo(count), redo(count)]) {
            const error = await fail(addActionsTool, {
              documentId,
              actions: [setModelName("a"), action],
            });

            expect(error.code).toBe("INVALID_ACTION");
            expect(error.failures?.map((f) => [f.index, f.type])).toEqual([
              [1, action.type],
            ]);
            expect(error.message).toContain("count must be a positive integer");
          }
          expect(execute).not.toHaveBeenCalled();
          expect(await nameOf(documentId)).toBe("x");
        },
      );

      // Below base-reducer 3 the count goes to the reactor unchecked.
      it.each([0, -1, 1.5])(
        "submits an UNDO with a count of %d unchanged on base-reducer 2",
        async (count) => {
          const documentId = await newModelDocument();
          expect(
            (await client.get<PHDocument>(documentId)).header
              .protocolVersions?.["base-reducer"],
          ).toBe(2);
          const execute = vi.spyOn(client.write, "execute");
          const executed = await call<Executed>(addActionsTool, {
            documentId,
            actions: [setModelName("x"), setModelName("a"), undo(count)],
          });

          expect(execute).toHaveBeenCalledTimes(1);
          expect(
            execute.mock.calls[0][2].map(({ type, input }) => ({
              type,
              input,
            })),
          ).toEqual([
            { type: "SET_MODEL_NAME", input: { name: "x" } },
            { type: "SET_MODEL_NAME", input: { name: "a" } },
            { type: "UNDO", input: { count } },
          ]);
          expect(
            executed.results.map(({ index, type }) => [index, type]),
          ).toEqual([
            [0, "SET_MODEL_NAME"],
            [1, "SET_MODEL_NAME"],
            [2, "UNDO"],
          ]);
        },
      );

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
          const execute = vi.spyOn(client.write, "execute");
          await call(addActionsTool, {
            documentId,
            actions: [setModelName("a"), setModelName("b"), undo(1)],
          });

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

    it("fails NOT_FOUND for an unknown document", async () => {
      const error = await fail(addActionsTool, {
        documentId: "non-existent-id",
        actions: [{ type: "SET_NAME", input: "x" }],
      });
      expect(error.code).toBe("NOT_FOUND");
    });
  });

  describe("drive reads", () => {
    it("lists drives and reads one", async () => {
      const driveId = await newDrive();
      const { drives } = await call<{ drives: { id: string }[] }>(
        getDrivesTool,
        {},
      );
      expect(drives.map((d) => d.id)).toContain(driveId);
      const { drive } = await call<{ drive: { id: string; state: unknown } }>(
        getDriveTool,
        { driveId, filter: "$.global.nodes" },
      );
      expect(drive).toMatchObject({ id: driveId, state: [] });
    });
  });

  describe("document model tools", () => {
    it("lists the models", async () => {
      const { documentModels } = await call<{
        documentModels: { type: string }[];
      }>(getDocumentModelsTool, {});
      expect(documentModels.map((m) => m.type).sort()).toEqual([
        "powerhouse/document-drive",
        "powerhouse/document-model",
      ]);
    });

    it("summarizes a model by default", async () => {
      const result = await call<{
        model: { modules: { name: string; operations: string[] }[] };
      }>(getDocumentModelSchemaTool, { type: "powerhouse/document-drive" });
      expect(result).not.toHaveProperty("operation");
      expect(result.model.modules.flatMap((m) => m.operations)).toContain(
        "ADD_FILE",
      );
    });

    it("slices one operation, the state, or a JSONPath", async () => {
      const type = "powerhouse/document-drive";
      const { operation } = await call<{
        operation: { name: string; scope: string; schema: string };
      }>(getDocumentModelSchemaTool, { type, operation: "ADD_FILE" });
      expect(operation).toMatchObject({ name: "ADD_FILE", scope: "global" });
      expect(operation.schema).toContain("input AddFileInput");

      const { state } = await call<{ state: { schema: string } }>(
        getDocumentModelSchemaTool,
        { type, state: "global" },
      );
      expect(state.schema).toContain("nodes");

      const { value } = await call<{ value: unknown }>(
        getDocumentModelSchemaTool,
        { type, filter: "$.modules[*].name" },
      );
      expect(value).toEqual(expect.arrayContaining(["Node"]));
    });

    it("suggests the closest operation for an unknown one", async () => {
      const error = await fail(getDocumentModelSchemaTool, {
        type: "powerhouse/document-drive",
        operation: "ADD_FIL",
      });
      expect(error.code).toBe("NOT_FOUND");
      expect(error.message).toContain("Did you mean: ADD_FILE");
    });

    it("shows ADD_OPERATION's scope input", async () => {
      const { operation } = await call<{ operation: { schema: string } }>(
        getDocumentModelSchemaTool,
        { type: "powerhouse/document-model", operation: "ADD_OPERATION" },
      );
      expect(operation.schema).toContain("scope: String");
    });

    it("returns only the actions with compact: true", async () => {
      const type = "powerhouse/document-model";
      const full = await toMcpTool(getDocumentModelSchemaTool, {
        client,
      }).callback({ type, filter: "$" });
      const result = await toMcpTool(getDocumentModelSchemaTool, {
        client,
      }).callback({ type, compact: true });
      expect(result.isError).toBeFalsy();
      const { compact } = result.structuredContent as {
        compact: CompactDocumentModelSchema;
      };
      expect(compact).toMatchObject({ id: type, version: 1 });
      expect(compact.actions).toContainEqual({
        type: "ADD_OPERATION",
        scope: "global",
        input:
          "input AddOperationInput { moduleId: ID! id: ID! name: String! schema: String description: String template: String reducer: String scope: String }",
      });
      expect(compact.actions).toContainEqual({
        type: "RELEASE_NEW_VERSION",
        scope: "global",
        input: null,
      });
      const text = (r: CallToolResult) =>
        r.content[0].type === "text" ? r.content[0].text : "";
      expect(text(result).length).toBeLessThan(text(full).length / 2);
    });

    it("includes the enums a compact input references", async () => {
      const { compact } = await call<{ compact: CompactDocumentModelSchema }>(
        getDocumentModelSchemaTool,
        { type: "powerhouse/document-drive", compact: true },
      );
      expect(compact.actions).toContainEqual(
        expect.objectContaining({ type: "ADD_TRIGGER", scope: "local" }),
      );
      expect(compact.types?.TriggerType).toMatch(/^enum TriggerType \{ .+ \}$/);
      expect(compact.types?.TransmitterType).toMatch(/^enum TransmitterType /);
      expect(Object.keys(compact.types ?? {}).sort()).toEqual([
        "TransmitterType",
        "TriggerType",
      ]);
    });
  });

  describe("admin tools", () => {
    const admin = (remoteDriveUrls?: RemoteDriveAllowlist, sync = true) =>
      Object.fromEntries(
        reactorAdminTools({
          syncManager: sync ? ({} as ISyncManager) : undefined,
          remoteDriveUrls,
        }).map((tool) => [tool.name, toMcpTool(tool, { client })]),
      );

    it("adds and deletes a drive", async () => {
      const tools = admin();
      const added = await tools.addDrive.callback({
        driveInput: { global: { name: "Admin drive", icon: "i" } },
      } as never);
      const { driveId } = added.structuredContent as { driveId: string };
      const drive = await client.get<DocumentDriveDocument>(driveId);
      expect(drive.header.name).toBe("Admin drive");
      expect(drive.state.global.icon).toBe("i");

      const deleted = await tools.deleteDrive.callback({ driveId } as never);
      expect(deleted.structuredContent).toEqual({ driveId });
      const missing = await tools.deleteDrive.callback({ driveId } as never);
      expect(missing._meta?.error).toMatchObject({ code: "NOT_FOUND" });
    });

    const addDrive = async (args: Record<string, unknown>) => {
      const result = await admin().addDrive.callback(args as never);
      expect(result.isError).toBeFalsy();
      return client.get<DocumentDriveDocument>(
        (result.structuredContent as { driveId: string }).driveId,
      );
    };

    it("names the drive in the header and the global state, with the preferred editor", async () => {
      const drive = await addDrive({
        driveInput: { global: { name: "With Pref" }, preferredEditor: "app" },
      });
      expect(drive.header.name).toBe("With Pref");
      expect(drive.header.meta?.preferredEditor).toBe("app");
      expect(drive.state.global.name).toBe("With Pref");
    });

    it("takes name, icon and preferredEditor at the top level", async () => {
      const drive = await addDrive({
        name: "Flat",
        icon: "flat-icon",
        preferredEditor: "app",
      });
      expect(drive.header.name).toBe("Flat");
      expect(drive.header.meta?.preferredEditor).toBe("app");
      expect(drive.state.global.name).toBe("Flat");
      expect(drive.state.global.icon).toBe("flat-icon");
    });

    it("takes the name inside driveInput without global", async () => {
      const drive = await addDrive({
        driveInput: { name: "Flat Input", preferredEditor: "app" },
      });
      expect(drive.header.name).toBe("Flat Input");
      expect(drive.header.meta?.preferredEditor).toBe("app");
      expect(drive.state.global.name).toBe("Flat Input");
    });

    it("needs a drive name", async () => {
      const result = await admin().addDrive.callback({
        preferredEditor: "app",
      } as never);
      expect(result._meta?.error).toEqual({
        code: "INVALID_ACTION",
        message: "addDrive needs the drive's `name`",
      });
    });

    it("refuses two different names", async () => {
      const result = await admin().addDrive.callback({
        name: "One",
        driveInput: { global: { name: "Other" } },
      } as never);
      expect(result._meta?.error).toMatchObject({ code: "INVALID_ACTION" });
      expect((result._meta?.error as ToolError).message).toContain(
        "addDrive got different values for `name`",
      );
    });

    it("deleteDrive refuses a document that is not a drive", async () => {
      const documentId = await newModelDocument();
      const result = await admin().deleteDrive.callback({
        documentId,
      } as never);
      expect(result._meta?.error).toMatchObject({ code: "INVALID_ACTION" });
      await expect(client.get(documentId)).resolves.toBeDefined();
    });

    it("deleteDrive takes documentId, driveId or id", async () => {
      for (const name of ["documentId", "driveId", "id"]) {
        const driveId = await newDrive();
        const result = await admin().deleteDrive.callback({
          [name]: driveId,
        } as never);
        expect(result.structuredContent, name).toEqual({ driveId });
      }
    });

    it("mounts addRemoteDrive only with allowed URLs and a sync manager", () => {
      expect(admin()).not.toHaveProperty("addRemoteDrive");
      expect(admin("*", false)).not.toHaveProperty("addRemoteDrive");
      expect(admin("*")).toHaveProperty("addRemoteDrive");
    });

    it("fetches no URL outside the allowlist", async () => {
      const result = await admin([
        "https://allowed.example",
      ]).addRemoteDrive.callback({
        url: "https://example.com/d/x",
      } as never);
      expect(result._meta?.error).toMatchObject({ code: "FORBIDDEN" });
    });

    describe("against a drive info server", () => {
      let origin: string;
      let close: () => Promise<void>;
      let graphqlEndpoint: string;

      beforeEach(async () => {
        graphqlEndpoint = "/graphql";
        const server = createHttpServer((req, res) => {
          if (req.url === "/redirect") {
            res.writeHead(302, { location: "/d/info" }).end();
            return;
          }
          res
            .writeHead(200, { "content-type": "application/json" })
            .end(JSON.stringify({ id: "remote-drive", graphqlEndpoint }));
        });
        await new Promise<void>((resolve) => server.listen(0, resolve));
        origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        close = () => new Promise((resolve) => server.close(() => resolve()));
      });

      afterEach(() => close());

      function remoteTool() {
        const added: unknown[] = [];
        const syncManager = {
          list: () => [],
          add: (...args: unknown[]) => {
            added.push(args);
            return Promise.resolve({});
          },
        } as unknown as ISyncManager;
        const tool = reactorAdminTools({
          syncManager,
          remoteDriveUrls: [origin],
        }).find((t) => t.name === "addRemoteDrive")!;
        return { added, tool: toMcpTool(tool, { client }) };
      }

      it("syncs with an allowed endpoint resolved against the info URL", async () => {
        const { added, tool } = remoteTool();
        const result = await tool.callback({
          url: `${origin}/d/info`,
        } as never);
        expect(result.structuredContent).toEqual({ driveId: "remote-drive" });
        expect(added).toEqual([
          [
            expect.any(String),
            expect.anything(),
            { type: "gql", parameters: { url: `${origin}/graphql` } },
          ],
        ]);
      });

      it("refuses a redirect", async () => {
        const { added, tool } = remoteTool();
        const result = await tool.callback({
          url: `${origin}/redirect`,
        } as never);
        expect(result._meta?.error).toMatchObject({ code: "FORBIDDEN" });
        expect(added).toEqual([]);
      });

      it("refuses a graphqlEndpoint outside the allowlist", async () => {
        graphqlEndpoint = "https://elsewhere.example/graphql";
        const { added, tool } = remoteTool();
        const result = await tool.callback({
          url: `${origin}/d/info`,
        } as never);
        expect(result._meta?.error).toMatchObject({ code: "FORBIDDEN" });
        expect(added).toEqual([]);
      });
    });
  });

  describe("target ID aliases", () => {
    it("getDrive takes documentId, driveId or id", async () => {
      const driveId = await newDrive();
      for (const name of ["documentId", "driveId", "id"]) {
        const { drive } = await call<{ drive: { id: string } }>(getDriveTool, {
          [name]: driveId,
        });
        expect(drive.id, name).toBe(driveId);
      }
    });

    it("getDocuments takes documentId, driveId or parentId", async () => {
      const driveId = await newDrive();
      const { documentId } = await call<{ documentId: string }>(
        createDocumentTool,
        { documentType: "powerhouse/document-model", driveId },
      );
      for (const name of ["documentId", "driveId", "parentId"]) {
        const { documents } = await call<{ documents: { id: string }[] }>(
          getDocumentsTool,
          { [name]: driveId },
        );
        expect(
          documents.map((d) => d.id),
          name,
        ).toEqual([documentId]);
      }
    });

    it("addActions takes documentId or id", async () => {
      const documentId = await newModelDocument();
      for (const name of ["documentId", "id"]) {
        const result = await call(addActionsTool, {
          [name]: documentId,
          actions: [{ type: "SET_NAME", input: name }],
        });
        expect(result, name).toMatchObject({ success: true });
        expect((await client.get(documentId)).header.name).toBe(name);
      }
    });

    it("deleteDocument takes documentId or id", async () => {
      for (const name of ["documentId", "id"]) {
        const documentId = await newModelDocument();
        expect(
          await call(deleteDocumentTool, { [name]: documentId }),
          name,
        ).toEqual({ documentId });
      }
    });

    it("keeps every alias and addDrive shape through the MCP schema", async () => {
      const driveId = await newDrive();
      const server = await createServer({ client });
      const mcp = new Client({ name: "test", version: "1.0.0" });
      const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
      await Promise.all([server.connect(serverSide), mcp.connect(clientSide)]);
      try {
        const idOf = (result: CallToolResult) => {
          const content = result.structuredContent as {
            document?: { id: string };
            drive?: { id: string };
          };
          return (content.document ?? content.drive)?.id;
        };
        for (const [tool, name] of [
          ["getDocument", "documentId"],
          ["getDocument", "id"],
          ["getDrive", "documentId"],
          ["getDrive", "driveId"],
          ["getDrive", "id"],
        ] as const) {
          const result = (await mcp.callTool({
            name: tool,
            arguments: { [name]: driveId },
          })) as CallToolResult;
          expect(result.isError, `${tool} ${name}`).toBeFalsy();
          expect(idOf(result), `${tool} ${name}`).toBe(driveId);
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

        const folder = { type: "ADD_FOLDER", input: { id: "f", name: "f" } };
        const added = (await mcp.callTool({
          name: "addActions",
          arguments: { id: driveId, actions: [folder, folder] },
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

  describe("adapters", () => {
    it("builds an ai SDK tool set that runs and throws typed errors", async () => {
      const tools = toAiSdkTools(reactorTools(), { client });
      expect(tools.getDocument.inputSchema).toBe(getDocumentTool.inputSchema);
      const id = await newModelDocument();
      const { document } = await tools.getDocument.execute({ id });
      expect(document.id).toBe(id);

      const error = await tools.addActions
        .execute({
          documentId: id,
          actions: [{ type: "NOPE" }, { type: "ALSO_NOPE" }],
        })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ReactorToolError);
      expect(error).toMatchObject({ code: "INVALID_ACTION" });
      expect((error as ReactorToolError).failures).toHaveLength(2);
      expect((error as Error).message).toMatch(
        /^INVALID_ACTION: 2 actions failed/,
      );
    });

    it("serves every tool through the MCP server with valid output", async () => {
      const server = await createServer({ client });
      const mcp = new Client({ name: "test", version: "1.0.0" });
      const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
      await Promise.all([server.connect(serverSide), mcp.connect(clientSide)]);
      try {
        const { tools } = await mcp.listTools();
        expect(tools.map((t) => t.name).sort()).toEqual(
          [
            ...reactorTools().map((t) => t.name),
            "getCodegenStatus",
            "addDrive",
            "deleteDrive",
          ].sort(),
        );
        const addActions = tools.find((t) => t.name === "addActions");
        expect(addActions?.annotations).toMatchObject({
          destructiveHint: true,
        });
        expect(addActions?.outputSchema).toBeDefined();

        const driveId = await newDrive();
        const created = await mcp.callTool({
          name: "createDocument",
          arguments: {
            documentType: "powerhouse/document-model",
            driveId,
            name: "Via MCP",
          },
        });
        expect(created.isError).toBeFalsy();
        const read = await mcp.callTool({
          name: "getDrive",
          arguments: { driveId },
        });
        expect(read.isError).toBeFalsy();
        expect(JSON.stringify(read.structuredContent)).toContain("Via MCP");
      } finally {
        await mcp.close();
        await server.close();
      }
    });
  });
});
