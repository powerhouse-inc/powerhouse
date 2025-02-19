import { BaseDocumentDriveServer } from "document-drive";
import { parse } from "graphql";

export const getDocumentModelTypeDefs = (
  documentDriveServer: BaseDocumentDriveServer,
  typeDefs: string,
) => {
  const documentModels = documentDriveServer.getDocumentModels();
  let dmSchema = "";
  documentModels.forEach(({ documentModelState }) => {
    dmSchema += `
        ${documentModelState.specifications
          .map((specification) =>
            specification.state.global.schema
              .replaceAll(" Account ", ` ${documentModelState.name}Account `)
              .replaceAll(`: Account`, `: ${documentModelState.name}Account`)
              .replaceAll(
                `[Account!]!`,
                `[${documentModelState.name}Account!]!`,
              )
              .replaceAll("scalar DateTime", "")
              .replaceAll(/input (.*?) {[\s\S]*?}/g, ""),
          )
          .join("\n")};

        ${documentModelState.specifications
          .map((specification) =>
            specification.state.local.schema
              .replaceAll(" Account ", ` ${documentModelState.name}Account `)
              .replaceAll(`: Account`, `: ${documentModelState.name}Account`)
              .replaceAll(
                `[Account!]!`,
                `[${documentModelState.name}Account!]!`,
              )
              .replaceAll("scalar DateTime", "")
              .replaceAll(/input (.*?) {[\s\S]*?}/g, "")
              .replaceAll("type AccountSnapshotLocalState", "")
              .replaceAll("type BudgetStatementLocalState", "")
              .replaceAll("type ScopeFrameworkLocalState", ""),
          )
          .join("\n")};

        type ${documentModelState.name} implements IDocument {
            id: ID!
            name: String!
            documentType: String!
            revision: Int!
            created: DateTime!
            lastModified: DateTime!
            ${documentModelState.name !== "DocumentModel" ? `state: ${documentModelState.name}State!` : ""}
        }\n`;
  });

  // add the mutation and query types
  const schema = `
    scalar DateTime
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
