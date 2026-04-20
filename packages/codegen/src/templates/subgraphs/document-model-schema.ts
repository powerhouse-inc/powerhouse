import { camelCase, pascalCase } from "change-case";
import { filter, flatMap, isTruthy, join, map, pipe, prop } from "remeda";

export const documentModelSubgraphSchemaTemplate = (v: {
  modulesWithSchemaTypePrefixes: {
    name: string;
    operations: {
      name: string;
      schema: string;
    }[];
  }[];
  pascalCaseDocumentType: string;
}) => {
  const mutationFields = pipe(
    v.modulesWithSchemaTypePrefixes,
    flatMap(prop("operations")),
    flatMap(prop("name")),
    filter(isTruthy),
    map(
      (name) =>
        `    ${v.pascalCaseDocumentType}_${camelCase(name)}(driveId:String, docId:PHID, input:${v.pascalCaseDocumentType}_${pascalCase(name)}Input): Int`,
    ),
    join("\n"),
  );

  const moduleSchemas = v.modulesWithSchemaTypePrefixes
    .map((module) => {
      const header = `\n"""\nModule: ${pascalCase(module.name)}\n"""`;
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
