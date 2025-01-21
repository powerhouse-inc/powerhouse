import { buildSubgraphSchema } from "@apollo/subgraph";
import { GraphQLResolverMap } from "@apollo/subgraph/dist/schema-helper";
import { typeDefs as scalarsTypeDefs } from "@powerhousedao/scalars";
import { IDocumentDriveServer } from "document-drive";
import { DocumentNode } from "graphql";
import gql from "graphql-tag";
import { Context } from "src/subgraphs";

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
  const dmSchema = "";
  documentModels.forEach(({ documentModel }) => {
    const dmName = documentModel.name.replaceAll(" ", "");
    const dmSchemaTmp = `
          ${documentModel.specifications
            .map((specification) =>
              specification.state.global.schema
                .replaceAll(" Account ", ` ${dmName}Account `)
                .replaceAll(`: Account`, `: ${dmName}Account`)
                .replaceAll(`[Account!]!`, `[${dmName}Account!]!`)
                .replaceAll("scalar DateTime", "")
                .replaceAll(/input (.*?) {[\s\S]*?}/g, ""),
            )
            .join("\n")}
  
          ${documentModel.specifications
            .map((specification) =>
              specification.state.local.schema
                .replaceAll(" Account ", ` ${dmName}Account `)
                .replaceAll(`: Account`, `: ${dmName}Account`)
                .replaceAll(`[Account!]!`, `[${dmName}Account!]!`)
                .replaceAll("scalar DateTime", "")
                .replaceAll(/input (.*?) {[\s\S]*?}/g, "")
                .replaceAll("type AccountSnapshotLocalState", "")
                .replaceAll("type BudgetStatementLocalState", "")
                .replaceAll("type ScopeFrameworkLocalState", ""),
            )
            .join("\n")}

    type ${documentModel.name.replaceAll(" ", "")} implements IDocument {
              id: String!
              name: String!
              documentType: String!
              operations(skip: Int, first: Int): [Operation!]!
              revision: Int!
              created: DateTime!
              lastModified: DateTime!
              ${documentModel.name !== "DocumentModel" ? `initialState: ${documentModel.name.replaceAll(" ", "")}State!` : ""}
              ${documentModel.name !== "DocumentModel" ? `state: ${documentModel.name.replaceAll(" ", "")}State!` : ""}
          }\n`;
  });

  // add the mutation and query types
  const schema = gql`
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
      timestamp: DateTime!
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
      created: DateTime!
      lastModified: DateTime!
      operations(first: Int, skip: Int): [Operation!]!
    }
    ${dmSchema.replaceAll(";", "")}

    ${typeDefs}
  `;

  return schema;
};
