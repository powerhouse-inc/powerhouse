import type { SubgraphArgs } from "@powerhousedao/reactor-api";
import { testSetupReactor } from "@powerhousedao/reactor-api/test";
import {
  documentModelDocumentModelModule,
  type DocumentModelModule,
  type DocumentModelPHState,
} from "document-model";
import { beforeEach, describe, expect, it } from "vitest";
import { DocumentModelSubgraphLegacy } from "../src/graphql/document-model-subgraph.js";
import type { Context } from "../src/graphql/types.js";

/**
 * Integration tests for DocumentModelSubgraphLegacy.
 *
 * These tests verify that the document-model subgraph mutations work correctly
 * through the GraphQL API layer, making it easier to detect regressions when
 * updating the document-model spec.
 */
describe("DocumentModelSubgraph Integration Tests", () => {
  let reactor: Awaited<ReturnType<typeof testSetupReactor>>["reactor"];
  let subgraph: DocumentModelSubgraphLegacy;

  // Helper to create context with admin access (bypass permission checks)
  const createAdminContext = (): Context =>
    ({
      user: { address: "0xadmin" },
      isAdmin: () => true,
      isUser: () => false,
      isGuest: () => false,
    }) as unknown as Context;

  beforeEach(async () => {
    const setup = await testSetupReactor();
    reactor = setup.reactor;

    // Create subgraph instance
    subgraph = new DocumentModelSubgraphLegacy(
      documentModelDocumentModelModule as unknown as DocumentModelModule,
      {
        reactor,
        reactorClient: undefined,
        documentPermissionService: undefined,
        relationalDb: {} as SubgraphArgs["relationalDb"],
        graphqlManager: {} as SubgraphArgs["graphqlManager"],
        syncManager: {} as SubgraphArgs["syncManager"],
        analyticsStore: {} as SubgraphArgs["analyticsStore"],
      } as unknown as SubgraphArgs,
    );
  });

  // Note: reactor cleanup is not needed for testSetupReactor

  // Helper to get mutation resolver
  const getMutation = (name: string) =>
    (subgraph.resolvers.Mutation as Record<string, unknown>)?.[name] as (
      parent: unknown,
      args: Record<string, unknown>,
      ctx: Context,
    ) => Promise<unknown>;

  // Helper to get query resolver
  const getQuery = () =>
    (subgraph.resolvers.Query as Record<string, unknown>)
      ?.DocumentModel as unknown as (
      parent: unknown,
      args: Record<string, unknown>,
      ctx: Context,
    ) => {
      getDocument: (args: { docId: string }) => Promise<unknown>;
    };

  // Helper to get typed document state
  const getDocumentState = async (docId: string) => {
    const doc = await reactor.getDocument(docId);
    return (doc.state as DocumentModelPHState).global;
  };

  describe("createDocument mutation", () => {
    it("should create a new document-model document", async () => {
      const ctx = createAdminContext();
      const createDocument = getMutation("DocumentModel_createDocument");

      const docId = await createDocument(null, { name: "TestModel" }, ctx);

      expect(docId).toBeDefined();
      expect(typeof docId).toBe("string");

      // Verify document was created
      const doc = await reactor.getDocument(docId as string);
      expect(doc).toBeDefined();
      expect(doc.header.documentType).toBe("powerhouse/document-model");
    });
  });

  describe("model metadata mutations", () => {
    let docId: string;
    const ctx = createAdminContext();

    beforeEach(async () => {
      const createDocument = getMutation("DocumentModel_createDocument");
      docId = (await createDocument(
        null,
        { name: "TestModel" },
        ctx,
      )) as string;
    });

    it("should set model name", async () => {
      const setModelName = getMutation("DocumentModel_setModelName");

      const operationIndex = await setModelName(
        null,
        { docId, input: { name: "MyCustomModel" } },
        ctx,
      );

      expect(operationIndex).toBeGreaterThanOrEqual(0);

      const state = await getDocumentState(docId);
      expect(state.name).toBe("MyCustomModel");
    });

    it("should set model ID", async () => {
      const setModelId = getMutation("DocumentModel_setModelId");

      const operationIndex = await setModelId(
        null,
        { docId, input: { id: "acme/my-model" } },
        ctx,
      );

      expect(operationIndex).toBeGreaterThanOrEqual(0);

      const state = await getDocumentState(docId);
      expect(state.id).toBe("acme/my-model");
    });

    it("should set model description", async () => {
      const setModelDescription = getMutation(
        "DocumentModel_setModelDescription",
      );

      const operationIndex = await setModelDescription(
        null,
        {
          docId,
          input: { description: "A custom document model for testing" },
        },
        ctx,
      );

      expect(operationIndex).toBeGreaterThanOrEqual(0);

      const state = await getDocumentState(docId);
      expect(state.description).toBe("A custom document model for testing");
    });

    it("should set model extension", async () => {
      const setModelExtension = getMutation("DocumentModel_setModelExtension");

      const operationIndex = await setModelExtension(
        null,
        { docId, input: { extension: "acm" } },
        ctx,
      );

      expect(operationIndex).toBeGreaterThanOrEqual(0);

      const state = await getDocumentState(docId);
      expect(state.extension).toBe("acm");
    });

    it("should set author name", async () => {
      const setAuthorName = getMutation("DocumentModel_setAuthorName");

      const operationIndex = await setAuthorName(
        null,
        { docId, input: { authorName: "ACME Corp" } },
        ctx,
      );

      expect(operationIndex).toBeGreaterThanOrEqual(0);

      const state = await getDocumentState(docId);
      expect(state.author.name).toBe("ACME Corp");
    });

    it("should set author website", async () => {
      const setAuthorWebsite = getMutation("DocumentModel_setAuthorWebsite");

      const operationIndex = await setAuthorWebsite(
        null,
        { docId, input: { authorWebsite: "https://acme.com" } },
        ctx,
      );

      expect(operationIndex).toBeGreaterThanOrEqual(0);

      const state = await getDocumentState(docId);
      expect(state.author.website).toBe("https://acme.com");
    });
  });

  describe("module mutations", () => {
    let docId: string;
    const ctx = createAdminContext();

    beforeEach(async () => {
      const createDocument = getMutation("DocumentModel_createDocument");
      docId = (await createDocument(
        null,
        { name: "TestModel" },
        ctx,
      )) as string;
    });

    it("should add a module", async () => {
      const addModule = getMutation("DocumentModel_addModule");

      const operationIndex = await addModule(
        null,
        { docId, input: { id: "module-1", name: "CoreModule" } },
        ctx,
      );

      expect(operationIndex).toBeGreaterThanOrEqual(0);

      const state = await getDocumentState(docId);
      const modules = state.specifications[0]?.modules;
      expect(modules).toHaveLength(1);
      expect(modules[0].name).toBe("CoreModule");
      expect(modules[0].id).toBe("module-1");
    });

    it("should set module name", async () => {
      const addModule = getMutation("DocumentModel_addModule");
      await addModule(
        null,
        { docId, input: { id: "module-1", name: "OldName" } },
        ctx,
      );

      const setModuleName = getMutation("DocumentModel_setModuleName");
      const operationIndex = await setModuleName(
        null,
        { docId, input: { id: "module-1", name: "NewModuleName" } },
        ctx,
      );

      expect(operationIndex).toBeGreaterThanOrEqual(0);

      const state = await getDocumentState(docId);
      expect(state.specifications[0]?.modules[0].name).toBe("NewModuleName");
    });

    it("should set module description", async () => {
      const addModule = getMutation("DocumentModel_addModule");
      await addModule(
        null,
        { docId, input: { id: "module-1", name: "CoreModule" } },
        ctx,
      );

      const setModuleDescription = getMutation(
        "DocumentModel_setModuleDescription",
      );
      const operationIndex = await setModuleDescription(
        null,
        { docId, input: { id: "module-1", description: "Core functionality" } },
        ctx,
      );

      expect(operationIndex).toBeGreaterThanOrEqual(0);

      const state = await getDocumentState(docId);
      expect(state.specifications[0]?.modules[0].description).toBe(
        "Core functionality",
      );
    });

    it("should delete a module", async () => {
      const addModule = getMutation("DocumentModel_addModule");
      await addModule(
        null,
        { docId, input: { id: "module-1", name: "ToDelete" } },
        ctx,
      );

      const deleteModule = getMutation("DocumentModel_deleteModule");
      const operationIndex = await deleteModule(
        null,
        { docId, input: { id: "module-1" } },
        ctx,
      );

      expect(operationIndex).toBeGreaterThanOrEqual(0);

      const state = await getDocumentState(docId);
      expect(state.specifications[0]?.modules).toHaveLength(0);
    });
  });

  describe("operation mutations", () => {
    let docId: string;
    const ctx = createAdminContext();

    beforeEach(async () => {
      const createDocument = getMutation("DocumentModel_createDocument");
      docId = (await createDocument(
        null,
        { name: "TestModel" },
        ctx,
      )) as string;

      const addModule = getMutation("DocumentModel_addModule");
      await addModule(
        null,
        { docId, input: { id: "module-1", name: "CoreModule" } },
        ctx,
      );
    });

    it("should add an operation", async () => {
      const addOperation = getMutation("DocumentModel_addOperation");

      const operationIndex = await addOperation(
        null,
        {
          docId,
          input: {
            moduleId: "module-1",
            id: "op-1",
            name: "SET_VALUE",
          },
        },
        ctx,
      );

      expect(operationIndex).toBeGreaterThanOrEqual(0);

      const state = await getDocumentState(docId);
      const operations = state.specifications[0]?.modules[0].operations;
      expect(operations).toHaveLength(1);
      expect(operations[0].name).toBe("SET_VALUE");
    });

    it("should add an operation with schema", async () => {
      const addOperation = getMutation("DocumentModel_addOperation");

      const operationIndex = await addOperation(
        null,
        {
          docId,
          input: {
            moduleId: "module-1",
            id: "op-1",
            name: "SET_VALUE",
            schema: "input SetValueInput { value: String! }",
          },
        },
        ctx,
      );

      expect(operationIndex).toBeGreaterThanOrEqual(0);

      const state = await getDocumentState(docId);
      const operations = state.specifications[0]?.modules[0].operations;
      expect(operations[0].schema).toBe(
        "input SetValueInput { value: String! }",
      );
    });

    it("should add an operation with scope", async () => {
      const addOperation = getMutation("DocumentModel_addOperation");

      const operationIndex = await addOperation(
        null,
        {
          docId,
          input: {
            moduleId: "module-1",
            id: "op-1",
            name: "SET_LOCAL_VALUE",
            scope: "local",
          },
        },
        ctx,
      );

      expect(operationIndex).toBeGreaterThanOrEqual(0);

      const state = await getDocumentState(docId);
      const operations = state.specifications[0]?.modules[0].operations;
      expect(operations[0].scope).toBe("local");
    });

    it("should set operation name", async () => {
      const addOperation = getMutation("DocumentModel_addOperation");
      await addOperation(
        null,
        {
          docId,
          input: { moduleId: "module-1", id: "op-1", name: "OLD_NAME" },
        },
        ctx,
      );

      const setOperationName = getMutation("DocumentModel_setOperationName");
      const operationIndex = await setOperationName(
        null,
        { docId, input: { id: "op-1", name: "NEW_NAME" } },
        ctx,
      );

      expect(operationIndex).toBeGreaterThanOrEqual(0);

      const state = await getDocumentState(docId);
      expect(state.specifications[0]?.modules[0].operations[0].name).toBe(
        "NEW_NAME",
      );
    });

    it("should set operation schema", async () => {
      const addOperation = getMutation("DocumentModel_addOperation");
      await addOperation(
        null,
        {
          docId,
          input: { moduleId: "module-1", id: "op-1", name: "SET_VALUE" },
        },
        ctx,
      );

      const setOperationSchema = getMutation(
        "DocumentModel_setOperationSchema",
      );
      const operationIndex = await setOperationSchema(
        null,
        {
          docId,
          input: {
            id: "op-1",
            schema: "input SetValueInput { value: Int! }",
          },
        },
        ctx,
      );

      expect(operationIndex).toBeGreaterThanOrEqual(0);

      const state = await getDocumentState(docId);
      expect(state.specifications[0]?.modules[0].operations[0].schema).toBe(
        "input SetValueInput { value: Int! }",
      );
    });

    it("should set operation scope", async () => {
      const addOperation = getMutation("DocumentModel_addOperation");
      await addOperation(
        null,
        {
          docId,
          input: { moduleId: "module-1", id: "op-1", name: "SET_VALUE" },
        },
        ctx,
      );

      const setOperationScope = getMutation("DocumentModel_setOperationScope");
      const operationIndex = await setOperationScope(
        null,
        { docId, input: { id: "op-1", scope: "local" } },
        ctx,
      );

      expect(operationIndex).toBeGreaterThanOrEqual(0);

      const state = await getDocumentState(docId);
      expect(state.specifications[0]?.modules[0].operations[0].scope).toBe(
        "local",
      );
    });

    it("should set operation description", async () => {
      const addOperation = getMutation("DocumentModel_addOperation");
      await addOperation(
        null,
        {
          docId,
          input: { moduleId: "module-1", id: "op-1", name: "SET_VALUE" },
        },
        ctx,
      );

      const setOperationDescription = getMutation(
        "DocumentModel_setOperationDescription",
      );
      const operationIndex = await setOperationDescription(
        null,
        { docId, input: { id: "op-1", description: "Sets the value" } },
        ctx,
      );

      expect(operationIndex).toBeGreaterThanOrEqual(0);

      const state = await getDocumentState(docId);
      expect(
        state.specifications[0]?.modules[0].operations[0].description,
      ).toBe("Sets the value");
    });

    it("should delete an operation", async () => {
      const addOperation = getMutation("DocumentModel_addOperation");
      await addOperation(
        null,
        {
          docId,
          input: { moduleId: "module-1", id: "op-1", name: "TO_DELETE" },
        },
        ctx,
      );

      const deleteOperation = getMutation("DocumentModel_deleteOperation");
      const operationIndex = await deleteOperation(
        null,
        { docId, input: { id: "op-1" } },
        ctx,
      );

      expect(operationIndex).toBeGreaterThanOrEqual(0);

      const state = await getDocumentState(docId);
      expect(state.specifications[0]?.modules[0].operations).toHaveLength(0);
    });
  });

  describe("state schema mutations", () => {
    let docId: string;
    const ctx = createAdminContext();

    beforeEach(async () => {
      const createDocument = getMutation("DocumentModel_createDocument");
      docId = (await createDocument(
        null,
        { name: "TestModel" },
        ctx,
      )) as string;
    });

    it("should set state schema for global scope", async () => {
      const setStateSchema = getMutation("DocumentModel_setStateSchema");

      const operationIndex = await setStateSchema(
        null,
        {
          docId,
          input: {
            scope: "global",
            schema: "type State { count: Int! }",
          },
        },
        ctx,
      );

      expect(operationIndex).toBeGreaterThanOrEqual(0);

      const state = await getDocumentState(docId);
      expect(state.specifications[0]?.state.global.schema).toBe(
        "type State { count: Int! }",
      );
    });

    it("should set state schema for local scope", async () => {
      const setStateSchema = getMutation("DocumentModel_setStateSchema");

      const operationIndex = await setStateSchema(
        null,
        {
          docId,
          input: {
            scope: "local",
            schema: "type LocalState { preferences: String }",
          },
        },
        ctx,
      );

      expect(operationIndex).toBeGreaterThanOrEqual(0);

      const state = await getDocumentState(docId);
      expect(state.specifications[0]?.state.local.schema).toBe(
        "type LocalState { preferences: String }",
      );
    });

    it("should set initial state", async () => {
      const setInitialState = getMutation("DocumentModel_setInitialState");

      const operationIndex = await setInitialState(
        null,
        {
          docId,
          input: {
            scope: "global",
            initialValue: '{ "count": 0 }',
          },
        },
        ctx,
      );

      expect(operationIndex).toBeGreaterThanOrEqual(0);

      const state = await getDocumentState(docId);
      expect(state.specifications[0]?.state.global.initialValue).toBe(
        '{ "count": 0 }',
      );
    });
  });

  describe("complete document model workflow", () => {
    it("should create a complete document model with all components", async () => {
      const ctx = createAdminContext();

      // 1. Create document
      const createDocument = getMutation("DocumentModel_createDocument");
      const docId = (await createDocument(
        null,
        { name: "Counter" },
        ctx,
      )) as string;

      // 2. Set model metadata
      const setModelName = getMutation("DocumentModel_setModelName");
      await setModelName(null, { docId, input: { name: "Counter" } }, ctx);

      const setModelId = getMutation("DocumentModel_setModelId");
      await setModelId(null, { docId, input: { id: "acme/counter" } }, ctx);

      const setModelDescription = getMutation(
        "DocumentModel_setModelDescription",
      );
      await setModelDescription(
        null,
        { docId, input: { description: "A simple counter document model" } },
        ctx,
      );

      const setModelExtension = getMutation("DocumentModel_setModelExtension");
      await setModelExtension(
        null,
        { docId, input: { extension: "cnt" } },
        ctx,
      );

      const setAuthorName = getMutation("DocumentModel_setAuthorName");
      await setAuthorName(
        null,
        { docId, input: { authorName: "ACME Corp" } },
        ctx,
      );

      // 3. Set state schema
      const setStateSchema = getMutation("DocumentModel_setStateSchema");
      await setStateSchema(
        null,
        {
          docId,
          input: {
            scope: "global",
            schema: "type CounterState { count: Int! }",
          },
        },
        ctx,
      );

      const setInitialState = getMutation("DocumentModel_setInitialState");
      await setInitialState(
        null,
        {
          docId,
          input: {
            scope: "global",
            initialValue: '{ "count": 0 }',
          },
        },
        ctx,
      );

      // 4. Add module
      const addModule = getMutation("DocumentModel_addModule");
      await addModule(
        null,
        {
          docId,
          input: {
            id: "counter-module",
            name: "Counter",
            description: "Counter operations",
          },
        },
        ctx,
      );

      // 5. Add operations
      const addOperation = getMutation("DocumentModel_addOperation");
      await addOperation(
        null,
        {
          docId,
          input: {
            moduleId: "counter-module",
            id: "increment-op",
            name: "INCREMENT",
            schema: "input IncrementInput { amount: Int }",
            description: "Increments the counter",
            scope: "global",
          },
        },
        ctx,
      );

      await addOperation(
        null,
        {
          docId,
          input: {
            moduleId: "counter-module",
            id: "decrement-op",
            name: "DECREMENT",
            schema: "input DecrementInput { amount: Int }",
            description: "Decrements the counter",
            scope: "global",
          },
        },
        ctx,
      );

      await addOperation(
        null,
        {
          docId,
          input: {
            moduleId: "counter-module",
            id: "reset-op",
            name: "RESET",
            description: "Resets the counter to zero",
            scope: "global",
          },
        },
        ctx,
      );

      // Verify the complete document model
      const state = await getDocumentState(docId);

      expect(state.id).toBe("acme/counter");
      expect(state.name).toBe("Counter");
      expect(state.description).toBe("A simple counter document model");
      expect(state.extension).toBe("cnt");
      expect(state.author.name).toBe("ACME Corp");

      const spec = state.specifications[0];
      expect(spec.state.global.schema).toBe(
        "type CounterState { count: Int! }",
      );
      expect(spec.state.global.initialValue).toBe('{ "count": 0 }');

      expect(spec.modules).toHaveLength(1);
      expect(spec.modules[0].name).toBe("Counter");
      expect(spec.modules[0].operations).toHaveLength(3);

      const operationNames = spec.modules[0].operations.map((op) => op.name);
      expect(operationNames).toContain("INCREMENT");
      expect(operationNames).toContain("DECREMENT");
      expect(operationNames).toContain("RESET");
    });
  });

  describe("query resolvers", () => {
    it("should get a document by ID", async () => {
      const ctx = createAdminContext();

      // Create document
      const createDocument = getMutation("DocumentModel_createDocument");
      const docId = (await createDocument(
        null,
        { name: "QueryTest" },
        ctx,
      )) as string;

      // Get document through query
      const queryResolver = getQuery();
      const queryObject = queryResolver(null, {}, ctx);
      const result = await queryObject.getDocument({ docId });

      expect(result).toBeDefined();
      expect((result as { id: string }).id).toBe(docId);
    });
  });
});
