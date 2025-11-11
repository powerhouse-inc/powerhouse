---
to: "<%= rootDir %>/<%= h.changeCase.param(subgraph) %>/resolvers.ts"
force: true
---
import type { BaseSubgraph } from "@powerhousedao/reactor-api";
import { addFile } from "document-drive";
import { setName } from "document-model";
import {
  actions,
  <%= documentTypeVariableName %>,
} from "<%= documentModelDir %>";
<% const inputTypes = modules.flatMap(m =>
     m.operations.map(o => `${h.changeCase.pascalCase(o.name)}Input`)
   );
%>
import type {
  <%= phDocumentTypeName %>,
  <%= inputTypes.join(',\n  ') %>
} from "<%= documentModelDir %>";

export const getResolvers = (subgraph: BaseSubgraph): Record<string, unknown> => {
  const reactor = subgraph.reactor;

  return ({
    Query: {
      <%- pascalCaseDocumentType %>: async () => {
        return {
          getDocument: async (args: { docId: string, driveId: string }) => {
            const { docId, driveId } = args;

            if(!docId) {
              throw new Error("Document id is required");
            }
            
            if(driveId) {
              const docIds = await reactor.getDocuments(driveId);
              if(!docIds.includes(docId)) {
                throw new Error(`Document with id ${docId} is not part of ${driveId}`);
              }
            }

            const doc = await reactor.getDocument<<%= phDocumentTypeName %>>(docId);
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
          getDocuments: async (args: { driveId: string }) => {
            const { driveId } = args;
            const docsIds = await reactor.getDocuments(driveId);
            const docs = await Promise.all(
              docsIds.map(async (docId) => {
                const doc = await reactor.getDocument<<%= phDocumentTypeName %>>(docId);
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
              }),
            );

            return docs.filter(
              (doc) => doc.header.documentType === <%= documentTypeVariableName %>,
            );
          },
        };
      },
    },
    Mutation: {
      <%- pascalCaseDocumentType %>_createDocument: async (_: unknown, args: { name: string, driveId?: string }) => {
        const { driveId, name } = args;
        const document = await reactor.addDocument(<%= documentTypeVariableName %>);
        
        if(driveId) {
          await reactor.addAction(
            driveId,
            addFile({
              name,
              id: document.header.id,
              documentType: <%= documentTypeVariableName %>,
            }),
          );
        }

        if(name) {
          await reactor.addAction(
            document.header.id,
            setName(name),
          );
        }

        return document.header.id;
      },

<% modules.forEach(module => { _%>
<% module.operations.forEach(op => { _%>
        <%- pascalCaseDocumentType + '_' + h.changeCase.camel(op.name) %>: async (_: unknown, args: { docId: string, input: <%- h.changeCase.pascal(op.name) %>Input}) => {
            const { docId, input } = args;
            const doc = await reactor.getDocument<<%- pascalCaseDocumentType %>Document>(docId);
            if(!doc) {
              throw new Error("Document not found");
            }

            const result = await reactor.addAction(
                docId,
                actions.<%- h.changeCase.camel(op.name) %>(input)
            );
            
            if(result.status !== "SUCCESS") {
              throw new Error(result.error?.message ?? "Failed to <%- h.changeCase.camel(op.name) %>");
            }

            return true;
        },

<%_ })}); %>
    },
  });
};
