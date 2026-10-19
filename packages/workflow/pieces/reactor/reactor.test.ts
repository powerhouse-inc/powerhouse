// The piece's blocks and props against a real in-process reactor client.
import {
  ReactorBuilder,
  ReactorClientBuilder,
  type IReactorClient,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import {
  driveDocumentModelModule,
  type DocumentDriveDocument,
} from "@powerhousedao/shared/document-drive";
import type {
  DocumentModelModule,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Connection } from "../../document-models/connection/v1/module.js";
import { documentCreateAction } from "./lib/actions/document-create.js";
import { documentDispatchAction } from "./lib/actions/document-dispatch.js";
import { documentFindAction } from "./lib/actions/document-find.js";
import { documentGetAction } from "./lib/actions/document-get.js";
import { documentSchemaAction } from "./lib/actions/document-schema.js";
import { documentTypesAction } from "./lib/actions/document-types.js";
import {
  actionInputProp,
  actionTypeProp,
  documentIdProp,
  documentTypeProp,
  driveProp,
  folderProp,
} from "./lib/reactor.js";
import { reactor as piece } from "./index.js";
import { testSigner } from "./test-signer.js";

const CONNECTION = "powerhouse/connection";
const DRIVE = "powerhouse/document-drive";

let module: InProcessReactorClientModule;
let client: IReactorClient;

beforeAll(async () => {
  module = await new ReactorClientBuilder()
    .withSigner(await testSigner("0xpiece"))
    .withReactorBuilder(
      new ReactorBuilder().withDocumentModelSources([
        documentModelDocumentModelModule as unknown as DocumentModelModule,
        driveDocumentModelModule as unknown as DocumentModelModule,
        Connection as unknown as DocumentModelModule,
      ]),
    )
    .buildModule();
  client = module.client;
});

afterAll(() => {
  module.reactor.kill();
});

// A block's context: its config, and the real client as ctx.reactor.
const context = (propsValue: Record<string, unknown>) =>
  ({ propsValue, reactor: client }) as never;

type Output = {
  header: PHDocument["header"];
  state: Record<string, Record<string, unknown>>;
  extractedFrom?: Record<string, string>;
};

// What a write step outputs.
type Reference = {
  documentId: string;
  documentType: string;
  branch: string;
  revision: Record<string, number>;
  extractedFrom?: Record<string, string>;
};

const run = async (
  action: { run: (ctx: never) => Promise<unknown> },
  propsValue: Record<string, unknown>,
) => (await action.run(context(propsValue))) as Output;

const write = async (
  action: { run: (ctx: never) => Promise<unknown> },
  propsValue: Record<string, unknown>,
) => (await action.run(context(propsValue))) as Reference;

// The written document, read back.
const stored = async (reference: Reference) =>
  (await client.get(reference.documentId)) as unknown as Output;

interface Options {
  disabled?: boolean;
  placeholder?: string;
  options: { label: string; value: unknown; inputSchema?: string }[];
}

const options = async (
  prop: unknown,
  propsValue: Record<string, unknown> = {},
) =>
  (await (
    prop as { options: (value: unknown, ctx: unknown) => Promise<Options> }
  ).options(propsValue, { reactor: client })) as Options;

async function newDrive(name: string): Promise<DocumentDriveDocument> {
  return client.drives.create({ global: { name } });
}

async function newConnection(name: string, connectorId?: string) {
  const created = await write(documentCreateAction, {
    documentType: CONNECTION,
    name,
    ...(connectorId
      ? {
          actions: JSON.stringify([
            { type: "SET_CONNECTION_NAME", input: { name } },
            {
              type: "SET_CONNECTOR",
              input: { connectorId, authType: "NONE" },
            },
          ]),
        }
      : {}),
  });
  return created;
}

describe("declarations", () => {
  it("reads for get, find, schema, types and the triggers; writes for create and dispatch", () => {
    const declared = Object.fromEntries(
      [
        documentCreateAction,
        documentDispatchAction,
        documentGetAction,
        documentFindAction,
        documentSchemaAction,
        documentTypesAction,
      ].map((action) => [action.name, action.requireReactor]),
    );
    expect(declared).toEqual({
      "document-create": "write",
      "document-dispatch": "write",
      "document-get": "read",
      "document-find": "read",
      "document-schema": "read",
      "document-types": "read",
    });
    for (const trigger of Object.values(piece.triggers())) {
      expect((trigger as { requireReactor?: string }).requireReactor).toBe(
        "read",
      );
    }
  });
});

describe("document-create", () => {
  it("creates a named document outside any drive, and outputs a reference", async () => {
    const output = await write(documentCreateAction, {
      documentType: CONNECTION,
      name: "Loose",
    });

    const document = await stored(output);
    expect(output).toEqual({
      documentId: document.header.id,
      documentType: CONNECTION,
      branch: "main",
      revision: document.header.revision,
    });
    expect(document.header.name).toBe("Loose");
  });

  it("creates an unnamed document empty", async () => {
    const output = await write(documentCreateAction, {
      documentType: CONNECTION,
    });
    expect((await stored(output)).state.global.name).toBe("");
  });

  it("files into a drive's root, and into a folder the folder prop picked", async () => {
    const drive = await newDrive("Filing");
    const folder = await client.drives.addFolder(drive.header.id, "Invoices");

    const atRoot = await write(documentCreateAction, {
      documentType: CONNECTION,
      name: "At root",
      parentId: drive.header.id,
    });
    const picked = (
      await options(folderProp("Folder", "parentId"), {
        parentId: drive.header.id,
      })
    ).options[0].value;
    const inFolder = await write(documentCreateAction, {
      documentType: CONNECTION,
      name: "In folder",
      parentId: drive.header.id,
      folderId: picked,
    });

    const nodes = (await client.drives.listNodes(drive.header.id)).results;
    expect(nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: atRoot.documentId,
          name: "At root",
          parentFolder: null,
        }),
        expect.objectContaining({
          id: inFolder.documentId,
          name: "In folder",
          parentFolder: folder.id,
        }),
      ]),
    );
    // Both halves of a drive file: the node and the drive's child edge.
    const edges = await client.getOutgoingRelationshipEdges(
      drive.header.id,
      "child",
    );
    expect(edges.results.map((edge) => edge.targetId).sort()).toEqual(
      [atRoot.documentId, inFolder.documentId].sort(),
    );
  });

  it("files under a folder id given with its drive", async () => {
    const drive = await newDrive("By id");
    const folder = await client.drives.addFolder(drive.header.id, "Box");
    const output = await write(documentCreateAction, {
      documentType: CONNECTION,
      parentId: drive.header.id,
      folderId: folder.id,
    });
    const node = await client.drives.getNode(
      drive.header.id,
      output.documentId,
    );
    expect(node.parentFolder).toBe(folder.id);
  });

  it("creates under a document parent that is not a drive", async () => {
    const parent = await newConnection("Parent");
    const named = await write(documentCreateAction, {
      documentType: CONNECTION,
      name: "Child",
      parentId: parent.documentId,
    });
    const empty = await write(documentCreateAction, {
      documentType: CONNECTION,
      parentId: parent.documentId,
    });

    const children = await client.find({ parentId: parent.documentId });
    expect(children.results.map((child) => child.header.id).sort()).toEqual(
      [named.documentId, empty.documentId].sort(),
    );
  });

  it("sends the typed action and the action list after the create", async () => {
    const output = await write(documentCreateAction, {
      documentType: CONNECTION,
      actionType: "SET_CONNECTION_NAME",
      input: { name: "Typed" },
      actions: JSON.stringify([
        {
          type: "SET_CONNECTOR",
          input: { connectorId: "@acme/x#x", authType: "NONE" },
        },
      ]),
    });
    expect((await stored(output)).state.global).toMatchObject({
      name: "Typed",
      connectorId: "@acme/x#x",
    });
  });

  it("creates nothing when the typed action's input is invalid", async () => {
    const count = async () =>
      (
        await client.find({ type: CONNECTION }, undefined, {
          cursor: "",
          limit: 1000,
        })
      ).results.length;
    const before = await count();
    await expect(
      write(documentCreateAction, {
        documentType: CONNECTION,
        actionType: "SET_CONNECTOR",
        input: { connectorId: "@acme/x#x", authType: "NOT_A_KIND" },
      }),
    ).rejects.toThrow();
    expect(await count()).toBe(before);
  });
});

