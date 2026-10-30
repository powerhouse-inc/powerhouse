import type {
  Action,
  ActionSigner,
  DocumentModelDocument,
  DocumentModelModule,
  Operation,
  PeerCapability,
  PHBaseState,
  PHDocument,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import {
  addModule,
  createPresignedHeader,
  createReducer,
  generateActionId,
  generateId,
  retract,
  synthesizedActionId,
  withSignaturePolicy,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it } from "vitest";
import { upgradeDocumentAction } from "../../src/actions/index.js";
import type { IReactorClient } from "../../src/client/types.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { IReactor } from "../../src/core/types.js";
import type { IReadGate } from "../../src/decision/read-gate.js";
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

async function build(
  modules: DocumentModelModule<any>[] = [],
  manifests: UpgradeManifest<readonly number[]>[] = [itemsManifest],
  readGate?: IReadGate,
): Promise<void> {
  author = await TestP256Signer.create();
  reactorKey = await TestP256Signer.create();
  const builder = createUndoV3ReactorBuilder({ modules })
    .withExecutorConfig({ signatureVerification: "enforce" })
    .withSigner(reactorKey.asISigner([], REACTOR_USER));
  if (modules.length > 0) {
    builder.withUpgradeManifests(manifests);
  }
  const clientBuilder = new ReactorClientBuilder()
    .withReactorBuilder(builder)
    .withSigner(author.asISigner([]));
  if (readGate) {
    clientBuilder.withReadGate(readGate);
  }
  client = await clientBuilder.build();
  reactor = (client as unknown as { reactor: IReactor }).reactor;
}

async function createDocument(document: PHDocument): Promise<string> {
  await client.create(document);
  const id = document.header.id;
  expect(await storedBaseReducer(id)).toBe(
    document.header.protocolVersions?.["base-reducer"],
  );
  return id;
}

/** The base-reducer number the stored header carries, not the create input's. */
async function storedBaseReducer(id: string): Promise<number | undefined> {
  return (await reactor.get(id)).header.protocolVersions?.["base-reducer"];
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

  it("resolves nothing in a scope the subject may not read", async () => {
    const gate: IReadGate = {
      scopePredicate: () => Promise.resolve((scope) => scope !== "global"),
    };
    await build([], [], gate);
    const id = await createDocument(createBaseReducer3Document());
    await add(id, "a");
    let resolved = 0;
    const resolve = reactor.resolveUndoRedo.bind(reactor);
    reactor.resolveUndoRedo = (...args) => {
      resolved++;
      return resolve(...args);
    };

    expect(await client.undoRedoAvailability(id)).toEqual({
      canUndo: false,
      canRedo: false,
    });
    await expect(client.undo(id)).rejects.toThrow(
      "Cannot undo: nothing to undo in scope history",
    );
    expect(await client.undoRedoTargets(id)).toEqual({});
    expect(resolved).toBe(0);
    expect(await stream(id)).toHaveLength(1);
  });

  it.each(["auth", "document"])(
    "resolves nothing in the %s scope, which the rule does not derive",
    async (scope) => {
      await build();
      const id = await createDocument(createBaseReducer3Document());
      await add(id, "a");
      const [a] = await stream(id);

      expect(await reactor.resolveUndoRedo(id, scope)).toEqual({});
      expect(await client.undoRedoTargets(id, scope)).toEqual({});
      expect(await client.undoRedoAvailability(id, scope)).toEqual({
        canUndo: false,
        canRedo: false,
      });
      await expect(client.undo(id, scope)).rejects.toThrow(
        "Cannot undo: nothing to undo in scope history",
      );
      expect(await client.undoRedoTargets(id)).toEqual({
        undoTarget: a.action.id,
      });
    },
  );

  it("resolves targets for the subject the view names, through the read gate", async () => {
    const gate: IReadGate = {
      scopePredicate: (_document, subject) =>
        Promise.resolve(
          (scope) => scope !== "global" || subject.address === "0xreader",
        ),
    };
    await build([], [], gate);
    const id = await createDocument(createBaseReducer3Document());
    await add(id, "a");
    const [row] = await stream(id);

    expect(
      await client.undoRedoTargets(id, "global", {
        subject: { address: "0xreader" },
      }),
    ).toEqual({ undoTarget: row.action.id });
    expect(
      await client.undoRedoTargets(id, "global", {
        subject: { address: "0xother" },
      }),
    ).toEqual({});
  });

  it("runs an undo and a redo issued together in call order", async () => {
    await build();
    const id = await createDocument(createBaseReducer3Document());
    await add(id, "a");
    await add(id, "b");
    await client.undo(id);

    await Promise.all([client.undo(id), client.redo(id)]);

    expect(await moduleIds(id)).toEqual(["a"]);
  });

  it("applies both of two undos issued together", async () => {
    await build();
    const id = await createDocument(createBaseReducer3Document());
    await add(id, "a");
    await add(id, "b");

    await Promise.all([client.undo(id), client.undo(id)]);

    expect(await moduleIds(id)).toEqual([]);
  });

  it("applies RETRACTs batched in one write, and RETRACTs of them", async () => {
    await build();
    const id = await createDocument(createBaseReducer3Document());
    await add(id, "a");
    await add(id, "b");
    await add(id, "c");
    const [, b, c] = await stream(id);
    const undo = [retract(b.action.id), retract(c.action.id)];

    await client.execute(id, "main", undo);

    expect(await moduleIds(id)).toEqual(["a"]);
    expect(
      (await stream(id)).slice(3).map((operation) => operation.action.id),
    ).toEqual(undo.map((action) => action.id));

    await client.execute(id, "main", [
      retract(undo[0].id),
      retract(undo[1].id),
    ]);

    expect(await moduleIds(id)).toEqual(["a", "b", "c"]);

    await client.undo(id);

    expect((await stream(id)).at(-1)!.action.input).toEqual({
      target: c.action.id,
    });
    expect(await moduleIds(id)).toEqual(["a", "b"]);
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
    expect(await items(id)).toEqual([]);
  });

  it("derives across an upgrade transition that carries no snapshot", async () => {
    const migratingV1 = itemsModule(1, MIGRATING_TYPE);
    const migratingV2 = itemsModule(2, MIGRATING_TYPE);
    await build([migratingV1, migratingV2], [migratingManifest]);
    const id = await createDocument(
      withBaseReducer3(createItemsDocument([], MIGRATING_TYPE), "legacy"),
    );
    await client.execute(id, "main", [addItem("a")]);
    const a = (await stream(id)).at(-1)!;
    const { header } = await client.get(id);
    await client.execute(id, "main", [
      upgradeDocumentAction({
        documentId: id,
        model: MIGRATING_TYPE,
        fromVersion: 1,
        toVersion: 2,
        revision: { ...header.revision },
      }),
    ]);
    // The transition installed "b", so this row throws.
    await client.execute(id, "main", [addItem("b")]);
    expect((await stream(id)).at(-1)!.error).toContain("already exists");
    expect(await items(id)).toEqual(["a", "b"]);

    expect(await client.undoRedoAvailability(id)).toEqual({
      canUndo: true,
      canRedo: false,
    });
    await client.undo(id);

    expect((await stream(id)).at(-1)!.action.input).toEqual({
      target: a.action.id,
    });
    expect(await items(id)).toEqual(["b"]);
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
          operation.action.id ===
          synthesizedActionId(submitted[0].id, "hashed"),
      );
      expect(undone?.action.type).toBe("NOOP");
    });

    it("resolves no undo targets", async () => {
      await build();
      const id = await createDocument(
        createDocModelDocument({
          protocolVersions: { "base-reducer": version },
        }),
      );
      await add(id, "a");
      await add(id, "b");
      await client.undo(id);

      expect(await reactor.resolveUndoRedo(id, "global")).toEqual({});
      expect(await client.undoRedoTargets(id)).toEqual({});
    });

    it("resolves no undo targets for a model createReducer did not tag", async () => {
      await build([untagged(itemsV1)], []);
      const id = await createDocument(
        withSignaturePolicy(createItemsDocument(), "legacy", {
          protocolVersions: { "base-reducer": version },
        }),
      );
      await client.execute(id, "main", [addItem("a")]);

      expect(await reactor.resolveUndoRedo(id, "global")).toEqual({});
      expect(await client.undoRedoTargets(id)).toEqual({});
      expect(await client.undoRedoAvailability(id)).toEqual({
        canUndo: true,
        canRedo: false,
      });
    });

    it("reports nothing in a scope the subject may not read", async () => {
      const gate: IReadGate = {
        scopePredicate: () => Promise.resolve((scope) => scope !== "global"),
      };
      await build([], [], gate);
      const id = await createDocument(
        createDocModelDocument({
          protocolVersions: { "base-reducer": version },
        }),
      );
      await add(id, "a");

      expect(await client.undoRedoAvailability(id)).toEqual({
        canUndo: false,
        canRedo: false,
      });
    });
  },
);

