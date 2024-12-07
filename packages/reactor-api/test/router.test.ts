import express from "express";
import { describe, expect, it } from "vitest";
import { buildSubgraphSchema } from "@apollo/subgraph";
import * as DocumentModelsLibs from "document-model-libs/document-models";
import { DocumentModel } from "document-model/document";
import { module as DocumentModelLib } from "document-model/document-model";
import {
  IDocumentDriveServer,
  DocumentDriveServer,
} from "../../document-drive/src/server";
import { addSubgraph } from "../src/index";
import { initReactorRouter, reactorRouter } from "../src/router";
import { getDocumentModelTypeDefs } from "../src/utils/create-schema";

const documentModels = [
  DocumentModelLib,
  ...Object.values(DocumentModelsLibs),
] as DocumentModel[];

describe("Reactor Router", () => {
  it("should be initialized", async () => {
    const app = express();
    await initReactorRouter("/", app, new DocumentDriveServer(documentModels));
    const [system, drive] = reactorRouter.stack;
    expect(system).toBeDefined();
    expect(drive).toBeDefined();
    expect("/system").toMatch(system.regexp);
    expect("/drive").toMatch(drive.regexp);
  });

  it("should be able to add a new subgraph", async () => {
    const driveServer = new DocumentDriveServer(documentModels);
    await driveServer.initialize();
    const newSubgraph = {
      name: "newSubgraph",
      getSchema: (documentDriveServer: IDocumentDriveServer) =>
        buildSubgraphSchema([
          {
            typeDefs: getDocumentModelTypeDefs(
              documentDriveServer,
              `
              type Query {
                hello: String
              }
            `,
            ),
            resolvers: { Query: { hello: () => "world" } },
          },
        ]),
    };

    await addSubgraph(newSubgraph);
    expect(reactorRouter.stack.length).gte(3);
  });
});
