import { buildSubgraphSchema } from "@apollo/subgraph";
import { IDocumentDriveServer } from "document-drive";
import { GraphQLResolverMap } from "@apollo/subgraph/dist/schema-helper";
import { typeDefs as scalarsTypeDefs } from "@powerhousedao/scalars";
import { parse } from "graphql";

export const createSchema = (
  documentDriveServer: IDocumentDriveServer,
  resolvers: GraphQLResolverMap,
  typeDefs: string
) =>
  buildSubgraphSchema([
    {
      typeDefs: getDocumentModelTypeDefs(documentDriveServer, typeDefs),
      resolvers,
    },
  ]);

export const getDocumentModelTypeDefs = (
  documentDriveServer: IDocumentDriveServer,
  typeDefs: string
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
                .replaceAll(/input (.*?) {[\s\S]*?}/g, "")
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
                .replaceAll("type ScopeFrameworkLocalState", "")
            )
            .join("\n")};
  
          type ${documentModel.name} implements IDocument {
              id: ID!
              name: String!
              documentType: String!
              revision: Int!
              created: DateTime!
              lastModified: DateTime!
              ${documentModel.name !== "DocumentModel" ? `state: ${documentModel.name}State!` : ""}
          }\n`;
  });

  // add the mutation and query types
  const schema = `
      ${scalarsTypeDefs.join("\n")}
      
      interface IDocument {
          name: String!
          documentType: String!
          revision: Int!
          created: DateTime!
          lastModified: DateTime!
          
      }
      ${dmSchema}
  
      ${typeDefs}
      `;

  return parse(schema.replaceAll(";", ""));
};
