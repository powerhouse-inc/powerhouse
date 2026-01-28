import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  Action,
  DocumentModelModule,
  PHBaseState,
  PHDocument,
  UpgradeManifest,
} from "document-model";
import {
  createPresignedHeader,
  createReducer,
  generateId,
} from "document-model/core";
import { driveDocumentModelModule } from "document-drive";
import type { IReactorClient } from "../../src/client/types.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { IReactor, ReactorClientModule } from "../../src/core/types.js";

const VERSIONED_DOC_TYPE = "test/versioned-items";

interface ItemV1 {
  id: string;
  name: string;
}

interface ItemV2 {
  id: string;
  name: string;
  addedAt: string;
}

interface GlobalStateV1 {
  items: ItemV1[];
}

interface StateV1 extends PHBaseState {
  global: GlobalStateV1;
  local: Record<string, never>;
}

interface GlobalStateV2 {
  items: ItemV2[];
  title: string;
}

interface StateV2 extends PHBaseState {
  global: GlobalStateV2;
  local: Record<string, never>;
}

const defaultStateV1 = {
  global: { items: [] },
  local: {},
  auth: {},
  document: { version: 1, hash: { algorithm: "sha256", encoding: "hex" } },
} as StateV1;

const defaultStateV2 = {
  global: { items: [], title: "" },
  local: {},
  auth: {},
  document: { version: 2, hash: { algorithm: "sha256", encoding: "hex" } },
} as StateV2;

function v1StateReducer(state: PHBaseState, action: Action): PHBaseState {
  const typedState = state as StateV1;
  if (action.type === "ADD_ITEM") {
    const input = action.input as { id: string; name: string };
    const newState: StateV1 = {
      ...typedState,
      global: {
        ...typedState.global,
        items: [...typedState.global.items, { id: input.id, name: input.name }],
      },
    };
    return newState as PHBaseState;
  }
  return state;
}

function v2StateReducer(state: PHBaseState, action: Action): PHBaseState {
  const typedState = state as StateV2;
  if (action.type === "ADD_ITEM") {
    const input = action.input as { id: string; name: string };
    const newState: StateV2 = {
      ...typedState,
      global: {
        ...typedState.global,
        items: [
          ...typedState.global.items,
          { id: input.id, name: input.name, addedAt: new Date().toISOString() },
        ],
      },
    };
    return newState as PHBaseState;
  }
  if (action.type === "SET_TITLE") {
    const input = action.input as { title: string };
    const newState: StateV2 = {
      ...typedState,
      global: {
        ...typedState.global,
        title: input.title,
      },
    };
    return newState as PHBaseState;
  }
  return state;
}

const v1Reducer = createReducer(v1StateReducer);
const v2Reducer = createReducer(v2StateReducer);

const v1Actions = {
  addItem: (input: { id: string; name: string }): Action =>
    ({
      id: generateId(),
      type: "ADD_ITEM",
      input,
      scope: "global",
      timestampUtcMs: new Date().toISOString(),
    }) as Action,
};

const v2Actions = {
  addItem: (input: { id: string; name: string }): Action =>
    ({
      id: generateId(),
      type: "ADD_ITEM",
      input,
      scope: "global",
      timestampUtcMs: new Date().toISOString(),
    }) as Action,
  setTitle: (input: { title: string }): Action =>
    ({
      id: generateId(),
      type: "SET_TITLE",
      input,
      scope: "global",
      timestampUtcMs: new Date().toISOString(),
    }) as Action,
};

function createV1Document(): PHDocument<StateV1> {
  const id = generateId();
  const header = createPresignedHeader(id, VERSIONED_DOC_TYPE);
  return {
    header,
    state: JSON.parse(JSON.stringify(defaultStateV1)) as StateV1,
    initialState: JSON.parse(JSON.stringify(defaultStateV1)) as StateV1,
    operations: { global: [], local: [] },
    clipboard: [],
  } as unknown as PHDocument<StateV1>;
}

function createV2Document(): PHDocument<StateV2> {
  const id = generateId();
  const header = createPresignedHeader(id, VERSIONED_DOC_TYPE);
  return {
    header,
    state: JSON.parse(JSON.stringify(defaultStateV2)) as StateV2,
    initialState: JSON.parse(JSON.stringify(defaultStateV2)) as StateV2,
    operations: { global: [], local: [] },
    clipboard: [],
  } as unknown as PHDocument<StateV2>;
}