describe("document-dispatch", () => {
  it("builds a typed action with the model's creator, its input coerced", async () => {
    const target = await newConnection("Before");
    const output = await write(documentDispatchAction, {
      documentId: target.documentId,
      actionType: "SET_CONNECTION_NAME",
      input: { name: "After" },
    });
    const document = await stored(output);
    expect(output).toEqual({
      documentId: target.documentId,
      documentType: CONNECTION,
      branch: "main",
      revision: document.header.revision,
    });
    expect(document.state.global.name).toBe("After");
  });

  it("refuses a typed input the creator's validator rejects", async () => {
    const target = await newConnection("Strict");
    await expect(
      write(documentDispatchAction, {
        documentId: target.documentId,
        actionType: "SET_CONNECTOR",
        input: { connectorId: "x", authType: "NOT_A_KIND" },
      }),
    ).rejects.toThrow();
    expect((await client.get(target.documentId)).state).toMatchObject({
      global: { connectorId: "" },
    });
  });

  it("dispatches a JSON action list, on the default branch and scope", async () => {
    const target = await newConnection("List");
    const output = await write(documentDispatchAction, {
      documentId: target.documentId,
      actions: JSON.stringify([
        { type: "SET_CONNECTION_NAME", input: { name: "Listed" } },
        { type: "SET_ACCOUNT_LABEL", input: { accountLabel: "me" } },
      ]),
    });
    expect((await stored(output)).state.global).toMatchObject({
      name: "Listed",
      accountLabel: "me",
    });
  });

  it("enforces the allowed action types", async () => {
    const target = await newConnection("Guarded");
    await expect(
      write(documentDispatchAction, {
        documentId: target.documentId,
        allowedActions: "SET_ACCOUNT_LABEL",
        actions: [{ type: "SET_CONNECTION_NAME", input: { name: "No" } }],
      }),
    ).rejects.toThrow(/not allowed here: SET_CONNECTION_NAME/);
  });

  it("extracts the id and list from model output on request", async () => {
    const target = await newConnection("Prose");
    const documentId = `The document is ${target.documentId}.`;
    const actions = `Thinking.assistantfinal${JSON.stringify([
      { type: "SET_CONNECTION_NAME", input: { name: "Extracted" } },
    ])}`;
    const output = await write(documentDispatchAction, {
      documentId,
      actions,
      parse: "extract",
    });
    expect((await stored(output)).state.global.name).toBe("Extracted");
    expect(output.extractedFrom).toEqual({ documentId, actions });
  });

  it("refuses an id in prose by default, and a scalar list", async () => {
    await expect(
      write(documentDispatchAction, {
        documentId: "Merge this into x",
        actions: "[]",
      }),
    ).rejects.toThrow(/not a document id/);
    await expect(
      write(documentDispatchAction, { documentId: "abc", actions: "42" }),
    ).rejects.toThrow(/must be a list of actions/);
  });

  it("fails on an input that is not an object", async () => {
    const target = await newConnection("Scalar input");
    await expect(
      write(documentDispatchAction, {
        documentId: target.documentId,
        actionType: "SET_CONNECTION_NAME",
        input: '"x"',
      }),
    ).rejects.toThrow(/"input" must be an object/);
  });
});

