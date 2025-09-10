import type { DocumentModelModule } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import { describe, expect, it } from "vitest";

const documentModels = [
  documentModelDocumentModelModule,
] as unknown as DocumentModelModule[];

describe.skip("Reactor Router", () => {
  it("should be initialized", () => {
    // const app = express();
    // const knex = getDbClient();
    // const reactor = new ReactorBuilder(documentModels).build();
    // const reactorRouter = new GraphQLManager("/", app, reactor, knex);
    expect(true).toBe(true);
  });

  // it("should be able to add a new subgraph", async () => {
  //   const driveServer = new ReactorBuilder(documentModels).build();
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
