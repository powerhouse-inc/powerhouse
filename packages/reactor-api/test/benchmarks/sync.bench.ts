import { RealWorldAssets } from "@sky-ph/atlas/document-models";
import {
  DocumentDriveServer,
  generateUUID,
  InternalTransmitterUpdate,
  IReceiver,
} from "document-drive";
import { MemoryStorage } from "document-drive/storage/memory";
import {
  module as DocumentDrive,
  generateAddNodeAction,
  ListenerFilter,
} from "document-model-libs/document-drive";
import {
  Document,
  DocumentModel,
  OperationScope,
} from "document-model/document";

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
  const documentModels = Object.values([
    DocumentDrive,
    RealWorldAssets,
  ]) as DocumentModel[];
  const document = await RealWorldAssets.utils.loadFromFile(
    "test/data/BlocktowerAndromeda.zip",
  );

  bench(
    "Load PHDM into Document Drive",
    async () => {
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
      const documentId = generateUUID();

      const driveA = await serverA.addDrive({
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

      // loads document in drive A
      const addFileAction = generateAddNodeAction(
        driveA.state.global,
        {
          documentType: document.documentType,
          id: documentId,
          name: "BlocktowerAndromeda",
        },
        ["global"],
      );
      await serverA.addDriveAction(driveAId, addFileAction);

      const result = await serverA.addOperations(
        driveAId,
        documentId,
        document.operations.global,
      );

      if (result.error) {
        throw result.error;
      }

      const lastOperation = document.operations.global.at(-1);
      const lastLoadedOperation = result.operations.at(-1);
      if (
        JSON.stringify(lastOperation) !== JSON.stringify(lastLoadedOperation)
      ) {
        throw new Error("Document operations  mismatch");
      }
    },
    { throws: true },
  );
});
