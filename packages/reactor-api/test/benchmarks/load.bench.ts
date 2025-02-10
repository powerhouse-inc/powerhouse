import { DocumentDriveServer, generateUUID } from "document-drive";
import { MemoryStorage } from "document-drive/storage/memory";
import * as documentModelsMap from "document-model-libs/document-models";
import { DocumentModel } from "document-model/document";
import { utils } from "document-model/document-model";

import { beforeAll, bench, describe } from "vitest";

beforeAll(async () => {});

describe("Document Drive", async () => {
  const documentModels = Object.values(documentModelsMap) as DocumentModel[];
  const document = await utils.loadFromFile(
    "test/data/BlocktowerAndromeda.zip",
  );

  bench("Load PHDM into Document Drive", async () => {
    const server = new DocumentDriveServer(documentModels, new MemoryStorage());
    await server.initialize();

    const drive = await server.addDrive({
      global: {
        id: generateUUID(),
        name: "Test Drive",
        icon: null,
        slug: null,
      },
      local: {
        availableOffline: false,
        sharingType: "PRIVATE",
        listeners: [],
        triggers: [],
      },
    });

    await server.addOperations(
      drive.state.global.id,
      document.state.global.id,
      document.operations.global,
    );

    // magic number for magic data
    if (645 !== document.operations.global.length) {
      throw new Error("Document operations length mismatch");
    }
  });
});
