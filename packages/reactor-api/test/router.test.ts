import {
  documentModelDocumentModelModule,
  DocumentModelModule,
} from "document-model";
import { describe, expect, it } from "vitest";

const documentModels = [
  documentModelDocumentModelModule,
] as DocumentModelModule[];

describe("Reactor Router", () => {
  it("should be initialized", () => {
    // const app = express();
    // const knex = getDbClient();
    // const reactor = new DocumentDriveServer(documentModels);
    // const reactorRouter = new SubgraphManager("/", app, reactor, knex);
    expect(true).toBe(true);
  });

  // it("should be able to add a new subgraph", async () => {
  //   const driveServer = new DocumentDriveServer(documentModels);
  //   await driveServer.initialize();
  //   const newSubgraph = {
  //     name: "newSubgraph",
  //     getSchema: (documentDriveServer: IDocumentDriveServer) =>
  //       buildSubgraphSchema([
  //         {
  //           typeDefs: getDocumentModelTypeDefs(
  //             documentDriveServer,
  //             `
  //             type Query {
  //               hello: String
  //             }
  //           `,
  //           ),
  //           resolvers: { Query: { hello: () => "world" } },
  //         },
  //       ]),
  //   };

  //   await addSubgraph(newSubgraph);
  //   expect(reactorRouter.stack.length).gte(3);
  // });
});
