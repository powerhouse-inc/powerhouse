import { buildSubgraphSchema } from "@apollo/subgraph";
import { IDocumentDriveServer } from "document-drive";
import { GraphQLResolverMap } from "@apollo/subgraph/dist/schema-helper";
import { typeDefs as scalarsTypeDefs } from "@powerhousedao/scalars";
import { DocumentNode, parse } from "graphql";
import { Context } from "src/types";
import gql from "graphql-tag";

export const createSchema = (
  documentDriveServer: IDocumentDriveServer,
  resolvers: GraphQLResolverMap<Context>,
  typeDefs: DocumentNode,
) =>
  buildSubgraphSchema([
    {
      typeDefs: getDocumentModelTypeDefs(documentDriveServer, typeDefs),
      resolvers,
    },
  ]);

export const getDocumentModelTypeDefs = (
  documentDriveServer: IDocumentDriveServer,
  typeDefs: DocumentNode,
) => {
  const documentModels = documentDriveServer.getDocumentModels();
  let dmSchema = "";
  documentModels.forEach(({ documentModel }) => {
    dmSchema += `
          ${documentModel.specifications
            .map((specification) =>
              specification.state.global.schema
                .replaceAll(" Account ", ` ${documentModel.name}Account `)
                .replaceAll(`: Account`, `: ${documentModel.name}Account`)
                .replaceAll(`[Account!]!`, `[${documentModel.name}Account!]!`)
                .replaceAll("scalar DateTime", "")
                .replaceAll(/input (.*?) {[\s\S]*?}/g, ""),
            )
            .join("\n")};
  
          ${documentModel.specifications
            .map((specification) =>
              specification.state.local.schema
                .replaceAll(" Account ", ` ${documentModel.name}Account `)
                .replaceAll(`: Account`, `: ${documentModel.name}Account`)
                .replaceAll(`[Account!]!`, `[${documentModel.name}Account!]!`)
                .replaceAll("scalar DateTime", "")
                .replaceAll(/input (.*?) {[\s\S]*?}/g, "")
                .replaceAll("type AccountSnapshotLocalState", "")
                .replaceAll("type BudgetStatementLocalState", "")
                .replaceAll("type ScopeFrameworkLocalState", ""),
            )
            .join("\n")};

    type ${documentModel.name} implements IDocument {
              id: ID!
              name: String!
              documentType: String!
              operations: [Operation!]!
              revision: Int!
              created: DateTime!
              lastModified: DateTime!
              ${documentModel.name !== "DocumentModel" ? `state: ${documentModel.name}State!` : ""}
          }\n`;
  });

  // add the mutation and query types
  const schema = gql`
    ${scalarsTypeDefs.join("\n")}

    type Operation {
      type: String!
      index: Int!
      timestamp: DateTime!
      hash: String!
    }
    interface IDocument {
      name: String!
      documentType: String!
      revision: Int!
      created: DateTime!
      lastModified: DateTime!
      operations: [Operation!]!
    }
    ${dmSchema}

    ${typeDefs}
  `;

  return schema;
};