describe("document-get", () => {
  it("answers with the client's { header, state }", async () => {
    const created = await newConnection("Readable", "@acme/get#get");
    const output = await run(documentGetAction, {
      documentId: created.documentId,
    });
    expect(Object.keys(output).sort()).toEqual(["header", "state"]);
    expect(output.header).toMatchObject({
      id: created.documentId,
      documentType: CONNECTION,
    });
    expect(output.state.global).toMatchObject({
      name: "Readable",
      connectorId: "@acme/get#get",
    });
  });
});

describe("document-find", () => {
  type Found = {
    results: { header: PHDocument["header"]; state?: unknown }[];
    nextCursor?: string;
  };
  const find = async (propsValue: Record<string, unknown>) =>
    (await documentFindAction.run(context(propsValue))) as Found;
  let ids: string[];

  beforeAll(async () => {
    ids = [];
    for (const index of [1, 2, 3, 4, 5]) {
      const created = await newConnection(
        `Paged ${index}`,
        `@acme/paged#${index % 2 ? "odd" : "even"}`,
      );
      ids.push(created.documentId);
    }
  });

  it("pages by nextCursor until the type is exhausted", async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await find({ documentType: CONNECTION, limit: 4, cursor });
      expect(page.results.length).toBeLessThanOrEqual(4);
      seen.push(...page.results.map((result) => result.header.id));
      cursor = page.nextCursor;
      pages++;
    } while (cursor && pages < 20);
    expect(cursor).toBeUndefined();
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toEqual(expect.arrayContaining(ids));
  });

  it("matches names, case-insensitively, over the pages it reads", async () => {
    const first = await find({ name: "paged", limit: 2 });
    expect(first.results).toHaveLength(2);
    expect(first.nextCursor).toBeDefined();
    const rest = await find({
      name: "paged",
      limit: 10,
      cursor: first.nextCursor,
    });
    const names = [...first.results, ...rest.results].map(
      (result) => result.header.id,
    );
    expect(names.sort()).toEqual([...ids].sort());
    expect(rest.nextCursor).toBeUndefined();
  });

  it("matches a state field, with state on request", async () => {
    const found = await find({
      documentType: CONNECTION,
      matchPath: "connectorId",
      matchValue: "@acme/paged#even",
      includeState: true,
    });
    expect(found.results.map((result) => result.header.id).sort()).toEqual(
      [ids[1], ids[3]].sort(),
    );
    expect(found.results[0].state).toMatchObject({
      global: { connectorId: "@acme/paged#even" },
    });
    const bare = await find({
      documentType: CONNECTION,
      matchPath: "connectorId",
      matchValue: "@acme/paged#even",
    });
    expect(Object.keys(bare.results[0])).toEqual(["header"]);
  });

  it("finds across every installed type", async () => {
    const drive = await newDrive("Across");
    const found = await find({ limit: 100 });
    const types = new Set(found.results.map((r) => r.header.documentType));
    expect(types).toEqual(new Set([CONNECTION, DRIVE]));
    expect(found.results.map((r) => r.header.id)).toContain(drive.header.id);
  });

  it("refuses half a state match and a cursor it did not issue", async () => {
    await expect(find({ matchPath: "connectorId" })).rejects.toThrow(
      /set together/,
    );
    await expect(find({ cursor: "nope" })).rejects.toThrow(/nextCursor/);
  });
});

