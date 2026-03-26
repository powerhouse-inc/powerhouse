export type DocumentModelSubgraphSchemaParams = {
  pascalCaseDocumentType: string;
  modules: Array<{
    name: string;
    operations: Array<{
      name: string;
      schema: string;
    }>;
  }>;
};

export const documentModelSubgraphSchemaTemplate = (
  v: DocumentModelSubgraphSchemaParams,
) => {
  const mutationFields = v.modules
    .flatMap((module) =>
      module.operations.map(
        (op) =>
          `    ${v.pascalCaseDocumentType}_${camel(op.name)}(driveId:String, docId:PHID, input:${v.pascalCaseDocumentType}_${pascal(op.name)}Input): Int`,
      ),
    )
    .join("\n");

  const moduleSchemas = v.modules
    .map((module) => {
      const header = `\n"""\nModule: ${pascal(module.name)}\n"""`;
      const opSchemas = module.operations.map((op) => op.schema).join("\n");
      return `${header}\n${opSchemas}`;
    })
    .join("\n");

  const body = `import { gql } from "graphql-tag";
import type { DocumentNode } from "graphql";

export const schema: DocumentNode = gql\`
"""
Queries: ${v.pascalCaseDocumentType} Document
"""

type ${v.pascalCaseDocumentType}Queries {
    getDocument(docId: PHID!, driveId: PHID): ${v.pascalCaseDocumentType}
    getDocuments(driveId: String): [${v.pascalCaseDocumentType}!]
}

type Query {
    ${v.pascalCaseDocumentType}: ${v.pascalCaseDocumentType}Queries
}

"""
Mutations: ${v.pascalCaseDocumentType}
"""
type Mutation {

    ${v.pascalCaseDocumentType}_createDocument(name:String!, driveId:String): String

${mutationFields}
}

${moduleSchemas}
\`
`;
  return body;
};

function pascal(name: string): string {
  return name
    .split(/[-_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

function camel(name: string): string {
  const p = pascal(name);
  return p.charAt(0).toLowerCase() + p.slice(1);
}