describe("ReactorClient on a base-reducer number it does not know", () => {
  function baseReducerSupporting(versions: number[]): PeerCapability {
    return {
      kind: "protocol",
      name: "base-reducer",
      baseline: [1, 2],
      supported: () => versions,
      preferred: () => 2,
      optional: false,
    };
  }

  it.each([
    { undoV3: true, supported: [1, 2, 3, 7], submits: "RETRACT" },
    { undoV3: false, supported: [1, 2, 7], submits: "UNDO" },
  ])(
    "undoes as the highest version the reactor runs (undoV3 $undoV3)",
    async ({ undoV3, supported, submits }) => {
      author = await TestP256Signer.create();
      client = await new ReactorClientBuilder()
        .withReactorBuilder(
          new ReactorBuilder()
            .withDocumentModelSources([
              documentModelDocumentModelModule as never,
            ])
            .withExecutorConfig({ featureFlags: { undoV3 } })
            .withPeerCapabilities([baseReducerSupporting(supported)]),
        )
        .withSigner(author.asISigner([]))
        .build();
      reactor = (client as unknown as { reactor: IReactor }).reactor;
      const id = await createDocument(
        createDocModelDocument({
          protocolVersions: { "base-reducer": 7, signature: 2 },
        }),
      );
      await add(id, "a");
      await add(id, "b");
      const submitted: Action[] = [];
      const execute = reactor.execute.bind(reactor);
      reactor.execute = (documentId, branch, actions, signal) => {
        submitted.push(...actions);
        return execute(documentId, branch, actions, signal);
      };

      expect(await client.undoRedoAvailability(id)).toEqual({
        canUndo: true,
        canRedo: false,
      });
      await client.undo(id);

      expect(submitted.map((action) => action.type)).toEqual([submits]);
      expect(await moduleIds(id)).toEqual(["a"]);
    },
  );
});

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