describe("document-schema and document-types", () => {
  it("lists the installed types", async () => {
    const output = (await documentTypesAction.run(context({}))) as {
      count: number;
      types: { documentType: string; name: string }[];
    };
    expect(output.types.map((type) => type.documentType)).toEqual([
      CONNECTION,
      DRIVE,
      "powerhouse/document-model",
    ]);
    expect(output.count).toBe(3);
  });

  it("describes a model's actions, by type or by a document", async () => {
    const byType = (await documentSchemaAction.run(
      context({ documentType: CONNECTION }),
    )) as {
      documentType: string;
      stateSchema: string;
      actions: { type: string; module: string; scope: string }[];
    };
    expect(byType.documentType).toBe(CONNECTION);
    expect(byType.stateSchema).toContain("type ConnectionState");
    expect(byType.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "SET_CONNECTOR",
          module: "connection",
          scope: "global",
        }),
        expect.objectContaining({ type: "SET_NAME", module: "base" }),
      ]),
    );

    const document = await newConnection("Schema source");
    const byDocument = (await documentSchemaAction.run(
      context({ documentId: document.documentId, actionType: "SET_CONFIG" }),
    )) as { actions: { type: string }[] };
    expect(byDocument.actions.map((action) => action.type)).toEqual([
      "SET_CONFIG",
    ]);
  });
});

