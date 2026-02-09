import type { SubgraphArgs } from "@powerhousedao/reactor-api";
import { testSetupReactor } from "@powerhousedao/reactor-api/test";
import { driveDocumentModelModule } from "document-drive";
import type { DocumentModelModule } from "document-model";
import { print } from "graphql";
import { beforeEach, describe, expect, it } from "vitest";
import { DocumentModelSubgraph } from "../src/graphql/document-model-subgraph.js";
import {
  generateDocumentModelSchema,
  getDocumentModelSchemaName,
} from "../src/utils/create-schema.js";

/**
 * Tests for document-drive subgraph auto-generation via DocumentModelSubgraph.
 *
 * Verifies that the new DocumentModelSubgraph produces valid schemas, resolvers,
 * and union type resolvers for the document-drive document model.
 */
describe("Document-Drive Subgraph", () => {
  const driveModule =
    driveDocumentModelModule as unknown as DocumentModelModule;
  const documentName = getDocumentModelSchemaName(
    driveModule.documentModel.global,
  );

  describe("schema generation", () => {
    it("should generate a valid schema for document-drive", () => {
      expect(() =>
        generateDocumentModelSchema(driveModule.documentModel.global, {
          useNewApi: true,
        }),
      ).not.toThrow();
    });

    it("should include mutations for valid operations", () => {
      const schema = generateDocumentModelSchema(
        driveModule.documentModel.global,
        { useNewApi: true },
      );
      const printed = print(schema);

      // Node operations
      expect(printed).toContain(`${documentName}_addFile`);
      expect(printed).toContain(`${documentName}_addFolder`);
      expect(printed).toContain(`${documentName}_deleteNode`);
      expect(printed).toContain(`${documentName}_updateFile`);
      expect(printed).toContain(`${documentName}_updateNode`);
      expect(printed).toContain(`${documentName}_copyNode`);
      expect(printed).toContain(`${documentName}_moveNode`);

      // Drive operations
      expect(printed).toContain(`${documentName}_setDriveName`);
      expect(printed).toContain(`${documentName}_setDriveIcon`);
      expect(printed).toContain(`${documentName}_setSharingType`);
      expect(printed).toContain(`${documentName}_setAvailableOffline`);

      // Cleanup operations
      expect(printed).toContain(`${documentName}_removeListener`);
      expect(printed).toContain(`${documentName}_removeTrigger`);
    });

    it("should include listener and trigger operations", () => {
      const schema = generateDocumentModelSchema(
        driveModule.documentModel.global,
        { useNewApi: true },
      );
      const printed = print(schema);

      // ADD_LISTENER and ADD_TRIGGER now have proper input types and should be included
      expect(printed).toContain(`${documentName}_addListener(`);
      expect(printed).toContain(`${documentName}_addTrigger(`);
      expect(printed).toContain(`${documentName}_addListenerAsync(`);
      expect(printed).toContain(`${documentName}_addTriggerAsync(`);
    });

    it("should include query types", () => {
      const schema = generateDocumentModelSchema(
        driveModule.documentModel.global,
        { useNewApi: true },
      );
      const printed = print(schema);

      expect(printed).toContain(`${documentName}_document`);
      expect(printed).toContain(`${documentName}_findDocuments`);
      expect(printed).toContain(`${documentName}_documentChildren`);
      expect(printed).toContain(`${documentName}_documentParents`);
    });

    it("should include async mutation variants", () => {
      const schema = generateDocumentModelSchema(
        driveModule.documentModel.global,
        { useNewApi: true },
      );
      const printed = print(schema);

      expect(printed).toContain(`${documentName}_addFileAsync`);
      expect(printed).toContain(`${documentName}_deleteNodeAsync`);
      expect(printed).toContain(`${documentName}_setDriveNameAsync`);
    });
  });

  describe("DocumentModelSubgraph resolver generation", () => {
    let reactor: Awaited<ReturnType<typeof testSetupReactor>>["reactor"];
    let subgraph: DocumentModelSubgraph;

    beforeEach(async () => {
      const setup = await testSetupReactor();
      reactor = setup.reactor;

      subgraph = new DocumentModelSubgraph(driveModule, {
        reactor,
        reactorClient: undefined,
        documentPermissionService: undefined,
        relationalDb: {} as SubgraphArgs["relationalDb"],
        graphqlManager: {} as SubgraphArgs["graphqlManager"],
        syncManager: {} as SubgraphArgs["syncManager"],
        analyticsStore: {} as SubgraphArgs["analyticsStore"],
      } as unknown as SubgraphArgs);
    });

    it("should generate mutation resolvers for valid operations (sync + async)", () => {
      const mutations = subgraph.resolvers.Mutation as Record<string, unknown>;

      // Node operations - sync
      expect(mutations[`${documentName}_addFile`]).toBeTypeOf("function");
      expect(mutations[`${documentName}_addFolder`]).toBeTypeOf("function");
      expect(mutations[`${documentName}_deleteNode`]).toBeTypeOf("function");
      expect(mutations[`${documentName}_updateFile`]).toBeTypeOf("function");
      expect(mutations[`${documentName}_updateNode`]).toBeTypeOf("function");
      expect(mutations[`${documentName}_copyNode`]).toBeTypeOf("function");
      expect(mutations[`${documentName}_moveNode`]).toBeTypeOf("function");

      // Node operations - async
      expect(mutations[`${documentName}_addFileAsync`]).toBeTypeOf("function");
      expect(mutations[`${documentName}_deleteNodeAsync`]).toBeTypeOf(
        "function",
      );

      // Drive operations - sync
      expect(mutations[`${documentName}_setDriveName`]).toBeTypeOf("function");
      expect(mutations[`${documentName}_setDriveIcon`]).toBeTypeOf("function");
      expect(mutations[`${documentName}_setSharingType`]).toBeTypeOf(
        "function",
      );
      expect(mutations[`${documentName}_setAvailableOffline`]).toBeTypeOf(
        "function",
      );

      // Drive operations - async
      expect(mutations[`${documentName}_setDriveNameAsync`]).toBeTypeOf(
        "function",
      );

      // Cleanup operations
      expect(mutations[`${documentName}_removeListener`]).toBeTypeOf(
        "function",
      );
      expect(mutations[`${documentName}_removeTrigger`]).toBeTypeOf("function");
    });

    it("should generate mutation resolvers for listener and trigger operations", () => {
      const mutations = subgraph.resolvers.Mutation as Record<string, unknown>;

      // ADD_LISTENER and ADD_TRIGGER now have proper input types and should be included
      expect(mutations[`${documentName}_addListener`]).toBeTypeOf("function");
      expect(mutations[`${documentName}_addTrigger`]).toBeTypeOf("function");
      expect(mutations[`${documentName}_addListenerAsync`]).toBeTypeOf(
        "function",
      );
      expect(mutations[`${documentName}_addTriggerAsync`]).toBeTypeOf(
        "function",
      );
    });

    it("should generate flat query resolvers", () => {
      const queries = subgraph.resolvers.Query as Record<string, unknown>;

      expect(queries[`${documentName}_document`]).toBeTypeOf("function");
      expect(queries[`${documentName}_findDocuments`]).toBeTypeOf("function");
      expect(queries[`${documentName}_documentChildren`]).toBeTypeOf(
        "function",
      );
      expect(queries[`${documentName}_documentParents`]).toBeTypeOf("function");
    });

    it("should generate createDocument and createEmptyDocument mutations", () => {
      const mutations = subgraph.resolvers.Mutation as Record<string, unknown>;

      expect(mutations[`${documentName}_createDocument`]).toBeTypeOf(
        "function",
      );
      expect(mutations[`${documentName}_createEmptyDocument`]).toBeTypeOf(
        "function",
      );
    });
  });

  describe("union type resolvers", () => {
    let reactor: Awaited<ReturnType<typeof testSetupReactor>>["reactor"];
    let subgraph: DocumentModelSubgraph;

    beforeEach(async () => {
      const setup = await testSetupReactor();
      reactor = setup.reactor;

      subgraph = new DocumentModelSubgraph(driveModule, {
        reactor,
        reactorClient: undefined,
        documentPermissionService: undefined,
        relationalDb: {} as SubgraphArgs["relationalDb"],
        graphqlManager: {} as SubgraphArgs["graphqlManager"],
        syncManager: {} as SubgraphArgs["syncManager"],
        analyticsStore: {} as SubgraphArgs["analyticsStore"],
      } as unknown as SubgraphArgs);
    });

    it("should generate a __resolveType resolver for DocumentDrive_Node", () => {
      const nodeResolver = subgraph.resolvers[`${documentName}_Node`] as Record<
        string,
        unknown
      >;

      expect(nodeResolver).toBeDefined();
      expect(nodeResolver.__resolveType).toBeTypeOf("function");
    });

    it("should resolve FileNode when object has documentType field", () => {
      const nodeResolver = subgraph.resolvers[`${documentName}_Node`] as Record<
        string,
        (...args: unknown[]) => string
      >;

      const fileNode = {
        id: "file-1",
        name: "test.txt",
        kind: "file",
        documentType: "powerhouse/document-model",
        parentFolder: null,
      };

      expect(nodeResolver.__resolveType(fileNode)).toBe(
        `${documentName}_FileNode`,
      );
    });

    it("should resolve FolderNode when object lacks documentType field", () => {
      const nodeResolver = subgraph.resolvers[`${documentName}_Node`] as Record<
        string,
        (...args: unknown[]) => string
      >;

      const folderNode = {
        id: "folder-1",
        name: "My Folder",
        kind: "folder",
        parentFolder: null,
      };

      expect(nodeResolver.__resolveType(folderNode)).toBe(
        `${documentName}_FolderNode`,
      );
    });

    it("should generate a __resolveType resolver for DocumentDrive_TriggerData", () => {
      const triggerDataResolver = subgraph.resolvers[
        `${documentName}_TriggerData`
      ] as Record<string, unknown>;

      expect(triggerDataResolver).toBeDefined();
      expect(triggerDataResolver.__resolveType).toBeTypeOf("function");
    });

    it("should resolve PullResponderTriggerData for TriggerData union", () => {
      const triggerDataResolver = subgraph.resolvers[
        `${documentName}_TriggerData`
      ] as Record<string, (...args: unknown[]) => string>;

      const triggerData = {
        listenerId: "listener-1",
        url: "https://example.com",
        interval: "30s",
      };

      expect(triggerDataResolver.__resolveType(triggerData)).toBe(
        `${documentName}_PullResponderTriggerData`,
      );
    });
  });
});
