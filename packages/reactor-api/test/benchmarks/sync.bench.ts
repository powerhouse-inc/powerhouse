import {
  DocumentDriveServer,
  generateUUID,
  InternalTransmitterUpdate,
  IReceiver,
} from "document-drive";
import { MemoryStorage } from "document-drive/storage/memory";
import { ListenerFilter } from "document-model-libs/document-drive";
import * as documentModelsMap from "document-model-libs/document-models";
import {
  Document,
  DocumentModel,
  OperationScope,
} from "document-model/document";
import { utils } from "document-model/document-model";

import { beforeAll, bench, describe } from "vitest";

class TestReceiver<
  T extends Document = Document,
  S extends OperationScope = OperationScope,
> implements IReceiver<T, S>
{
  async onStrands(strands: InternalTransmitterUpdate<T, S>[]) {
    return Promise.resolve();
  }

  async onDisconnect() {
    return Promise.resolve();
  }
}

beforeAll(async () => {});

describe("Document Drive", async () => {
  const documentModels = Object.values(documentModelsMap) as DocumentModel[];
  const document = await utils.loadFromFile(
    "test/data/BlocktowerAndromeda.zip",
  );

  bench("Load PHDM into Document Drive", async () => {
    const serverA = new DocumentDriveServer(
      documentModels,
      new MemoryStorage(),
    );
    await serverA.initialize();

    const serverB = new DocumentDriveServer(
      documentModels,
      new MemoryStorage(),
    );
    await serverB.initialize();

    const driveAId = generateUUID();
    await serverA.addDrive({
      global: {
        id: driveAId,
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

    const driveBId = generateUUID();
    const driveB = await serverB.addDrive({
      global: {
        id: driveBId,
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

    // listener!
    const filter: ListenerFilter = {
      branch: ["*"],
      documentId: ["*"],
      documentType: ["*"],
      scope: ["*"],
    };

    const receiver = new TestReceiver();
    await serverA.addInternalListener(driveAId, receiver, {
      listenerId: generateUUID(),
      label: "Test Listener",
      block: false,
      filter,
    });

    await serverB.addInternalListener(driveBId, receiver, {
      listenerId: generateUUID(),
      label: "Test Listener",
      block: false,
      filter,
    });

    await serverA.addOperations(
      driveAId,
      document.state.global.id,
      document.operations.global,
    );

    // magic number for magic data
    if (645 !== document.operations.global.length) {
      throw new Error("Document operations length mismatch");
    }
  });
});
