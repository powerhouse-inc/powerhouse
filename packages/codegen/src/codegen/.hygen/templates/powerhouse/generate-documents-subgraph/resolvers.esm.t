---
to: "<%= rootDir %>/<%= h.changeCase.param(subgraph) %>/resolvers.ts"
force: true
---
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { type Subgraph } from "@powerhousedao/reactor-api";
import { toPascalCase } from "document-drive/utils/misc";

const DEFAULT_DRIVE_ID = "powerhouse";

export const getResolvers = (subgraph: Subgraph) => {
  const reactor = subgraph.reactor;

  return ({
    Query: {
      document: async (_: any, args: any) => {
        const driveId: string = args.driveId || DEFAULT_DRIVE_ID;
        const docId: string = args.docId || "";
        const doc = await reactor.getDocument(driveId, docId);
        if (!doc) {
          throw new Error("Document not found");
        }
        const parts = doc.documentType.split("/");
        const typeName = toPascalCase(parts[parts.length - 1]);

        const response = {
          id: docId,
          ...doc,
          state: doc.state.global,
          stateJson: JSON.stringify(doc.state.global),
          __typename: typeName,
        };

        return response;
      },
    },
  });
};
