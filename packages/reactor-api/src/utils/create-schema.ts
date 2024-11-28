import { mergeTypeDefs } from "@graphql-tools/merge";
import { DocumentModel } from "document-model/document";
import { buildSubgraphSchema } from "@apollo/subgraph";
import { typeDefs as Scalars } from "@powerhousedao/scalars";
import { ResolverMap } from "src/subgraphs/types";

export const documentSchema = `
  interface IDocument {
      name: String!
      documentType: String!
      revision: Int!
      created: DateTime!
      lastModified: DateTime!
  }`;
export const scalarsSchema = Scalars.join("\n");

export const createSchema = (
  documentModels: DocumentModel[],
  typeDefs: string,
  resolvers: ResolverMap,
) => {
  const documentModelsSchemas = mergeDocumentModelSchemas(documentModels);
  const mergedTypeDefs = mergeTypeDefs([
    documentSchema,
    scalarsSchema,
    documentModelsSchemas,
  ]);
  return buildSubgraphSchema([
    {
      typeDefs: mergeTypeDefs([mergedTypeDefs, typeDefs]),
      resolvers,
    },
  ]);
};

// TODO improve this cleanup process with graphql-tools
function cleanDocumentModelSchema(schema: string, documentName: string) {
  return schema
    .replaceAll(" Account ", ` ${documentName}Account `)
    .replaceAll(`: Account`, `: ${documentName}Account`)
    .replaceAll(`[Account!]!`, `[${documentName}Account!]!`)
    .replaceAll("scalar DateTime", "")
    .replaceAll(/input (.*?) {[\s\S]*?}/g, "")
    .replaceAll("type AccountSnapshotLocalState", "")
    .replaceAll("type BudgetStatementLocalState", "")
    .replaceAll("type ScopeFrameworkLocalState", "");
}

export function mergeDocumentModelSchemas(documentModels: DocumentModel[]) {
  const typeDefs = documentModels.map(({ documentModel }) =>
    mergeTypeDefs([
      cleanDocumentModelSchema(
        documentModel.specifications[0].state.global.schema,
        documentModel.name,
      ),
      `type ${documentModel.name} implements IDocument {
            id: ID!
            name: String!
            documentType: String!
            revision: Int!
            created: DateTime!
            lastModified: DateTime!
            ${documentModel.name !== "DocumentModel" ? `state: ${documentModel.name}State!` : ""}
        }\n`,
    ]),
  );
  return mergeTypeDefs(typeDefs);
}
