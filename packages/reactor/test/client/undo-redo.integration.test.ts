import type {
  Action,
  ActionSigner,
  DocumentModelDocument,
  DocumentModelModule,
  Operation,
  PHBaseState,
  PHDocument,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import {
  addModule,
  createPresignedHeader,
  createReducer,
  generateId,
} from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it } from "vitest";
import { upgradeDocumentAction } from "../../src/actions/index.js";
import type { IReactorClient } from "../../src/client/types.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { synthesizedActionId } from "../../src/executor/synthesized-signing.js";
import { verifyActionSignature } from "../../src/signer/verify-action-signature.js";
import {
  createBaseReducer3Document,
  createDocModelDocument,
  createUndoV3ReactorBuilder,
  withBaseReducer3,
} from "../factories.js";
import { TestP256Signer } from "../utils/p256-signer.js";

const REACTOR_USER: ActionSigner["user"] = {
  address: "0xreactor",
  networkId: "eip155",
  chainId: 1,
};

let client: IReactorClient;
let reactor: IReactor;
let author: TestP256Signer;
let reactorKey: TestP256Signer;

afterEach(() => {
  reactor.kill();
});

async function build(modules: DocumentModelModule<any>[] = []): Promise<void> {
  author = await TestP256Signer.create();
  reactorKey = await TestP256Signer.create();
  const builder = createUndoV3ReactorBuilder({ modules })
    .withExecutorConfig({ signatureVerification: "enforce" })
    .withSigner(reactorKey.asISigner([], REACTOR_USER));
  if (modules.length > 0) {
    builder.withUpgradeManifests([itemsManifest]);
  }
  client = await new ReactorClientBuilder()
    .withReactorBuilder(builder)
    .withSigner(author.asISigner([]))
    .build();
  reactor = (client as unknown as { reactor: IReactor }).reactor;
}

async function createDocument(document: PHDocument): Promise<string> {
  await client.create(document);
  return document.header.id;
}

async function stream(id: string, scope = "global"): Promise<Operation[]> {
  const page = await reactor.getOperations(id, {
    branch: "main",
    scopes: [scope],
  });
  return (page[scope] as (typeof page)[string] | undefined)?.results ?? [];
}

async function moduleIds(id: string): Promise<string[]> {
  const document = await client.get<DocumentModelDocument>(id);
  return document.state.global.specifications[0].modules.map(
    (entry) => entry.id,
  );
}

async function add(id: string, moduleId: string): Promise<void> {
  await client.execute(id, "main", [addModule({ id: moduleId, name: "m" })]);
}

describe("ReactorClient undo and redo on base-reducer 3", () => {
  it("undoes, redoes and undoes with RETRACTs the author signs", async () => {
    await build();
    const id = await createDocument(createBaseReducer3Document());
    await add(id, "a");
    await add(id, "b");
    const [, b] = await stream(id);

    expect(await client.undoRedoAvailability(id)).toEqual({
      canUndo: true,
      canRedo: false,
    });

    await client.undo(id);

    const undone = (await stream(id)).at(-1)!;
    expect(undone.action.type).toBe("RETRACT");
    expect(undone.action.input).toEqual({ target: b.action.id });
    expect(undone.action.context?.signer?.app.key).toBe(author.did);
    expect(
      await verifyActionSignature(
        undone.action,
        { documentId: id, branch: "main" },
        "load",
        undone,
      ),
    ).toEqual({ ok: true, scheme: "v2" });
    expect(await moduleIds(id)).toEqual(["a"]);
    expect(await client.undoRedoAvailability(id)).toEqual({
      canUndo: true,
      canRedo: true,
    });

    await client.redo(id);

    const redone = (await stream(id)).at(-1)!;
    expect(redone.action.input).toEqual({ target: undone.action.id });
    expect(redone.action.context?.signer?.app.key).toBe(author.did);
    expect(await moduleIds(id)).toEqual(["a", "b"]);

    await client.undo(id);

    expect((await stream(id)).at(-1)!.action.input).toEqual({
      target: b.action.id,
    });
    expect(await moduleIds(id)).toEqual(["a"]);
  });

  it("refuses an undo with nothing to undo", async () => {
    await build();
    const id = await createDocument(createBaseReducer3Document());

    expect(await client.undoRedoAvailability(id)).toEqual({
      canUndo: false,
      canRedo: false,
    });
    await expect(client.undo(id)).rejects.toThrow(
      "Cannot undo: nothing to undo in scope history",
    );
    expect(await stream(id)).toEqual([]);
  });

  it("refuses a redo once new content follows the undo", async () => {
    await build();
    const id = await createDocument(createBaseReducer3Document());
    await add(id, "a");
    await add(id, "b");
    await client.undo(id);
    await add(id, "c");

    expect((await client.undoRedoAvailability(id)).canRedo).toBe(false);
    await expect(client.redo(id)).rejects.toThrow(
      "Cannot redo: nothing to redo in scope history",
    );
    expect(await moduleIds(id)).toEqual(["a", "c"]);
  });

  it("skips a row that threw when choosing what to undo", async () => {
    await build();
    const id = await createDocument(createBaseReducer3Document());
    await add(id, "a");
    await add(id, "b");
    await add(id, "a");
    const [, b, threw] = await stream(id);
    expect(threw.error).toContain("already exists");

    await client.undo(id);

    expect((await stream(id)).at(-1)!.action.input).toEqual({
      target: b.action.id,
    });
    expect(await moduleIds(id)).toEqual(["a"]);
  });

  it("derives from the state an upgrade installed, not the current state", async () => {
    await build([itemsV1, itemsV2]);
    const id = await createDocument(
      withBaseReducer3(createItemsDocument(["b"]), "legacy"),
    );
    await client.execute(id, "main", [addItem("a")]);
    const { header } = await client.get(id);
    await client.execute(id, "main", [
      upgradeDocumentAction({
        documentId: id,
        model: ITEMS_TYPE,
        fromVersion: 1,
        toVersion: 2,
        revision: { ...header.revision },
        initialState: { global: { items: [] }, local: {} },
      }),
    ]);
    await client.execute(id, "main", [addItem("b")]);
    const b = (await stream(id)).at(-1)!;
    expect(await items(id)).toEqual(["b"]);

    await client.undo(id);

    expect((await stream(id)).at(-1)!.action.input).toEqual({
      target: b.action.id,
    });
  });
});