const v1Module: DocumentModelModule = {
  version: 1,
  reducer: v1Reducer,
  actions: v1Actions,
  utils: {
    createDocument: createV1Document,
    createState: () => JSON.parse(JSON.stringify(defaultStateV1)) as StateV1,
  },
  documentModel: {
    global: {
      id: VERSIONED_DOC_TYPE,
      name: "Versioned Items",
      description: "Test document for versioning",
      extension: "vit",
      author: { name: "Test", website: "" },
      specifications: [{ version: 1, changeLog: [] }],
    },
    local: {},
  },
} as unknown as DocumentModelModule;

const v2Module: DocumentModelModule = {
  version: 2,
  reducer: v2Reducer,
  actions: v2Actions,
  utils: {
    createDocument: createV2Document,
    createState: () => JSON.parse(JSON.stringify(defaultStateV2)) as StateV2,
  },
  documentModel: {
    global: {
      id: VERSIONED_DOC_TYPE,
      name: "Versioned Items",
      description: "Test document for versioning",
      extension: "vit",
      author: { name: "Test", website: "" },
      specifications: [{ version: 2, changeLog: [] }],
    },
    local: {},
  },
} as unknown as DocumentModelModule;

function upgradeV1ToV2(document: PHDocument): PHDocument {
  const stateV1 = document.state as StateV1;
  const initialStateV1 = document.initialState as StateV1;
  const migrateItems = (items: ItemV1[]): ItemV2[] =>
    items.map((item) => ({ ...item, addedAt: "" }));
  const newState: StateV2 = {
    ...stateV1,
    global: {
      items: migrateItems(stateV1.global.items),
      title: "",
    },
  };
  const newInitialState: StateV2 = {
    ...initialStateV1,
    global: {
      items: migrateItems(initialStateV1.global.items),
      title: "",
    },
  };
  return {
    ...document,
    state: newState as PHBaseState,
    initialState: newInitialState as PHBaseState,
  };
}

const upgradeManifest: UpgradeManifest<readonly [1, 2]> = {
  documentType: VERSIONED_DOC_TYPE,
  latestVersion: 2,
  supportedVersions: [1, 2] as const,
  upgrades: {
    v2: {
      toVersion: 2,
      upgradeReducer: upgradeV1ToV2,
      description: "Add title field to global state",
    },
  },
};

