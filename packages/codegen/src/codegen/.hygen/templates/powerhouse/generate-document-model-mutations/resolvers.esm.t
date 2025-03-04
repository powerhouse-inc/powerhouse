---
to: "<%= rootDir %>/<%= h.changeCase.param(subgraph) %>/resolvers.ts"
force: true
---
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Subgraph } from "@powerhousedao/reactor-api";
import { actions } from "../../document-models/<%- h.changeCase.param(documentType) %>";
import { actions as driveActions } from "document-model-libs/document-drive";
import { utils as docUtils } from "document-model";

export const getResolvers = (subgraph: Subgraph, driveId: string) => {
  const reactor = subgraph.reactor;

  return ({
    Mutation: {

      <%- h.changeCase.pascal(documentType) %>_createDocument: async (_: any, args: any) => {
        const docId = docUtils.generateId();
        
        await reactor.addDriveAction(driveId, driveActions.addFile({
          id: docId,
          name: args.name,
          documentType: "<%- documentTypeId %>",
          synchronizationUnits:[
            { 
              branch: "main", 
              scope: "global", 
              syncId: docUtils.hashKey(), 
            },
            { 
              branch: "main", 
              scope: "local", 
              syncId: docUtils.hashKey(), 
            }
          ],
        }));

        return docId;
      },

<% modules.forEach(module => { _%>
<% module.operations.forEach(op => { _%>
        <%- h.changeCase.pascal(documentType) + '_' + h.changeCase.camel(op.name) 
        %>: async (_: any, args: any) => {
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
    }
  });
};