describe.each([1, 2] as const)(
  "ReactorClient on base-reducer %i",
  (version) => {
    it("submits UNDO and REDO", async () => {
      await build();
      const id = await createDocument(
        createDocModelDocument({
          protocolVersions: { "base-reducer": version },
        }),
      );
      await add(id, "a");
      await add(id, "b");

      expect(await client.undoRedoAvailability(id)).toEqual({
        canUndo: true,
        canRedo: false,
      });

      const submitted: Action[] = [];
      const execute = reactor.execute.bind(reactor);
      reactor.execute = (documentId, branch, actions, signal) => {
        submitted.push(...actions);
        return execute(documentId, branch, actions, signal);
      };

      await client.undo(id);
      await client.redo(id).catch(() => undefined);

      expect(submitted.map((action) => action.type)).toEqual(["UNDO", "REDO"]);
      const undone = (await stream(id)).find(
        (operation) =>
          operation.action.id === synthesizedActionId(submitted[0].id),
      );
      expect(undone?.action.type).toBe("NOOP");
    });
  },
);

const ITEMS_TYPE = "test/undo-items";

type ItemsState = PHBaseState & { global: { items: string[] }; local: object };

function itemsStateReducer(state: PHBaseState, action: Action): PHBaseState {
  const typed = state as ItemsState;
  if (action.type !== "ADD_ITEM") return state;
  const item = (action.input as { id: string }).id;
  if (typed.global.items.includes(item)) {
    throw new Error(`Item "${item}" already exists`);
  }
  const next: ItemsState = {
    ...typed,
    global: { items: [...typed.global.items, item] },
  };
  return next;
}

function itemsState(items: string[], version: number): ItemsState {
  return {
    global: { items },
    local: {},
    auth: { version: 0, grants: [] },
    document: { version, hash: { algorithm: "sha256", encoding: "hex" } },
  } as unknown as ItemsState;
}

function createItemsDocument(items: string[] = []): PHDocument {
  const header = createPresignedHeader(generateId(), ITEMS_TYPE);
  return {
    header,
    state: itemsState(items, 1),
    initialState: itemsState(items, 1),
    operations: { global: [], local: [] },
    clipboard: [],
  } as unknown as PHDocument;
}

function itemsModule(version: number): DocumentModelModule {
  return {
    version,
    reducer: createReducer(itemsStateReducer),
    actions: {},
    utils: {
      createDocument: () => createItemsDocument(),
      createState: () => itemsState([], version),
    },
    documentModel: {
      global: {
        id: ITEMS_TYPE,
        name: "Undo items",
        description: "",
        extension: "uit",
        author: { name: "Test", website: "" },
        specifications: [{ version, changeLog: [] }],
      },
      local: {},
    },
  } as unknown as DocumentModelModule;
}

const itemsV1 = itemsModule(1);
const itemsV2 = itemsModule(2);

const itemsManifest = {
  documentType: ITEMS_TYPE,
  latestVersion: 2,
  supportedVersions: [1, 2],
  upgrades: {
    v2: { toVersion: 2, upgradeReducer: (document: PHDocument) => document },
  },
} as unknown as UpgradeManifest<readonly number[]>;

function addItem(id: string): Action {
  return {
    id: generateId(),
    type: "ADD_ITEM",
    scope: "global",
    timestampUtcMs: new Date().toISOString(),
    input: { id },
  };
}

async function items(id: string): Promise<string[]> {
  const document = await client.get(id);
  return (document.state as unknown as ItemsState).global.items;
}
