import { buildSubgraphSchema } from "@apollo/subgraph";
import type {
  GraphQLResolverMap,
  GraphQLSchemaModule,
} from "@apollo/subgraph/dist/schema-helper/resolverMap.js";
import { typeDefs as scalarsTypeDefs } from "@powerhousedao/document-engineering/graphql";
import type { Context } from "@powerhousedao/reactor-api";
import { pascalCase } from "change-case";
import type { IDocumentDriveServer } from "document-drive";
import type { DocumentNode } from "graphql";
import { gql } from "graphql-tag";
import { GraphQLJSONObject } from "graphql-type-json";

export const buildSubgraphSchemaModule = (
  documentDriveServer: IDocumentDriveServer,
  resolvers: GraphQLResolverMap<Context>,
  typeDefs: DocumentNode,
): GraphQLSchemaModule => {
  const newResolvers = {
    ...resolvers,
    JSONObject: GraphQLJSONObject,
  };

  return {
    typeDefs: getDocumentModelTypeDefs(documentDriveServer, typeDefs),
    resolvers: newResolvers,
  };
};
export const createSchema = (
  documentDriveServer: IDocumentDriveServer,
  resolvers: GraphQLResolverMap<Context>,
  typeDefs: DocumentNode,
) => {
  return buildSubgraphSchema(
    buildSubgraphSchemaModule(documentDriveServer, resolvers, typeDefs),
  );
};

export const getDocumentModelTypeDefs = (
  documentDriveServer: IDocumentDriveServer,
  typeDefs: DocumentNode,
) => {
  const documentModels = documentDriveServer.getDocumentModelModules();
  let dmSchema = "";
  documentModels.forEach(({ documentModel }) => {
    const dmSchemaName = pascalCase(
      documentModel.global.name.replaceAll("/", " "),
    );
    let tmpDmSchema = `
          ${documentModel.global.specifications
            .map((specification) =>
              specification.state.global.schema
                .replaceAll("scalar DateTime", "")
                .replaceAll(/input (.*?) {[\s\S]*?}/g, ""),
            )
            .join("\n")};
  
          ${documentModel.global.specifications
            .map((specification) =>
              specification.state.local.schema
                .replaceAll("scalar DateTime", "")
                .replaceAll(/input (.*?) {[\s\S]*?}/g, "")
                .replaceAll("type AccountSnapshotLocalState", "")
                .replaceAll("type BudgetStatementLocalState", "")
                .replaceAll("type ScopeFrameworkLocalState", ""),
            )
            .join("\n")};

    \n`;

    const found = tmpDmSchema.match(/(type|enum|union)\s+(\w+)\s/g);
    const trimmedFound = found?.map((f) =>
      f
        .replaceAll("type ", "")
        .replaceAll("enum ", "")
        .replaceAll("union ", "")
        .trim(),
    );
    trimmedFound?.forEach((f) => {
      // Create a regex that matches the type name with proper boundaries
      const typeRegex = new RegExp(
        // Match type references in various GraphQL contexts
        `(?<![_A-Za-z0-9])(${f})(?![_A-Za-z0-9])|` + // Basic type references
          `\\[(${f})\\]|` + // Array types without nullability
          `\\[(${f})!\\]|` + // Array of non-null types
          `\\[(${f})\\]!|` + // Non-null array of types
          `\\[(${f})!\\]!`, // Non-null array of non-null types
        "g",
      );

      tmpDmSchema = tmpDmSchema.replace(
        typeRegex,
        (
          match: string,
          p1: string,
          p2: string,
          p3: string,
          p4: string,
          p5: string,
        ) => {
          // If it's an array type, preserve the brackets and ! while replacing the type name
          if (match.startsWith("[")) {
            return match.replace(
              p2 || p3 || p4 || p5,
              `${dmSchemaName}_${p2 || p3 || p4 || p5}`,
            );
          }
          // Basic type reference
          return `${dmSchemaName}_${p1}`;
        },
      );
    });
    dmSchema += tmpDmSchema;
    dmSchema += `
    type ${dmSchemaName} implements IDocument {
              id: String!
              name: String!
              documentType: String!
              operations(skip: Int, first: Int): [Operation!]!
              revision: Int!
              created: DateTime!
              createdAtUtcIso: DateTime!
              lastModifiedAtUtcIso: DateTime!
              ${dmSchemaName !== "DocumentModel" ? `initialState: ${dmSchemaName}_${dmSchemaName}State!` : ""}
              ${dmSchemaName !== "DocumentModel" ? `state: ${dmSchemaName}_${dmSchemaName}State!` : ""}
              stateJSON: JSONObject
          }\n`;
  });

  // add the mutation and query types
  const schema = gql`
    scalar JSONObject
    ${scalarsTypeDefs.join("\n").replaceAll(";", "")}

    type PHOperationContext {
      signer: Signer
    }

    type Signer {
      user: SignerUser
      app: SignerApp
      signatures: [String!]!
    }

    type SignerUser {
      address: String!
      networkId: String!
      chainId: Int!
    }

    type SignerApp {
      name: String!
      key: String!
    }

    type Operation {
      id: String!
      type: String!
      index: Int!
      timestampUtcMs: DateTime!
      hash: String!
      skip: Int
      inputText: String
      error: String
      context: PHOperationContext
    }
    interface IDocument {
      id: String!
      name: String!
      documentType: String!
      revision: Int!
      createdAtUtcIso: DateTime!
      lastModifiedAtUtcIso: DateTime!
      operations(first: Int, skip: Int): [Operation!]!
      stateJSON: JSONObject
    }
    ${dmSchema.replaceAll(";", "")}

    type DriveDocument implements IDocument {
      id: String!
      name: String!
      documentType: String!
      revision: Int!
      createdAtUtcIso: DateTime!
      lastModifiedAtUtcIso: DateTime!
      operations(first: Int, skip: Int): [Operation!]!
      stateJSON: JSONObject
    }

    ${typeDefs}
  `;

  return schema;
};
