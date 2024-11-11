import { drizzle } from "drizzle-orm/connect";
import { type GraphQLResolverMap } from "@apollo/subgraph/dist/schema-helper";
import {
  addSubgraph,
  createSchema,
  registerInternalListener,
  setAdditionalContextFields,
} from "@powerhousedao/reactor-api";
import * as searchListener from "@powerhousedao/general-document-indexer";
import { IDocumentDriveServer } from "document-drive/server";

export type DocumentIndexerOptions = {
  reactor: IDocumentDriveServer;
  path: string;
};

export async function addDocumentIndexer(options: DocumentIndexerOptions) {
  const db = await drizzle("pglite", options.path);
  setAdditionalContextFields({ db });

  // register general document indexer listener
  await registerInternalListener({
    name: "search",
    options: searchListener.options,
    transmit: (strands) => searchListener.transmit(strands, db),
  });

  // add general document indexer subgraph
  await addSubgraph({
    getSchema: () =>
      createSchema(
        options.reactor,
        searchListener.resolvers as GraphQLResolverMap,
        searchListener.typeDefs,
      ),
    name: "search/:drive",
  });
}
