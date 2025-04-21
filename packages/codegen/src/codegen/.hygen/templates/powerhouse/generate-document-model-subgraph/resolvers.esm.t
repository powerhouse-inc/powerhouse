---
to: "<%= rootDir %>/<%= h.changeCase.param(subgraph) %>/resolvers.ts"
force: true
---
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { type Subgraph } from "@powerhousedao/reactor-api";
import { addFile } from "document-drive";
import { actions } from "../../document-models/<%- h.changeCase.param(documentType) %>/index.js";
import { generateId, hashKey } from "document-model";

const DEFAULT_DRIVE_ID = "powerhouse";

export const getResolvers = (subgraph: Subgraph) => {
  const reactor = subgraph.reactor;

  return ({
    Query: {
      <%- h.changeCase.pascal(documentType) %>: async (_: any, args: any, ctx: any): Record<string, any> => {
        return {
          getDocument: async (args: any) => {
            const driveId: string = args.driveId || DEFAULT_DRIVE_ID;
            const docId: string = args.docId || "";
            const doc = await reactor.getDocument(driveId, docId);
             return {
              id: docId,
              driveId: driveId,
              ...doc,
              state: doc.state.global,
              stateJSON: doc.state.global,
              revision: doc.revision.global,
            };
          },
          getDocuments: async (args: any) => {
            const driveId: string = args.driveId || DEFAULT_DRIVE_ID;
            const docsIds = await reactor.getDocuments(driveId);
            const docs = await Promise.all(
              docsIds.map(async (docId) => {
                const doc = await reactor.getDocument(driveId, docId);
                return {
                  id: docId,
                  driveId: driveId,
                  ...doc,
                  state: doc.state.global,
                  stateJSON: doc.state.global,
                  revision: doc.revision.global,
                };
              }),
            );

            return docs.filter(
              (doc) => doc.documentType === "<%- documentTypeId %>",
            );
          },
        };
      },
    },
    Mutation: {

      <%- h.changeCase.pascal(documentType) %>_createDocument: async (_: any, args: any) => {
        const driveId: string = args.driveId || DEFAULT_DRIVE_ID;
        const docId = generateId();
        
        await reactor.addDriveAction(driveId, addFile({
          id: docId,
          name: args.name,
          documentType: "<%- documentTypeId %>",
          synchronizationUnits:[
            { 
              branch: "main", 
              scope: "global", 
              syncId: hashKey(), 
            },
            { 
              branch: "main", 
              scope: "local", 
              syncId: hashKey(), 
            }
          ],
        }));

        return docId;
      },

<% modules.forEach(module => { _%>
<% module.operations.forEach(op => { _%>
        <%- h.changeCase.pascal(documentType) + '_' + h.changeCase.camel(op.name) 
        %>: async (_: any, args: any) => {
            const driveId: string = args.driveId || DEFAULT_DRIVE_ID;
            const docId: string = args.docId || "";
            const doc = await reactor.getDocument(driveId, docId);

            await reactor.addAction(
                driveId,
                docId,
                actions.<%- h.changeCase.camel(op.name) %>({...args.input})
            );
            
            return doc.revision.global + 1;
        },

<%_ })}); %>
    },
  });
};
