import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createServer as createHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import type {
  InProcessReactorClientModule,
  ISyncManager,
} from "@powerhousedao/reactor";
import { ReactorBuilder, ReactorClientBuilder } from "@powerhousedao/reactor";
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
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { setName } from "@powerhousedao/shared/document-model";
import {
  documentModelCreateDocument,
  documentModelDocumentModelModule,
} from "document-model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
