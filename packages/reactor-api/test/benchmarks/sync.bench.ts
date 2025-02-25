import { RealWorldAssets } from "@sky-ph/atlas/document-models";
import {
  driveDocumentModelModule,
  generateAddNodeAction,
  generateUUID,
  InternalTransmitterUpdate,
  IReceiver,
  ListenerFilter,
  ReactorBuilder,
} from "document-drive";
import { DocumentModelModule, PHDocument } from "document-model";

import { beforeAll, bench, describe } from "vitest";

class TestReceiver implements IReceiver {
  async onStrands(strands: InternalTransmitterUpdate<PHDocument>[]) {
    return Promise.resolve();
  }

  async onDisconnect() {
    return Promise.resolve();
  }
}

beforeAll(async () => {});

describe("Document Drive", async () => {
  const documentModels = Object.values([
    driveDocumentModelModule,
    RealWorldAssets,
  ]) as DocumentModelModule[];
  const document = await RealWorldAssets.utils.loadFromFile(
    "test/data/BlocktowerAndromeda.zip",
  );

  bench(
    "Load PHDM into Document Drive",
    async () => {
      const serverA = new ReactorBuilder(documentModels).build();
      await serverA.initialize();

      const serverB = new ReactorBuilder(documentModels).build();
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