describe("props", () => {
  it("lists document types", async () => {
    const listed = await options(documentTypeProp());
    expect(listed.options).toEqual(
      expect.arrayContaining([
        { label: `Connection (${CONNECTION})`, value: CONNECTION },
      ]),
    );
  });

  it("labels documents by the name in their state", async () => {
    const document = await newConnection("Labelled");
    await client.execute(document.documentId, "main", [
      Connection.actions.setConnectionName({ name: "Renamed in state" }),
    ]);
    const typed = await options(documentIdProp(), {
      documentType: CONNECTION,
    });
    expect(typed.options).toContainEqual({
      label: "Renamed in state",
      value: document.documentId,
    });
    const untyped = await options(documentIdProp());
    expect(untyped.options).toContainEqual({
      label: `Renamed in state — ${CONNECTION}`,
      value: document.documentId,
    });
  });

  it("lists drives, and a drive's folders with the drive", async () => {
    const drive = await newDrive("Folders");
    const parent = await client.drives.addFolder(drive.header.id, "2026");
    const child = await client.drives.addFolder(
      drive.header.id,
      "Q1",
      parent.id,
    );
    const drives = await options(driveProp("Drive"));
    expect(drives.options).toContainEqual({
      label: "Folders",
      value: drive.header.id,
    });

    const folders = await options(folderProp("Folder", "parentId"), {
      parentId: drive.header.id,
    });
    expect(folders.options).toEqual([
      {
        label: "2026",
        value: { driveId: drive.header.id, folderId: parent.id },
      },
      {
        label: "2026 / Q1",
        value: { driveId: drive.header.id, folderId: child.id },
      },
    ]);
    expect(folders.placeholder).toBe("Folders in Folders");

    const none = await options(folderProp("Folder", "parentId"));
    expect(none).toMatchObject({ disabled: true, options: [] });
  });

  it("lists a type's actions with their input SDL, by type or by document", async () => {
    const byType = await options(actionTypeProp(), {
      documentType: CONNECTION,
    });
    const setConnector = byType.options.find(
      (option) => option.value === "SET_CONNECTOR",
    );
    // The enum the input uses comes along from the state schema.
    expect(setConnector?.inputSchema).toContain("input SetConnectorInput");
    expect(setConnector?.inputSchema).toContain("enum ConnectionAuthType");
    expect(byType.options.map((option) => option.value)).toContain("SET_NAME");

    const document = await newConnection("Action source");
    const byDocument = await options(actionTypeProp(), {
      documentId: document.documentId,
    });
    expect(byDocument.options.map((option) => option.value)).toEqual(
      byType.options.map((option) => option.value),
    );

    const unset = await options(actionTypeProp());
    expect(unset).toMatchObject({
      disabled: true,
      options: [{ value: "SET_NAME" }],
    });
  });

  it("builds the input fields of the chosen action", async () => {
    const fields = await (
      actionInputProp() as unknown as {
        props: (
          value: unknown,
          ctx: unknown,
        ) => Promise<Record<string, { displayName: string }>>;
      }
    ).props(
      { documentType: CONNECTION, actionType: "SET_CONNECTOR" },
      { reactor: client },
    );
    expect(Object.keys(fields).sort()).toEqual(["authType", "connectorId"]);
  });
});