describe("ReactorClient Versioning Integration Tests", () => {
  let client: IReactorClient;
  let reactor: IReactor;
  let module: ReactorClientModule;

  beforeEach(async () => {
    const reactorBuilder = new ReactorBuilder()
      .withDocumentModels([driveDocumentModelModule as any, v1Module, v2Module])
      .withUpgradeManifests([
        upgradeManifest as unknown as UpgradeManifest<readonly number[]>,
      ])
      .withFeatures({ legacyStorageEnabled: false });

    module = await new ReactorClientBuilder()
      .withReactorBuilder(reactorBuilder)
      .buildModule();

    client = module.client;
    reactor = module.reactor;
  });

  afterEach(() => {
    reactor.kill();
  });

  describe("getDocumentModelModules with versions", () => {
    it("should return all registered document model modules including versions", async () => {
      const result = await client.getDocumentModelModules();

      const versionedModules = result.results.filter(
        (m) => m.documentModel.global.id === VERSIONED_DOC_TYPE,
      );
      expect(versionedModules.length).toBe(2);

      const versions = versionedModules.map((m) => m.version);
      expect(versions).toContain(1);
      expect(versions).toContain(2);
    });

    it("should have different versions for same document type", async () => {
      const result = await client.getDocumentModelModules();

      const v1 = result.results.find(
        (m) =>
          m.documentModel.global.id === VERSIONED_DOC_TYPE && m.version === 1,
      );
      const v2 = result.results.find(
        (m) =>
          m.documentModel.global.id === VERSIONED_DOC_TYPE && m.version === 2,
      );

      expect(v1).toBeDefined();
      expect(v2).toBeDefined();
      expect(v1?.version).toBe(1);
      expect(v2?.version).toBe(2);
    });
  });

  describe("create document with versioned module", () => {
    it("should create a document using v1 module via createEmpty", async () => {
      const result = await client.createEmpty(VERSIONED_DOC_TYPE, {
        documentModelVersion: 1,
      });

      expect(result.header.documentType).toBe(VERSIONED_DOC_TYPE);
      expect(result.header.id).toBeDefined();
      expect(result.state.document.version).toBe(1);
      const state = result.state as unknown as StateV1;
      expect(state.global).not.toHaveProperty("title");
    });

    it("should create a document using v2 module via createEmpty", async () => {
      const result = await client.createEmpty(VERSIONED_DOC_TYPE, {
        documentModelVersion: 2,
      });

      expect(result.header.documentType).toBe(VERSIONED_DOC_TYPE);
      expect(result.header.id).toBeDefined();
      expect(result.state.document.version).toBe(2);
      const state = result.state as unknown as StateV2;
      expect(state.global.title).toBe("");
    });
  });

  describe("execute actions on versioned documents", () => {
    it("should apply v1 actions to v1 document through client", async () => {
      const doc = await client.createEmpty(VERSIONED_DOC_TYPE, {
        documentModelVersion: 1,
      });

      const result = await client.execute(doc.header.id, "main", [
        v1Actions.addItem({ id: "1", name: "First Item" }),
      ]);

      const state = result.state as unknown as StateV1;
      expect(state.global.items.length).toBe(1);
      expect(state.global.items[0].name).toBe("First Item");
    });

    it("should apply multiple v1 actions sequentially", async () => {
      const doc = await client.createEmpty(VERSIONED_DOC_TYPE, {
        documentModelVersion: 1,
      });

      await client.execute(doc.header.id, "main", [
        v1Actions.addItem({ id: "1", name: "Item 1" }),
      ]);
      await client.execute(doc.header.id, "main", [
        v1Actions.addItem({ id: "2", name: "Item 2" }),
      ]);
      await client.execute(doc.header.id, "main", [
        v1Actions.addItem({ id: "3", name: "Item 3" }),
      ]);

      const { document: retrieved } = await client.get(doc.header.id);
      const state = retrieved.state as unknown as StateV1;
      expect(state.global.items.length).toBeGreaterThanOrEqual(3);
    });

    it("should apply v2 actions including setTitle", async () => {
      const doc = await client.createEmpty(VERSIONED_DOC_TYPE, {
        documentModelVersion: 2,
      });

      await client.execute(doc.header.id, "main", [
        v2Actions.addItem({ id: "1", name: "First Item" }),
        v2Actions.setTitle({ title: "My Items List" }),
      ]);

      const { document: retrieved } = await client.get(doc.header.id);
      const state = retrieved.state as unknown as StateV2;
      expect(state.global.title).toBe("My Items List");
      expect(state.global.items.length).toBe(1);
    });

    it("should use v2 reducer which adds timestamp to items", async () => {
      const doc = await client.createEmpty(VERSIONED_DOC_TYPE, {
        documentModelVersion: 2,
      });

      await client.execute(doc.header.id, "main", [
        v2Actions.addItem({ id: "1", name: "Test Item" }),
      ]);

      const { document: retrieved } = await client.get(doc.header.id);
      const state = retrieved.state as unknown as StateV2;

      expect(state.global.items[0]).toHaveProperty("addedAt");
      expect(typeof state.global.items[0].addedAt).toBe("string");
      expect(state.global.items[0].addedAt.length).toBeGreaterThan(0);
    });

    it("should use v1 reducer which does NOT add timestamp to items", async () => {
      const doc = await client.createEmpty(VERSIONED_DOC_TYPE, {
        documentModelVersion: 1,
      });

      await client.execute(doc.header.id, "main", [
        v1Actions.addItem({ id: "1", name: "Test Item" }),
      ]);

      const { document: retrieved } = await client.get(doc.header.id);
      const state = retrieved.state as unknown as StateV1;

      expect(state.global.items[0]).not.toHaveProperty("addedAt");
    });
  });

  describe("document retrieval after operations", () => {
    it("should retrieve document with applied operations", async () => {
      const doc = await client.createEmpty(VERSIONED_DOC_TYPE, {
        documentModelVersion: 1,
      });

      await client.execute(doc.header.id, "main", [
        v1Actions.addItem({ id: "1", name: "Test Item" }),
      ]);

      const { document: retrieved } = await client.get(doc.header.id);
      expect(retrieved.header.id).toBe(doc.header.id);

      const operations = await client.getOperations(doc.header.id);
      expect(operations.results.length).toBeGreaterThan(0);
    });

    it("should find documents by type regardless of version", async () => {
      const v1Doc = await client.createEmpty(VERSIONED_DOC_TYPE, {
        documentModelVersion: 1,
      });
      const v2Doc = await client.createEmpty(VERSIONED_DOC_TYPE, {
        documentModelVersion: 2,
      });

      const result = await client.find({ type: VERSIONED_DOC_TYPE });

      expect(result.results.length).toBe(2);
      const ids = result.results.map((doc) => doc.header.id);
      expect(ids).toContain(v1Doc.header.id);
      expect(ids).toContain(v2Doc.header.id);
    });
  });

  describe("subscription to versioned documents", () => {
    it("should subscribe to changes on versioned documents", async () => {
      const doc = await client.createEmpty(VERSIONED_DOC_TYPE, {
        documentModelVersion: 1,
      });

      const unsubscribe = client.subscribe({ ids: [doc.header.id] }, () => {
        // Callback is registered
      });

      // Verify subscription can be created and unsubscribed
      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });
  });

  describe("upgrade manifest integration", () => {
    it("should have upgrade manifest registered in reactor", () => {
      const registry = (reactor as any).documentView?.registry;
      if (registry) {
        const versions = registry.getSupportedVersions(VERSIONED_DOC_TYPE);
        expect(versions).toContain(1);
        expect(versions).toContain(2);
      }
    });
  });

  describe("delete versioned documents", () => {
    it("should delete a v1 document", async () => {
      const doc = await client.createEmpty(VERSIONED_DOC_TYPE, {
        documentModelVersion: 1,
      });

      await client.deleteDocument(doc.header.id);

      const { document: retrieved } = await client.get(doc.header.id);
      expect(
        (retrieved.state as { document?: { isDeleted?: boolean } }).document
          ?.isDeleted,
      ).toBe(true);
    });

    it("should delete a v2 document", async () => {
      const doc = await client.createEmpty(VERSIONED_DOC_TYPE, {
        documentModelVersion: 2,
      });

      await client.deleteDocument(doc.header.id);

      const { document: retrieved } = await client.get(doc.header.id);
      expect(
        (retrieved.state as { document?: { isDeleted?: boolean } }).document
          ?.isDeleted,
      ).toBe(true);
    });
  });

  describe("createEmpty with version parameter", () => {
    it("should create document at latest version by default", async () => {
      const result = await client.createEmpty(VERSIONED_DOC_TYPE);

      expect(result.header.documentType).toBe(VERSIONED_DOC_TYPE);
      expect(result.state.document.version).toBe(2);
      const state = result.state as unknown as StateV2;
      expect(state.global).toHaveProperty("title");
    });

    it("should create document at specific v1 version", async () => {
      const result = await client.createEmpty(VERSIONED_DOC_TYPE, {
        documentModelVersion: 1,
      });

      expect(result.header.documentType).toBe(VERSIONED_DOC_TYPE);
      expect(result.state.document.version).toBe(1);
      const state = result.state as unknown as StateV1;
      expect(state.global).not.toHaveProperty("title");
      expect(state.global.items).toEqual([]);
    });

    it("should create document at specific v2 version", async () => {
      const result = await client.createEmpty(VERSIONED_DOC_TYPE, {
        documentModelVersion: 2,
      });

      expect(result.header.documentType).toBe(VERSIONED_DOC_TYPE);
      expect(result.state.document.version).toBe(2);
      const state = result.state as unknown as StateV2;
      expect(state.global.title).toBe("");
      expect(state.global.items).toEqual([]);
    });

    it("should throw error for non-existent version", async () => {
      await expect(
        client.createEmpty(VERSIONED_DOC_TYPE, { documentModelVersion: 99 }),
      ).rejects.toThrow(
        `Document model not found for type: ${VERSIONED_DOC_TYPE} with version: 99`,
      );
    });

    it("should throw error for non-existent document type", async () => {
      await expect(client.createEmpty("non/existent")).rejects.toThrow(
        "Document model not found for type: non/existent",
      );
    });
  });
});
