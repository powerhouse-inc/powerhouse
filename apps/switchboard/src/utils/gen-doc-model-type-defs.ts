import type { BaseDocumentDriveServer } from "document-drive";
import { parse } from "graphql";

export const getDocumentModelTypeDefs = (
  documentDriveServer: BaseDocumentDriveServer,
  typeDefs: string,
) => {
  const documentModels = documentDriveServer.getDocumentModelModules();
  let dmSchema = "";
  documentModels.forEach(({ documentModel }) => {
    dmSchema += `
        ${documentModel.global.specifications
          .map((specification) =>
            specification.state.global.schema
              .replaceAll(" Account ", ` ${documentModel.global.name}Account `)
              .replaceAll(`: Account`, `: ${documentModel.global.name}Account`)
              .replaceAll(
                `[Account!]!`,
                `[${documentModel.global.name}Account!]!`,
              )
              .replaceAll("scalar DateTime", "")
              .replaceAll(/input (.*?) {[\s\S]*?}/g, ""),
          )
          .join("\n")};

        ${documentModel.global.specifications
          .map((specification) =>
            specification.state.local.schema
              .replaceAll(" Account ", ` ${documentModel.global.name}Account `)
              .replaceAll(`: Account`, `: ${documentModel.global.name}Account`)
              .replaceAll(
                `[Account!]!`,
                `[${documentModel.global.name}Account!]!`,
              )
              .replaceAll("scalar DateTime", "")
              .replaceAll(/input (.*?) {[\s\S]*?}/g, "")
              .replaceAll("type AccountSnapshotLocalState", "")
              .replaceAll("type BudgetStatementLocalState", "")
              .replaceAll("type ScopeFrameworkLocalState", ""),
          )
          .join("\n")};

        type ${documentModel.global.name} implements IDocument {
            id: ID!
            name: String!
            documentType: String!
            revision: Int!
            created: DateTime!
            createdAtUtcIso: DateTime!
            lastModifiedAtUtcIso: DateTime!
            ${documentModel.global.name !== "DocumentModel" ? `state: ${documentModel.global.name}State!` : ""}
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
        createdAtUtcIso: DateTime!
        lastModifiedAtUtcIso: DateTime!
    }
    ${dmSchema}

    ${typeDefs}
    `;

  return parse(schema.replaceAll(";", ""));
};
