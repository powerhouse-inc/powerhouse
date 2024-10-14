import * as DocumentModelsLibs from "document-model-libs/document-models";
import { DocumentModel } from "document-model/document";
import { module as DocumentModelLib } from "document-model/document-model";
import { describe, expect, it } from "vitest";
import { DocumentDriveServer } from "../../document-drive/src/server";
import { initReactorRouter, reactorRouter } from "../src/router";

const documentModels = [
  DocumentModelLib,
  ...Object.values(DocumentModelsLibs),
] as DocumentModel[];

describe("Reactor Router", () => {
  it("should be initialized", async () => {
    await initReactorRouter(new DocumentDriveServer(documentModels));
    const [system, drive] = reactorRouter.stack;
    expect(system).toBeDefined();
    expect(drive).toBeDefined();
    expect("/system").toMatch(system.regexp);
    expect("/drive").toMatch(drive.regexp);
  });
});
