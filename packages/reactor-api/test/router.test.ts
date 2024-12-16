import express from "express";
import { describe, expect, it } from "vitest";
import { buildSubgraphSchema } from "@apollo/subgraph";
import * as DocumentModelsLibs from "document-model-libs/document-models";
import { DocumentModel } from "document-model/document";
import { module as DocumentModelLib } from "document-model/document-model";
import { DocumentDriveServer } from "document-drive";
import { SubgraphManager } from "src";
import { getKnexClient } from "src/utils/get-knex-client";

const documentModels = [
  DocumentModelLib,
  ...Object.values(DocumentModelsLibs),
] as DocumentModel[];

describe("Reactor Router", () => {
  it("should be initialized", async () => {
    const app = express();
    const knex = getKnexClient();
    const reactor = new DocumentDriveServer(documentModels);
    const reactorRouter = new SubgraphManager("/", app, reactor, knex);
    await expect(reactorRouter.init()).resolves.toBeUndefined();
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
