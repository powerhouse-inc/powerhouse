import { ReactorBuilder, ReactorClientBuilder } from "@powerhousedao/reactor";
import type { SubgraphArgs } from "@powerhousedao/reactor-api";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { Kind, parse, print } from "graphql";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DocumentModelSubgraph,
  type DocumentModelResolverMap,
} from "../src/graphql/document-model-subgraph.js";
import {
  generateDocumentModelSchema,
  getDocumentModelSchemaName,
} from "../src/utils/create-schema.js";

/**
 * Parse a generated DocumentNode into a map of type definitions.
 * Returns { typeName -> { kind, fieldNames } } for easy assertion.
 */
function parseSchemaTypes(
  docNode: ReturnType<typeof generateDocumentModelSchema>,
) {
  const ast = parse(print(docNode));
  const types: Record<string, { kind: string; fields: string[] }> = {};

  for (const def of ast.definitions) {
    if (
      def.kind === Kind.OBJECT_TYPE_DEFINITION ||
      def.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION
    ) {
      types[def.name.value] = {
        kind: def.kind,
        fields: def.fields?.map((f) => f.name.value) ?? [],
      };
    }
  }
  return types;
}

/**
 * Extract the return type name from a field definition AST node,
 * stripping NonNull and List wrappers.
 */
function getFieldReturnTypeName(field: {
  type: { kind: Kind; name?: { value: string }; type?: unknown };
}): string {
  let node = field.type as {
    kind: Kind;
    name?: { value: string };
    type?: unknown;
  };
  while (node.kind === Kind.NON_NULL_TYPE || node.kind === Kind.LIST_TYPE) {
    node = node.type as {
      kind: Kind;
      name?: { value: string };
      type?: unknown;
    };
  }
  return node.name?.value ?? "";
}

