---
to: "<%= rootDir %>/<%= h.changeCase.param(subgraph) %>/resolvers.ts"
force: true
---
import { type Subgraph } from "@powerhousedao/reactor-api";
import { addFile } from "document-drive";
import { actions <% modules.forEach(module => { %><% module.operations.forEach(op => { %>, type <%- h.changeCase.pascal(op.name) %>Input<%_ })}); %>, type <%- h.changeCase.pascal(documentType) %>Document } from "../../document-models/<%- h.changeCase.param(documentType) %>/index.js";
import { setName } from "document-model";

export const getResolvers = (subgraph: Subgraph) => {
  const reactor = subgraph.reactor;

  return ({
    Query: {
      <%- h.changeCase.pascal(documentType) %>: async () => {
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

            const doc = await reactor.getDocument<<%- h.changeCase.pascal(documentType) %>Document>(docId);
            return {
              driveId: driveId,
              ...doc,
              ...doc.header,
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
                const doc = await reactor.getDocument<<%- h.changeCase.pascal(documentType) %>Document>(docId);
                return {
                  driveId: driveId,
                  ...doc,
                  ...doc.header,
                  state: doc.state.global,
                  stateJSON: doc.state.global,
                  revision: doc.header?.revision?.global ?? 0,
                };
              }),
            );

            return docs.filter(
              (doc) => doc.header.documentType === "<%- documentTypeId %>",
            );
          },
        };
      },
    },
    Mutation: {
      <%- h.changeCase.pascal(documentType) %>_createDocument: async (_: unknown, args: { name: string, driveId?: string }) => {
        const { driveId, name } = args;
        const document = await reactor.addDocument("<%- documentTypeId %>");
        
        if(driveId) {
          await reactor.addAction(
            driveId,
            addFile({
              name,
              id: document.header.id,
              documentType: "<%- documentTypeId %>",
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
        <%- h.changeCase.pascal(documentType) + '_' + h.changeCase.camel(op.name) %>: async (_: unknown, args: { docId: string, input: <%- h.changeCase.pascal(op.name) %>Input}) => {
            const { docId, input } = args;
            const doc = await reactor.getDocument<<%- h.changeCase.pascal(documentType) %>Document>(docId);
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
