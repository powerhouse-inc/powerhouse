export type DocumentModelSubgraphResolversParams = {
  pascalCaseDocumentType: string;
  camelCaseDocumentType: string;
  phDocumentTypeName: string;
  documentTypeVariableName: string;
  documentModelDir: string;
  modules: Array<{
    name: string;
    operations: Array<{
      name: string;
    }>;
  }>;
};

export const documentModelSubgraphResolversTemplate = (
  v: DocumentModelSubgraphResolversParams,
): string => {
  const inputTypes = v.modules.flatMap((m) =>
    m.operations.map((o) => `${pascal(o.name)}Input`),
  );

  const inputTypeImports = inputTypes.join(",\n  ");

  const operationMutations = v.modules
    .flatMap((module) =>
      module.operations.map(
        (op) =>
          `        ${v.pascalCaseDocumentType}_${camel(op.name)}: async (_: unknown, args: { docId: string, input: ${pascal(op.name)}Input}) => {
            const { docId, input } = args;
            const doc = await reactorClient.get<${v.pascalCaseDocumentType}Document>(docId);
            if(!doc) {
              throw new Error("Document not found");
            }

            await reactorClient.execute(
                docId,
                "main",
                [actions.${camel(op.name)}(input)]
            );

            return true;
        },
`,
      ),
    )
    .join("\n");

  return `import type { BaseSubgraph } from "@powerhousedao/reactor-api";
import { addFile } from "@powerhousedao/shared/document-drive";
import { setName } from "document-model";
import {
  actions,
  ${v.documentTypeVariableName},
} from "${v.documentModelDir}";
import type {
  ${v.phDocumentTypeName},
  ${inputTypeImports}
} from "${v.documentModelDir}";

export const getResolvers = (subgraph: BaseSubgraph): Record<string, unknown> => {
  const reactorClient = subgraph.reactorClient;

  return ({
    Query: {
      ${v.pascalCaseDocumentType}: async () => {
        return {
          getDocument: async (args: { docId: string, driveId: string }) => {
            const { docId, driveId } = args;

            if(!docId) {
              throw new Error("Document id is required");
            }

            if(driveId) {
              const children = await reactorClient.getChildren(driveId);
              const childIds = children.results.map(d => d.header.id);
              if(!childIds.includes(docId)) {
                throw new Error(\`Document with id \${docId} is not part of \${driveId}\`);
              }
            }

            const doc = await reactorClient.get<${v.phDocumentTypeName}>(docId);
            return {
              driveId: driveId,
              ...doc,
              ...doc.header,
              created: doc.header.createdAtUtcIso,
              lastModified: doc.header.lastModifiedAtUtcIso,
              state: doc.state.global,
              stateJSON: doc.state.global,
              revision: doc.header?.revision?.global ?? 0,
            };
          },
          getDocuments: async (args: { driveId?: string }) => {
            const { driveId } = args;
            const result = await reactorClient.find({ type: ${v.documentTypeVariableName}, ...(driveId ? { parentId: driveId } : {}) });
            return result.results.map((_doc) => {
              const doc = _doc as ${v.phDocumentTypeName};
              return {
                driveId: driveId,
                ...doc,
                ...doc.header,
                created: doc.header.createdAtUtcIso,
                lastModified: doc.header.lastModifiedAtUtcIso,
                state: doc.state.global,
                stateJSON: doc.state.global,
                revision: doc.header?.revision?.global ?? 0,
              };
            });
          },
        };
      },
    },
    Mutation: {
      ${v.pascalCaseDocumentType}_createDocument: async (_: unknown, args: { name: string, driveId?: string }) => {
        const { driveId, name } = args;
        const document = await reactorClient.createEmpty(${v.documentTypeVariableName});

        if(driveId) {
          await reactorClient.execute(
            driveId,
            "main",
            [addFile({
              name,
              id: document.header.id,
              documentType: ${v.documentTypeVariableName},
            })],
          );
        }

        if(name) {
          await reactorClient.execute(
            document.header.id,
            "main",
            [setName(name)],
          );
        }

        return document.header.id;
      },

${operationMutations}
    },
  });
};
`;
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