function createItemsDocument(
  items: string[] = [],
  documentType = ITEMS_TYPE,
): PHDocument {
  const header = createPresignedHeader(generateId(), documentType);
  return {
    header,
    state: itemsState(items, 1),
    initialState: itemsState(items, 1),
    operations: { global: [], local: [] },
    clipboard: [],
  } as unknown as PHDocument;
}

function itemsModule(
  version: number,
  documentType = ITEMS_TYPE,
): DocumentModelModule {
  return {
    version,
    reducer: createReducer(itemsStateReducer),
    actions: {},
    utils: {
      createDocument: () => createItemsDocument([], documentType),
      createState: () => itemsState([], version),
    },
    documentModel: {
      global: {
        id: documentType,
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

/** The same model, its reducer not built by createReducer. */
function untagged(module: DocumentModelModule): DocumentModelModule {
  const reducer = module.reducer as (...args: unknown[]) => unknown;
  return {
    ...module,
    reducer: (...args: unknown[]) => reducer(...args),
  } as DocumentModelModule;
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

const MIGRATING_TYPE = "test/undo-items-migrating";

// Its v1 to v2 transition adds "b" to the items.
const migratingManifest = {
  documentType: MIGRATING_TYPE,
  latestVersion: 2,
  supportedVersions: [1, 2],
  upgrades: {
    v2: {
      toVersion: 2,
      upgradeReducer: (document: PHDocument) => {
        const state = document.state as unknown as ItemsState;
        return {
          ...document,
          state: {
            ...state,
            global: { items: [...state.global.items, "b"] },
          },
        } as unknown as PHDocument;
      },
    },
  },
} as unknown as UpgradeManifest<readonly number[]>;

function addItem(id: string): Action {
  return {
    id: generateActionId(),
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
