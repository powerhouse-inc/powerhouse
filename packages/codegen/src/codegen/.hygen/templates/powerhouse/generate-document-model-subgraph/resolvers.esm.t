---
to: "<%= rootDir %>/<%= h.changeCase.param(subgraph) %>/resolvers.ts"
force: true
---
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { type Subgraph } from "@powerhousedao/reactor-api";
import { addFile } from "document-drive";
import { DocumentNotFoundError } from "document-drive/server/error";
import { actions } from "../../document-models/<%- h.changeCase.param(documentType) %>/index.js";
import { generateId } from "document-model";

const DEFAULT_DRIVE_ID = "powerhouse";

export const getResolvers = (subgraph: Subgraph): Record<string, any> => {
  const reactor = subgraph.reactor;

  return ({
    Query: {
      <%- h.changeCase.pascal(documentType) %>: async (_: any, args: any, ctx: any) => {
        return {
          getDocument: async (args: any) => {
            const driveId: string = args.driveId || DEFAULT_DRIVE_ID;
            const docId: string = args.docId || "";
            const doc = await reactor.getDocument(driveId, docId);
            if (!doc) {
              throw new DocumentNotFoundError(docId);
            }

            return {
              driveId: driveId,
              ...doc,
              ...doc.header,
              state: doc.state.global,
              stateJSON: doc.state.global,
              revision: doc.header.revision["global"] ?? 0,
            };
          },
          getDocuments: async (args: any) => {
            const driveId: string = args.driveId || DEFAULT_DRIVE_ID;
            const docsIds = await reactor.getDocuments(driveId);
            if (!docsIds) {
              throw new DocumentNotFoundError(driveId);
            }

            const docs = await Promise.all(
              docsIds.map(async (docId) => {
                const doc = await reactor.getDocument(driveId, docId);
                if (!doc) {
                  return null;
                }

                return {
                  driveId: driveId,
                  ...doc,
                  ...doc.header,
                  state: doc.state.global,
                  stateJSON: doc.state.global,
                  revision: doc.header.revision["global"] ?? 0,
                };
              }),
            );

            return docs.filter(
              (doc) => doc && doc.header.documentType === "<%- documentTypeId %>",
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
              syncId: generateId(), 
            },
            { 
              branch: "main", 
              scope: "local", 
              syncId: generateId(), 
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
            if (!doc) {
              throw new DocumentNotFoundError(docId);
            }

            await reactor.addAction(
                driveId,
                docId,
                actions.<%- h.changeCase.camel(op.name) %>({...args.input})
            );
            
            return (doc.header.revision["global"] ?? 0) + 1;
        },

<%_ })}); %>
    },
  });
};