describe("Document-Drive Subgraph", () => {
  const driveModule =
    driveDocumentModelModule as unknown as DocumentModelModule;
  const documentName = getDocumentModelSchemaName(
    driveModule.documentModel.global,
  );

  describe("schema generation", () => {
    const buildTypes = () =>
      parseSchemaTypes(
        generateDocumentModelSchema(driveModule.documentModel.global, {
          useNewApi: true,
        }),
      );

    it("should generate a valid schema for document-drive", () => {
      expect(() =>
        generateDocumentModelSchema(driveModule.documentModel.global, {
          useNewApi: true,
        }),
      ).not.toThrow();
    });

    it("should have Query type with a namespace field returning the Queries type", () => {
      const ast = parse(
        print(
          generateDocumentModelSchema(driveModule.documentModel.global, {
            useNewApi: true,
          }),
        ),
      );
      const queryDef = ast.definitions.find(
        (d) =>
          d.kind === Kind.OBJECT_TYPE_DEFINITION && d.name.value === "Query",
      );
      expect(queryDef).toBeDefined();
      if (queryDef?.kind !== Kind.OBJECT_TYPE_DEFINITION)
        throw new Error("unreachable");

      const nsField = queryDef.fields?.find(
        (f) => f.name.value === documentName,
      );
      expect(nsField).toBeDefined();
      expect(getFieldReturnTypeName(nsField!)).toBe(`${documentName}Queries`);
    });

    it("should have Mutation type with a namespace field returning the Mutations type", () => {
      const ast = parse(
        print(
          generateDocumentModelSchema(driveModule.documentModel.global, {
            useNewApi: true,
          }),
        ),
      );
      const mutationDef = ast.definitions.find(
        (d) =>
          d.kind === Kind.OBJECT_TYPE_DEFINITION && d.name.value === "Mutation",
      );
      expect(mutationDef).toBeDefined();
      if (mutationDef?.kind !== Kind.OBJECT_TYPE_DEFINITION)
        throw new Error("unreachable");

      const nsField = mutationDef.fields?.find(
        (f) => f.name.value === documentName,
      );
      expect(nsField).toBeDefined();
      expect(getFieldReturnTypeName(nsField!)).toBe(`${documentName}Mutations`);
    });

    it("should have unprefixed query fields inside the Queries namespace type", () => {
      const types = buildTypes();
      const queriesType = types[`${documentName}Queries`];
      expect(queriesType).toBeDefined();

      expect(queriesType.fields).toContain("document");
      expect(queriesType.fields).toContain("findDocuments");
      expect(queriesType.fields).toContain("documentChildren");
      expect(queriesType.fields).toContain("documentParents");

      expect(queriesType.fields).not.toContain(`${documentName}_document`);
    });

    it("should have unprefixed mutation fields inside the Mutations namespace type", () => {
      const types = buildTypes();
      const mutationsType = types[`${documentName}Mutations`];
      expect(mutationsType).toBeDefined();

      expect(mutationsType.fields).toContain("createDocument");
      expect(mutationsType.fields).toContain("createEmptyDocument");

      expect(mutationsType.fields).toContain("addFile");
      expect(mutationsType.fields).toContain("addFolder");
      expect(mutationsType.fields).toContain("deleteNode");
      expect(mutationsType.fields).toContain("updateFile");
      expect(mutationsType.fields).toContain("updateNode");
      expect(mutationsType.fields).toContain("copyNode");
      expect(mutationsType.fields).toContain("moveNode");

      expect(mutationsType.fields).toContain("setDriveName");
      expect(mutationsType.fields).toContain("setDriveIcon");
      expect(mutationsType.fields).toContain("setSharingType");
      expect(mutationsType.fields).toContain("setAvailableOffline");

      expect(mutationsType.fields).toContain("removeListener");
      expect(mutationsType.fields).toContain("removeTrigger");

      expect(mutationsType.fields).not.toContain(`${documentName}_addFile`);
    });

    it("should include listener and trigger operations in the Mutations namespace type", () => {
      const types = buildTypes();
      const fields = types[`${documentName}Mutations`].fields;

      expect(fields).toContain("addListener");
      expect(fields).toContain("addTrigger");
      expect(fields).toContain("addListenerAsync");
      expect(fields).toContain("addTriggerAsync");
    });

    it("should include async mutation variants in the Mutations namespace type", () => {
      const types = buildTypes();
      const fields = types[`${documentName}Mutations`].fields;

      expect(fields).toContain("addFileAsync");
      expect(fields).toContain("deleteNodeAsync");
      expect(fields).toContain("setDriveNameAsync");
    });
  });

  describe("DocumentModelSubgraph resolver generation", () => {
    let subgraph: DocumentModelSubgraph;

    beforeEach(async () => {
      const builder = new ReactorClientBuilder().withReactorBuilder(
        new ReactorBuilder().withDocumentModels([driveModule]),
      );
      const reactorClient = await builder.build();

      subgraph = new DocumentModelSubgraph(driveModule, {
        reactorClient,
        documentPermissionService: undefined,
        relationalDb: {} as SubgraphArgs["relationalDb"],
        graphqlManager: {} as SubgraphArgs["graphqlManager"],
        syncManager: {} as SubgraphArgs["syncManager"],
        analyticsStore: {} as SubgraphArgs["analyticsStore"],
      } as unknown as SubgraphArgs);
    });

    it("should have a namespace resolver on Query that returns an empty object", () => {
      const queryResolvers = subgraph.resolvers.Query;
      expect(queryResolvers[documentName]).toBeTypeOf("function");
      expect(queryResolvers[documentName]()).toEqual({});
    });

    it("should have a namespace resolver on Mutation that returns an empty object", () => {
      const mutationResolvers = subgraph.resolvers.Mutation;
      expect(mutationResolvers[documentName]).toBeTypeOf("function");
      expect(mutationResolvers[documentName]()).toEqual({});
    });

    it("should generate query resolvers on the Queries namespace key", () => {
      const queries = subgraph.queryResolvers;
      expect(queries).toBeDefined();

      expect(queries.document).toBeTypeOf("function");
      expect(queries.findDocuments).toBeTypeOf("function");
      expect(queries.documentChildren).toBeTypeOf("function");
      expect(queries.documentParents).toBeTypeOf("function");
    });

    it("should generate mutation resolvers for valid operations (sync + async) on the Mutations namespace key", () => {
      const mutations = subgraph.mutationResolvers;
      expect(mutations).toBeDefined();

      expect(mutations["addFile"]).toBeTypeOf("function");
      expect(mutations["addFolder"]).toBeTypeOf("function");
      expect(mutations["deleteNode"]).toBeTypeOf("function");
      expect(mutations["updateFile"]).toBeTypeOf("function");
      expect(mutations["updateNode"]).toBeTypeOf("function");
      expect(mutations["copyNode"]).toBeTypeOf("function");
      expect(mutations["moveNode"]).toBeTypeOf("function");

      expect(mutations["addFileAsync"]).toBeTypeOf("function");
      expect(mutations["deleteNodeAsync"]).toBeTypeOf("function");

      expect(mutations["setDriveName"]).toBeTypeOf("function");
      expect(mutations["setDriveIcon"]).toBeTypeOf("function");
      expect(mutations["setSharingType"]).toBeTypeOf("function");
      expect(mutations["setAvailableOffline"]).toBeTypeOf("function");

      expect(mutations["setDriveNameAsync"]).toBeTypeOf("function");

      expect(mutations["removeListener"]).toBeTypeOf("function");
      expect(mutations["removeTrigger"]).toBeTypeOf("function");
    });

    it("should generate mutation resolvers for listener and trigger operations", () => {
      const mutations = subgraph.mutationResolvers;

      expect(mutations["addListener"]).toBeTypeOf("function");
      expect(mutations["addTrigger"]).toBeTypeOf("function");
      expect(mutations["addListenerAsync"]).toBeTypeOf("function");
      expect(mutations["addTriggerAsync"]).toBeTypeOf("function");
    });

    it("should generate createDocument and createEmptyDocument mutations", () => {
      const mutations = subgraph.mutationResolvers;

      expect(mutations.createDocument).toBeTypeOf("function");
      expect(mutations.createEmptyDocument).toBeTypeOf("function");
    });

    it("should not have flat prefixed resolvers on Query or Mutation", () => {
      expect(Object.keys(subgraph.resolvers.Query)).toEqual([documentName]);
      expect(Object.keys(subgraph.resolvers.Mutation)).toEqual([documentName]);
    });
  });

  describe("union type resolvers", () => {
    let subgraph: DocumentModelSubgraph;

    beforeEach(async () => {
      const builder = new ReactorClientBuilder().withReactorBuilder(
        new ReactorBuilder().withDocumentModels([driveModule]),
      );
      const reactorClient = await builder.build();

      subgraph = new DocumentModelSubgraph(driveModule, {
        reactorClient,
        documentPermissionService: undefined,
        relationalDb: {} as SubgraphArgs["relationalDb"],
        graphqlManager: {} as SubgraphArgs["graphqlManager"],
        syncManager: {} as SubgraphArgs["syncManager"],
        analyticsStore: {} as SubgraphArgs["analyticsStore"],
      } as unknown as SubgraphArgs);
    });

    it("should generate a __resolveType resolver for DocumentDrive_Node", () => {
      const nodeResolver = subgraph.resolvers[
        `${documentName}_Node`
      ] as DocumentModelResolverMap;

      expect(nodeResolver).toBeDefined();
      expect(nodeResolver.__resolveType).toBeTypeOf("function");
    });

    it("should resolve FileNode when object has documentType field", () => {
      const nodeResolver = subgraph.resolvers[
        `${documentName}_Node`
      ] as DocumentModelResolverMap;

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
      const nodeResolver = subgraph.resolvers[
        `${documentName}_Node`
      ] as DocumentModelResolverMap;

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
      ] as DocumentModelResolverMap;

      expect(triggerDataResolver).toBeDefined();
      expect(triggerDataResolver.__resolveType).toBeTypeOf("function");
    });

    it("should resolve PullResponderTriggerData for TriggerData union", () => {
      const triggerDataResolver = subgraph.resolvers[
        `${documentName}_TriggerData`
      ] as DocumentModelResolverMap;

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
